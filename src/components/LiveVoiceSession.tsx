import { User } from 'firebase/auth';
import { Loader2, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AiAssistantContext, buildLiveVoiceWsUrl } from '../services/aiClient';

interface LiveVoiceSessionProps {
  user: User;
  context: AiAssistantContext;
}

interface TranscriptEntry {
  id: string;
  speaker: 'You' | 'SafeHer Live';
  text: string;
}

function pcmFloatToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 / 32768;
  }
  return float32;
}

export function LiveVoiceSession({ user, context }: LiveVoiceSessionProps) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const mutedRef = useRef(false);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  mutedRef.current = isMuted;

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript.length]);

  const stopSession = () => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // Ignore already stopped
      }
    });
    activeSourcesRef.current.clear();

    try {
      processorRef.current?.disconnect();
    } catch {
      // Ignore
    }
    try {
      sourceNodeRef.current?.disconnect();
    } catch {
      // Ignore
    }
    processorRef.current = null;
    sourceNodeRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (inputCtxRef.current) {
      void inputCtxRef.current.close();
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      void outputCtxRef.current.close();
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }

    nextStartTimeRef.current = 0;
    setStatus('idle');
  };

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  const schedulePlaybackChunk = (base64Audio: string) => {
    const outCtx = outputCtxRef.current;
    if (!outCtx) return;

    const samples = base64PcmToFloat32(base64Audio);
    if (samples.length === 0) return;

    const buffer = outCtx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const src = outCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(outCtx.destination);

    const startTime = Math.max(outCtx.currentTime, nextStartTimeRef.current);
    src.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;

    activeSourcesRef.current.add(src);
    src.onended = () => {
      activeSourcesRef.current.delete(src);
    };
  };

  const appendTranscript = (speaker: 'You' | 'SafeHer Live', text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: `${last.text} ${clean}`.trim(),
        };
        return updated;
      }
      return [...prev, { id: `${Date.now()}-${Math.random()}`, speaker, text: clean }];
    });
  };

  const startSession = async () => {
    setErrorMsg(null);
    setStatus('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      await inputCtx.resume();
      await outputCtx.resume();
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const idToken = await user.getIdToken();
      const ws = new WebSocket(buildLiveVoiceWsUrl(idToken));
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(inputCtx.destination);

        sourceNodeRef.current = source;
        processorRef.current = processor;

        processor.onaudioprocess = (ev) => {
          if (mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
          const pcm = ev.inputBuffer.getChannelData(0);
          const base64 = pcmFloatToBase64(pcm);
          ws.send(JSON.stringify({ audio: base64 }));
        };
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            ready?: boolean;
            audio?: string;
            interrupted?: boolean;
            inputTranscript?: string;
            outputTranscript?: string;
            error?: string;
          };

          if (msg.ready) {
            setStatus('connected');
            const summary = JSON.stringify({
              origin: context.originLabel,
              destination: context.destinationLabel,
              timeOfTravel: context.timeOfTravel,
              recommendedRoute: context.routes?.[0]?.name,
              recommendedScore: context.routes?.[0]?.overallScore,
              nearestPolice: context.routes?.[0]?.nearestPoliceName,
              activeJourney: context.activeJourney?.shareCode || null,
            });
            ws.send(JSON.stringify({ contextSummary: summary }));
          }
          if (msg.audio) {
            schedulePlaybackChunk(msg.audio);
          }
          if (msg.interrupted) {
            activeSourcesRef.current.forEach((s) => {
              try {
                s.stop();
              } catch {
                // Ignore
              }
            });
            activeSourcesRef.current.clear();
            if (outputCtxRef.current) {
              nextStartTimeRef.current = outputCtxRef.current.currentTime;
            }
          }
          if (msg.inputTranscript) {
            appendTranscript('You', msg.inputTranscript);
          }
          if (msg.outputTranscript) {
            appendTranscript('SafeHer Live', msg.outputTranscript);
          }
          if (msg.error) {
            setErrorMsg(msg.error);
            setStatus('error');
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        setErrorMsg('Live voice WebSocket connection failed.');
        stopSession();
        setStatus('error');
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          stopSession();
        }
      };
    } catch {
      setErrorMsg('Microphone permission is required for real-time voice conversations.');
      stopSession();
      setStatus('error');
    }
  };

  return (
    <div className="flex-1 flex flex-col p-5 space-y-4 overflow-hidden">
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-950">
              Real-Time Voice Companion
            </h3>
            <p className="text-[11px] text-slate-500">
              Hands-free bidirectional audio via Gemini 3.8 Live (16kHz in · 24kHz out)
            </p>
          </div>
          <span
            className={`text-[11px] font-mono font-semibold ${
              status === 'connected'
                ? 'text-emerald-700'
                : status === 'connecting'
                ? 'text-amber-700'
                : status === 'error'
                ? 'text-red-700'
                : 'text-slate-500'
            }`}
          >
            {status === 'connected'
              ? 'LIVE AUDIO'
              : status === 'connecting'
              ? 'CONNECTING'
              : status === 'error'
              ? 'UNAVAILABLE'
              : 'READY'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {status === 'idle' || status === 'error' ? (
            <button
              type="button"
              onClick={() => void startSession()}
              className="flex-1 py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              <span>Start Live Voice Conversation</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                disabled={status === 'connecting'}
                className={`flex-1 py-2.5 px-3 border rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                  isMuted
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                }`}
              >
                {status === 'connecting' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isMuted ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4 text-teal-700" />
                )}
                <span>
                  {status === 'connecting'
                    ? 'Connecting...'
                    : isMuted
                    ? 'Mic Muted'
                    : 'Mic Active (Tap to Mute)'}
                </span>
              </button>
              <button
                type="button"
                onClick={stopSession}
                className="py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" />
                <span>End</span>
              </button>
            </>
          )}
        </div>

        {errorMsg && <p className="text-xs text-red-700">{errorMsg}</p>}
      </div>

      {/* Live Dual-Speaker Transcript */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {transcript.length === 0 ? (
          <div className="p-4 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 leading-relaxed">
            Tap <strong className="text-slate-900">Start Live Voice Conversation</strong> to speak naturally with SafeHer while walking. You can ask about your safest corridor, nearby police stations, or get calm step-by-step support hands-free.
          </div>
        ) : (
          transcript.map((item) => (
            <div
              key={item.id}
              className={`p-3 rounded-lg text-xs leading-relaxed ${
                item.speaker === 'You'
                  ? 'bg-slate-900 text-white ml-6'
                  : 'bg-slate-50 border border-slate-200 text-slate-800 mr-6'
              }`}
            >
              <span className="block text-[10px] font-semibold opacity-75 mb-0.5">
                {item.speaker}
              </span>
              {item.text}
            </div>
          ))
        )}
        <div ref={transcriptEndRef} />
      </div>
    </div>
  );
}
