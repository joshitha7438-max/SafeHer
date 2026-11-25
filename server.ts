import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import type { LiveServerMessage } from '@google/genai';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin strictly for verifying client ID tokens (no IAM required)
const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
let firebaseProjectId = '';
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8')) as {
      projectId?: string;
    };
    firebaseProjectId = raw.projectId || '';
  } catch {
    firebaseProjectId = '';
  }
}

if (firebaseProjectId) {
  if (getApps().length === 0) {
    initializeApp({ projectId: firebaseProjectId });
  } else {
    getApp();
  }
}

interface AuthedRequest extends Request {
  uid?: string;
}

async function requireFirebaseAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication token required.' });
    return;
  }
  const token = header.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Invalid authentication token.' });
    return;
  }
  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: 'Expired or invalid Firebase ID token.' });
  }
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function clampString(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

interface MapsGroundingChunk {
  maps?: {
    uri?: string;
    title?: string;
    placeAnswerSources?: {
      reviewSnippets?: Array<{
        content?: string;
        authorAttribution?: { displayName?: string };
      }>;
    };
  };
}

function extractMapsPlaces(chunks: unknown): Array<{
  title: string;
  uri: string;
  reviewSnippets?: string[];
}> {
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const places: Array<{ title: string; uri: string; reviewSnippets?: string[] }> = [];

  for (const raw of chunks as MapsGroundingChunk[]) {
    const uri = raw?.maps?.uri;
    const title = raw?.maps?.title;
    if (!uri || !title || seen.has(uri)) continue;
    seen.add(uri);

    const snippets = (raw.maps?.placeAnswerSources?.reviewSnippets || [])
      .map((s) => s.content?.trim())
      .filter((s): s is string => Boolean(s))
      .slice(0, 2);

    places.push({
      title,
      uri,
      ...(snippets.length > 0 ? { reviewSnippets: snippets } : {}),
    });
  }
  return places;
}

const ROUTE_ANALYSIS_SYSTEM_INSTRUCTION = `You are SafeHer AI, an analytical women's travel safety advisor.
Your job is to compare candidate routes and community safety reports strictly using the geographic and database facts provided in the prompt JSON.

CRITICAL GROUNDING RULES:
1. ONLY reference route names, distances, durations, safety scores, streetlight counts, lit corridor percentages, shop counts, CCTV counts, police station names/distances, and community hazard reports that exist in the provided input JSON.
2. NEVER invent, guess, or fabricate CCTV cameras, streetlights, police stations, incidents, or crime statistics.
3. Explicitly distinguish between:
   - Verified facts (e.g., mapped OpenStreetMap Overpass nodes and submitted Firestore community reports, noting when dataSource is "corridor-baseline" vs "osm-overpass").
   - Estimates (e.g., the computed 0-100 Safety Score and estimated lit corridor percentage).
   - Unavailable information (e.g., unmapped private security cameras, live foot-traffic density, real-time streetlight outages not yet reported).
4. NEVER make absolute safety guarantees ("100% safe", "completely risk-free", "guaranteed safe"). Use careful phrasing like "stronger available safety indicators" or "better mapped lighting and facility density".
5. Keep insights clear, concise, practical, and helpful for a traveler deciding which route to take.`;

const CHAT_ROLE_INSTRUCTIONS: Record<'analyst' | 'fast' | 'maps', string> = {
  analyst: `You are SafeHer Route Safety Analyst, an analytical women's travel safety advisor.
Base all route, facility, police station, journey, and hazard statements strictly on the attached SafeHer context JSON.
NEVER invent CCTV locations, streetlights, police stations, phone numbers, or incident reports.
Clearly distinguish verified map/database facts from derived estimates and missing data, and never guarantee absolute route safety.
In emergencies (pursuit, harassment, urgent fear), prioritize calm 1-2-3 steps, cite nearest police station from context, reference emergency helplines (112 / 1091), and include an "open_sos" suggestedAction.`,
  fast: `You are SafeHer Fast Safety Triage Assistant. Give concise, high-clarity, immediate answers grounded strictly in the SafeHer context JSON.
Never invent facilities or guarantee absolute safety. In urgent situations, lead with immediate 1-2-3 safety steps and recommend opening Emergency SOS.`,
  maps: `You are SafeHer Google Maps Place Advisor. Use the Google Maps grounding tool to find real, current nearby police stations, 24/7 hospitals, pharmacies, metro/transit hubs, and safe public spaces near the user's coordinates or query. Never fabricate places or URLs, and never guarantee absolute safety.`,
};

const LIVE_VOICE_SYSTEM_INSTRUCTION = `You are SafeHer Live Voice Assistant, a calm, reassuring, practical real-time voice safety companion for women travelers.
Speak clearly in concise sentences suitable for live audio.
Rules:
1. Base any route, nearest police station, or hazard remarks strictly on the trip context shared with you; if something isn't in your context, say you cannot verify it rather than guessing.
2. Never invent CCTV locations, streetlights, or police stations, and never guarantee absolute route safety.
3. If the caller sounds distressed, followed, or unsafe, immediately give calm step-by-step instructions: move toward an open well-lit public venue, call local emergency 112 or Women Helpline 1091, or tap Emergency SOS in SafeHer to alert Police Dispatch and family contacts.`;

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, aiConfigured: Boolean(getGeminiClient()) });
  });

  // 1, 2, 4, 6: AI Smart Route Analysis, Route Recommendation, Hotspot Insights & Personalized Guidance
  app.post('/api/ai/analyze-routes', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Gemini AI service is currently unavailable (missing API key configuration).',
        code: 'AI_UNAVAILABLE',
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const originLabel = clampString(body.originLabel, 160);
    const destinationLabel = clampString(body.destinationLabel, 160);
    const travelMode = body.travelMode === 'driving' ? 'driving' : 'walking';
    const timeOfTravel =
      body.timeOfTravel === 'day' || body.timeOfTravel === 'evening' || body.timeOfTravel === 'night'
        ? body.timeOfTravel
        : 'night';

    const rawRoutes = Array.isArray(body.routes) ? body.routes.slice(0, 6) : [];
    const rawReports = Array.isArray(body.communityReports) ? body.communityReports.slice(0, 40) : [];

    if (!originLabel || !destinationLabel || rawRoutes.length === 0) {
      res.status(400).json({ error: 'Origin, destination, and at least one route are required.' });
      return;
    }

    const groundedPayload = {
      trip: { originLabel, destinationLabel, travelMode, timeOfTravel },
      routes: rawRoutes.map((r: Record<string, unknown>) => ({
        id: clampString(r.id, 40),
        name: clampString(r.name, 100),
        distanceMeters: Number(r.distanceMeters) || 0,
        durationMinutes: Math.max(1, Math.round((Number(r.durationSeconds) || 60) / 60)),
        isRecommendedByScorer: Boolean(r.isRecommended),
        breakdown: r.breakdown,
        nearbyReports: Array.isArray(r.nearbyReports) ? r.nearbyReports.slice(0, 10) : [],
      })),
      areaCommunityReports: rawReports.map((rep: Record<string, unknown>) => ({
        locationLabel: clampString(rep.locationLabel, 160),
        category: clampString(rep.category, 40),
        severity: clampString(rep.severity, 20),
        timeConcern: clampString(rep.timeConcern, 20),
        status: clampString(rep.status, 20),
        description: clampString(rep.description, 240),
      })),
    };

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analyze these candidate travel routes and community safety reports and return the structured safety assessment JSON:\n${JSON.stringify(
          groundedPayload
        )}`,
        config: {
          systemInstruction: ROUTE_ANALYSIS_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendedRouteId: { type: Type.STRING },
              recommendationHeadline: { type: Type.STRING },
              recommendationReasoning: { type: Type.STRING },
              personalizedGuidance: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              routeInsights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    routeId: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    verifiedStrengths: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    estimatedOrLimitedData: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    cautionNotes: { type: Type.STRING },
                  },
                  required: [
                    'routeId',
                    'summary',
                    'verifiedStrengths',
                    'estimatedOrLimitedData',
                    'cautionNotes',
                  ],
                },
              },
              hotspotInsights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    areaLabel: { type: Type.STRING },
                    riskLevel: { type: Type.STRING },
                    insight: { type: Type.STRING },
                    dataBasis: { type: Type.STRING },
                  },
                  required: ['areaLabel', 'riskLevel', 'insight', 'dataBasis'],
                },
              },
              evidenceClassification: {
                type: Type.OBJECT,
                properties: {
                  verifiedSources: { type: Type.ARRAY, items: { type: Type.STRING } },
                  estimatedMetrics: { type: Type.ARRAY, items: { type: Type.STRING } },
                  unavailableData: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['verifiedSources', 'estimatedMetrics', 'unavailableData'],
              },
            },
            required: [
              'recommendedRouteId',
              'recommendationHeadline',
              'recommendationReasoning',
              'personalizedGuidance',
              'routeInsights',
              'hotspotInsights',
              'evidenceClassification',
            ],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const analysis = JSON.parse(rawText);
      res.json({ analysis, model: 'gemini-4-hydrogen' });
    } catch (err) {
      console.error('Gemini analyze-routes error:', err);
      res.status(502).json({
        error: 'Unable to generate AI route analysis at this moment.',
        code: 'AI_UPSTREAM_ERROR',
      });
    }
  });

  // Google Maps Grounding Endpoint (gemini-4-hydrogen + googleMaps tool)
  app.post('/api/ai/maps-grounding', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Google Maps AI grounding is unavailable (missing API key configuration).',
        code: 'AI_UNAVAILABLE',
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const queryText = clampString(body.query, 400);
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!queryText) {
      res.status(400).json({ error: 'Search query is required.' });
      return;
    }

    const hasCoords =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: queryText,
        config: {
          systemInstruction:
            'Identify nearby verified police stations, 24-hour hospitals/pharmacies, transit hubs, and well-known public safe spaces using Google Maps data. Be concise, accurate, and do not guarantee route safety.',
          tools: [{ googleMaps: {} }],
          ...(hasCoords
            ? {
                toolConfig: {
                  retrievalConfig: {
                    latLng: { latitude: lat, longitude: lng },
                  },
                },
              }
            : {}),
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const places = extractMapsPlaces(chunks);
      res.json({
        text: (response.text ?? '').trim(),
        places,
        model: 'gemini-4-hydrogen',
      });
    } catch (err) {
      console.error('Gemini maps-grounding error:', err);
      res.status(502).json({
        error: 'Unable to query Google Maps grounding right now.',
        code: 'AI_UPSTREAM_ERROR',
      });
    }
  });

  // Multi-turn Gemini Chatbot (analyst: gemini-4-hydrogen, fast: gemini-3.1-flash-lite, maps: gemini-4-hydrogen + googleMaps)
  app.post('/api/ai/chat', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'SafeHer AI Assistant is currently unavailable (missing API key configuration).',
        code: 'AI_UNAVAILABLE',
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-14) : [];
    const context = (body.context && typeof body.context === 'object' ? body.context : {}) as Record<
      string,
      unknown
    >;
    const chatRole: 'analyst' | 'fast' | 'maps' =
      body.chatRole === 'fast' || body.chatRole === 'maps' ? body.chatRole : 'analyst';

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const hasCoords =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    if (rawMessages.length === 0) {
      res.status(400).json({ error: 'At least one user message is required.' });
      return;
    }

    const sanitizedMessages = rawMessages
      .map((m: Record<string, unknown>) => ({
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        text: clampString(m.text, 1200),
      }))
      .filter((m) => m.text.length > 0);

    if (sanitizedMessages.length === 0) {
      res.status(400).json({ error: 'Message text cannot be empty.' });
      return;
    }

    const latestMessage = sanitizedMessages[sanitizedMessages.length - 1];
    const priorHistory = sanitizedMessages.slice(0, -1).map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    // Ensure history starts with a 'user' turn for ai.chats.create
    while (priorHistory.length > 0 && priorHistory[0].role !== 'user') {
      priorHistory.shift();
    }

    try {
      // Maps mode uses googleMaps tool without responseMimeType / responseSchema
      if (chatRole === 'maps') {
        const chat = ai.chats.create({
          model: 'gemini-4-hydrogen',
          history: priorHistory,
          config: {
            systemInstruction: `${CHAT_ROLE_INSTRUCTIONS.maps}\n\nTrip Context: ${JSON.stringify(context)}`,
            tools: [{ googleMaps: {} }],
            ...(hasCoords
              ? {
                  toolConfig: {
                    retrievalConfig: {
                      latLng: { latitude: lat, longitude: lng },
                    },
                  },
                }
              : {}),
          },
        });

        const response = await chat.sendMessage({ message: latestMessage.text });
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const mapsPlaces = extractMapsPlaces(chunks);

        res.json({
          result: {
            reply: (response.text ?? 'No Google Maps details found for this query.').trim(),
            dataBasis: 'google_maps_grounding',
            disclaimer:
              'Place details and links come from Google Maps grounding. Verify opening hours before travelling late at night.',
            suggestedActions: [
              { type: 'open_sos', label: 'Emergency SOS' },
              { type: 'focus_recommended_route', label: 'View Recommended Route' },
            ],
            mapsPlaces,
            modelUsed: 'gemini-4-hydrogen',
          },
          model: 'gemini-4-hydrogen',
        });
        return;
      }

      const modelName = chatRole === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
      const systemPromptWithContext = `${CHAT_ROLE_INSTRUCTIONS[chatRole]}\n\nLIVE SAFEHER CONTEXT (strict factual grounding):\n${JSON.stringify(
        context
      )}`;

      const chat = ai.chats.create({
        model: modelName,
        history: priorHistory,
        config: {
          systemInstruction: systemPromptWithContext,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
              dataBasis: {
                type: Type.STRING,
                description: 'One of: verified_context, general_safety_guidance, mixed',
              },
              disclaimer: { type: Type.STRING },
              suggestedActions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {
                      type: Type.STRING,
                      description:
                        'One of: open_sos, view_contacts, start_journey, report_hazard, focus_recommended_route',
                    },
                    label: { type: Type.STRING },
                  },
                  required: ['type', 'label'],
                },
              },
            },
            required: ['reply', 'dataBasis', 'disclaimer', 'suggestedActions'],
          },
        },
      });

      const response = await chat.sendMessage({ message: latestMessage.text });
      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      res.json({
        result: {
          ...parsed,
          modelUsed: modelName,
        },
        model: modelName,
      });
    } catch (err) {
      console.error('Gemini chat error:', err);
      res.status(502).json({
        error: 'SafeHer AI Assistant could not respond right now.',
        code: 'AI_UPSTREAM_ERROR',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);

  // Live API WebSocket Bridge (/api/ai/live) using gemini-3.8-live
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const reqUrl = req.url || '';
    if (!reqUrl.startsWith('/api/ai/live')) {
      return;
    }
    wss.handleUpgrade(req, socket, head, (clientWs) => {
      wss.emit('connection', clientWs, req);
    });
  });

  wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
    const ai = getGeminiClient();
    if (!ai) {
      clientWs.send(JSON.stringify({ error: 'Gemini API key is not configured for Live Voice.' }));
      clientWs.close(4003, 'AI unavailable');
      return;
    }

    let token = '';
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      token = parsedUrl.searchParams.get('token') || '';
    } catch {
      token = '';
    }

    if (!token) {
      clientWs.close(4001, 'Authentication token required');
      return;
    }

    try {
      await getAuth().verifyIdToken(token);
    } catch {
      clientWs.close(4001, 'Invalid Firebase ID token');
      return;
    }

    let session: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let isClosed = false;

    try {
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: LIVE_VOICE_SYSTEM_INSTRUCTION,
        },
        callbacks: {
          onopen: () => {
            if (!isClosed && clientWs.readyState === 1) {
              clientWs.send(JSON.stringify({ ready: true }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (isClosed || clientWs.readyState !== 1) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ inputTranscript: content.inputTranscription.text })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ outputTranscript: content.outputTranscription.text })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err) => {
            console.error('Gemini Live error:', err);
            if (!isClosed && clientWs.readyState === 1) {
              clientWs.send(JSON.stringify({ error: 'Live voice session error.' }));
            }
          },
          onclose: () => {
            if (!isClosed && clientWs.readyState === 1) {
              clientWs.close();
            }
          },
        },
      });
    } catch (err) {
      console.error('Failed to connect Gemini Live:', err);
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ error: 'Unable to start Gemini Live voice session.' }));
        clientWs.close(1011, 'Live connect failed');
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!session || isClosed) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          audio?: string;
          text?: string;
          contextSummary?: string;
        };
        if (msg.audio) {
          session.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.contextSummary) {
          session.sendRealtimeInput({
            text: `Trip safety context (reference silently unless asked): ${clampString(
              msg.contextSummary,
              1500
            )}`,
          });
        } else if (msg.text) {
          session.sendRealtimeInput({
            text: clampString(msg.text, 800),
          });
        }
      } catch {
        // Ignore malformed frame
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      try {
        session?.close();
      } catch {
        // Ignore close errors
      }
    });
  });

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`SafeHer server listening on http://0.0.0.0:${port}`);
  });
}

void createApp();
