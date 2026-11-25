import { User } from 'firebase/auth';
import {
  AlertOctagon,
  AlertTriangle,
  Bot,
  ExternalLink,
  Loader2,
  MapPin,
  Mic,
  PhoneCall,
  Send,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AiAssistantContext, sendAiChatMessage } from '../services/aiClient';
import {
  AiActionType,
  AiChatMessage,
  AiChatRole,
  EmergencyContact,
} from '../types/safeher';
import { LiveVoiceSession } from './LiveVoiceSession';

interface SafeHerAiDrawerProps {
  isOpen: boolean;
  initialMode?: 'chat' | 'voice';
  onOpen: (mode?: 'chat' | 'voice') => void;
  onClose: () => void;
  user: User;
  context: AiAssistantContext;
  contacts: EmergencyContact[];
  pendingPrompt: string | null;
  onConsumePendingPrompt: () => void;
  onAction: (actionType: AiActionType) => void;
}

const ROLE_OPTIONS: { id: AiChatRole; label: string; modelTag: string }[] = [
  { id: 'analyst', label: 'Safety Analyst', modelTag: 'gemini-4-hydrogen' },
  { id: 'fast', label: 'Fast Triage', modelTag: 'gemini-3.1-flash-lite' },
  { id: 'maps', label: 'Google Maps', modelTag: 'gemini-4-hydrogen + Maps' },
];

const QUICK_PROMPTS_BY_ROLE: Record<AiChatRole, string[]> = {
  analyst: [
    'Why is the recommended route safer than the alternatives?',
    'Identify poorly lit areas or hazard spots along these routes.',
    'I feel unsafe — give me emergency steps, nearest police, and contacts.',
  ],
  fast: [
    'Quick check: what is my safest route and nearest police station?',
    'Fast 3-step checklist for walking alone at night.',
  ],
  maps: [
    'Find nearby police stations and 24-hour hospitals around my starting location.',
    'List open metro stations or busy public hubs near my destination.',
  ],
};

export function SafeHerAiDrawer({
  isOpen,
  initialMode = 'chat',
  onOpen,
  onClose,
  user,
  context,
  contacts,
  pendingPrompt,
  onConsumePendingPrompt,
  onAction,
}: SafeHerAiDrawerProps) {
  const [drawerMode, setDrawerMode] = useState<'chat' | 'voice'>(initialMode);
  const [chatRole, setChatRole] = useState<AiChatRole>('analyst');
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      text: 'I am SafeHer AI. Switch roles to compare route indicators (Safety Analyst), get instant triage (Fast Triage), or verify nearby police stations and safe venues via Google Maps—or tap Live Voice for real-time audio conversation.',
      dataBasis: 'verified_context',
      disclaimer:
        'Route indicators come from OpenStreetMap, OSRM, Google Maps grounding, and SafeHer community reports; no route can be guaranteed risk-free.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDrawerMode(initialMode);
  }, [initialMode, isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isOpen, drawerMode]);

  const submitPrompt = async (promptText: string, overrideRole?: AiChatRole) => {
    const trimmed = promptText.trim();
    if (!trimmed || sending) return;

    const activeRole = overrideRole || chatRole;
    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setSending(true);
    setAiError(null);

    const res = await sendAiChatMessage(user, nextHistory, context, activeRole);
    setSending(false);

    if (!res.ok) {
      setAiError(res.error);
      const nearest = context.routes?.[0]?.nearestPoliceName || 'local police control';
      setMessages((prev) => [
        ...prev,
        {
          id: `a-fallback-${Date.now()}`,
          role: 'assistant',
          text: `The Gemini AI service is temporarily unavailable (${res.error}). Based directly on your loaded SafeHer data: ${
            context.routes && context.routes.length > 0
              ? `your highest-scoring route is "${context.routes[0].name}" (${context.routes[0].overallScore}/100) near ${nearest}.`
              : 'you can trigger Emergency SOS or call 112 / 1091 immediately if you need urgent help.'
          }`,
          dataBasis: 'verified_context',
          suggestedActions: [
            { type: 'open_sos', label: 'Open Emergency SOS' },
            { type: 'view_contacts', label: 'View Family Contacts' },
          ],
        },
      ]);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: res.data.reply,
        dataBasis: res.data.dataBasis,
        disclaimer: res.data.disclaimer,
        suggestedActions: res.data.suggestedActions,
        mapsPlaces: res.data.mapsPlaces,
        modelUsed: res.data.modelUsed,
      },
    ]);
  };

  useEffect(() => {
    if (isOpen && pendingPrompt) {
      const promptToSend = pendingPrompt;
      onConsumePendingPrompt();
      setDrawerMode('chat');
      void submitPrompt(promptToSend);
    }
  }, [isOpen, pendingPrompt]);

  const routeCount = context.routes?.length || 0;
  const hazardCount = context.nearbyHazardSummaries?.length || 0;

  if (!isOpen) {
    return (
      <div className="fixed bottom-5 right-5 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen('voice')}
          aria-label="Start Live Voice conversation"
          className="inline-flex items-center gap-2 px-3.5 py-3 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-xl shadow-lg transition-colors cursor-pointer"
        >
          <Mic className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">Live Voice</span>
        </button>
        <button
          type="button"
          onClick={() => onOpen('chat')}
          aria-label="Open SafeHer AI Assistant"
          className="inline-flex items-center gap-2 px-4 py-3 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-lg border border-slate-800 transition-colors cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="whitespace-nowrap">SafeHer AI Chat</span>
        </button>
      </div>
    );
  }

  return (
    <aside
      aria-label="SafeHer AI Assistant"
      className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-sm font-bold text-slate-950">
                SafeHer AI Assistant
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {routeCount} route{routeCount === 1 ? '' : 's'} · {context.timeOfTravel || 'night'} window · {hazardCount} report{hazardCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Assistant"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher: Multi-Turn Chat vs Live Voice */}
        <div className="grid grid-cols-2 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setDrawerMode('chat')}
            className={`py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              drawerMode === 'chat'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Multi-Turn Chat &amp; Maps
          </button>
          <button
            type="button"
            onClick={() => setDrawerMode('voice')}
            className={`py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer ${
              drawerMode === 'voice'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Mic className="w-3.5 h-3.5 text-teal-700" />
            <span>Live Voice</span>
          </button>
        </div>
      </div>

      {/* Emergency Direct Strip */}
      <div className="px-5 py-2 bg-red-50/70 border-b border-red-100 flex items-center justify-between gap-2 text-xs">
        <span className="text-red-900 font-medium">
          <ShieldAlert className="w-3.5 h-3.5 inline mr-1 text-red-600" />
          Immediate danger?
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="tel:112"
            className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-red-200 text-red-700 font-semibold rounded hover:bg-red-50"
          >
            <PhoneCall className="w-3 h-3" />
            <span>112</span>
          </a>
          <button
            type="button"
            onClick={() => onAction('open_sos')}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded cursor-pointer"
          >
            <AlertOctagon className="w-3 h-3" />
            <span>SOS</span>
          </button>
        </div>
      </div>

      {drawerMode === 'voice' ? (
        <LiveVoiceSession user={user} context={context} />
      ) : (
        <>
          {/* Chatbot Role Selector */}
          <div className="px-5 py-2.5 border-b border-slate-100 bg-white">
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setChatRole(role.id)}
                  title={role.modelTag}
                  className={`py-1.5 px-1 text-[11px] font-medium rounded-md transition-colors truncate cursor-pointer ${
                    chatRole === role.id
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Message Thread */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[92%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-50 border border-slate-200 text-slate-800'
                  }`}
                >
                  {m.role === 'assistant' && m.dataBasis && (
                    <p className="text-[10px] font-semibold text-teal-700 mb-1">
                      {m.dataBasis === 'google_maps_grounding'
                        ? 'Google Maps Grounding'
                        : m.dataBasis === 'verified_context'
                        ? 'Grounded in Map & Database Data'
                        : m.dataBasis === 'mixed'
                        ? 'Grounded Data + Safety Guidance'
                        : 'General Safety Guidance'}
                      {m.modelUsed ? ` · ${m.modelUsed}` : ''}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{m.text}</p>

                  {/* Extracted Google Maps Grounding Links */}
                  {m.mapsPlaces && m.mapsPlaces.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-200 space-y-1.5">
                      <p className="text-[10px] font-semibold text-slate-700">
                        Verified Google Maps Locations
                      </p>
                      {m.mapsPlaces.map((pl, idx) => (
                        <div key={idx} className="bg-white border border-slate-200 rounded-lg p-2">
                          <a
                            href={pl.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-900"
                          >
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span>{pl.title}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                          {pl.reviewSnippets && pl.reviewSnippets.length > 0 && (
                            <p className="text-[11px] text-slate-600 mt-1">
                              “{pl.reviewSnippets[0]}”
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {m.disclaimer && (
                    <p className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-200">
                      {m.disclaimer}
                    </p>
                  )}

                  {m.suggestedActions && m.suggestedActions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {m.suggestedActions.map((act, idx) => (
                        <button
                          key={`${act.type}-${idx}`}
                          type="button"
                          onClick={() => onAction(act.type)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors cursor-pointer ${
                            act.type === 'open_sos'
                              ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                              : 'bg-white text-slate-800 border-slate-300 hover:border-teal-600'
                          }`}
                        >
                          {act.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                <span>Consulting {ROLE_OPTIONS.find((r) => r.id === chatRole)?.label}...</span>
              </div>
            )}

            {aiError && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                <span>{aiError}</span>
              </div>
            )}

            {contacts.length > 0 && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">Authorized Contacts on File: </span>
                {contacts.map((c) => `${c.name} (${c.relation})`).join(' · ')}
              </div>
            )}
          </div>

          {/* Quick Prompts & Chat Input */}
          <div className="p-4 border-t border-slate-200 bg-white space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS_BY_ROLE[chatRole].map((q, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={sending}
                  onClick={() => void submitPrompt(q)}
                  className="text-left px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitPrompt(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={1000}
                placeholder={
                  chatRole === 'maps'
                    ? 'Ask Google Maps for nearby police, hospitals, transit...'
                    : 'Ask about route safety, hazards, or emergency help...'
                }
                className="flex-1 h-10 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="Send message to SafeHer AI"
                className="h-10 px-3.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-lg inline-flex items-center justify-center cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </>
      )}
    </aside>
  );
}
