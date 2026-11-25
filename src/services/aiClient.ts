import { User } from 'firebase/auth';
import {
  AiChatMessage,
  AiChatResponse,
  AiChatRole,
  AiRouteAnalysisResult,
  AnalyzedRoute,
  AppTab,
  EmergencyContact,
  Journey,
  MapsGroundingResult,
  TimeOfTravel,
  TravelMode,
  UnsafeReport,
} from '../types/safeher';

export type AiApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; unavailable: boolean };

export interface AiAssistantContext {
  activeTab: AppTab;
  originLabel?: string;
  destinationLabel?: string;
  originCoords?: { lat: number; lng: number };
  travelMode?: TravelMode;
  timeOfTravel?: TimeOfTravel;
  routes?: Array<{
    id: string;
    name: string;
    distanceMeters: number;
    durationMinutes: number;
    overallScore: number;
    litRoadPct: number;
    counts: AnalyzedRoute['breakdown']['counts'];
    nearestPoliceName: string;
    nearestPoliceDistanceM: number | null;
    dataSource: string;
    isRecommended: boolean;
  }>;
  selectedRouteName?: string;
  activeJourney?: {
    shareCode: string;
    status: string;
    progressPct: number;
    etaMinutes: number;
    originLabel: string;
    destinationLabel: string;
  } | null;
  authorizedEmergencyContacts?: Array<{ name: string; relation: string }>;
  nearbyHazardSummaries?: Array<{
    locationLabel: string;
    category: string;
    severity: string;
    timeConcern: string;
    status: string;
  }>;
}

export async function fetchAiRouteAnalysis(
  user: User,
  params: {
    originLabel: string;
    destinationLabel: string;
    travelMode: TravelMode;
    timeOfTravel: TimeOfTravel;
    routes: AnalyzedRoute[];
    communityReports: UnsafeReport[];
  }
): Promise<AiApiResult<AiRouteAnalysisResult>> {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/ai/analyze-routes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        originLabel: params.originLabel,
        destinationLabel: params.destinationLabel,
        travelMode: params.travelMode,
        timeOfTravel: params.timeOfTravel,
        routes: params.routes.map((r) => ({
          id: r.id,
          name: r.name,
          distanceMeters: r.distanceMeters,
          durationSeconds: r.durationSeconds,
          isRecommended: r.isRecommended,
          breakdown: r.breakdown,
          nearbyReports: r.nearbyReports.map((rep) => ({
            locationLabel: rep.locationLabel,
            category: rep.category,
            severity: rep.severity,
            timeConcern: rep.timeConcern,
            status: rep.status,
            description: rep.description,
          })),
        })),
        communityReports: params.communityReports.slice(0, 30).map((rep) => ({
          locationLabel: rep.locationLabel,
          category: rep.category,
          severity: rep.severity,
          timeConcern: rep.timeConcern,
          status: rep.status,
          description: rep.description,
        })),
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      return {
        ok: false,
        error: errBody.error || `AI analysis unavailable (HTTP ${res.status}).`,
        unavailable: res.status === 503 || errBody.code === 'AI_UNAVAILABLE',
      };
    }

    const json = (await res.json()) as { analysis: AiRouteAnalysisResult };
    return { ok: true, data: json.analysis };
  } catch {
    return {
      ok: false,
      error: 'Unable to connect to SafeHer AI service. Showing deterministic route metrics.',
      unavailable: true,
    };
  }
}

export async function fetchMapsSafePlaces(
  user: User,
  queryText: string,
  lat?: number,
  lng?: number
): Promise<AiApiResult<MapsGroundingResult>> {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/ai/maps-grounding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        query: queryText,
        lat,
        lng,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      return {
        ok: false,
        error: errBody.error || `Google Maps grounding unavailable (HTTP ${res.status}).`,
        unavailable: res.status === 503 || errBody.code === 'AI_UNAVAILABLE',
      };
    }

    const json = (await res.json()) as MapsGroundingResult;
    return { ok: true, data: json };
  } catch {
    return {
      ok: false,
      error: 'Unable to reach Google Maps grounding service right now.',
      unavailable: true,
    };
  }
}

export async function sendAiChatMessage(
  user: User,
  messages: AiChatMessage[],
  context: AiAssistantContext,
  chatRole: AiChatRole = 'analyst'
): Promise<AiApiResult<AiChatResponse>> {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, text: m.text })),
        context,
        chatRole,
        lat: context.originCoords?.lat,
        lng: context.originCoords?.lng,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      return {
        ok: false,
        error: errBody.error || `AI Assistant unavailable (HTTP ${res.status}).`,
        unavailable: res.status === 503 || errBody.code === 'AI_UNAVAILABLE',
      };
    }

    const json = (await res.json()) as { result: AiChatResponse };
    return { ok: true, data: json.result };
  } catch {
    return {
      ok: false,
      error: 'Unable to reach SafeHer AI Assistant right now.',
      unavailable: true,
    };
  }
}

export function buildLiveVoiceWsUrl(idToken: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/ai/live?token=${encodeURIComponent(idToken)}`;
}

export function buildAiContextSnapshot(params: {
  activeTab: AppTab;
  originLabel?: string;
  destinationLabel?: string;
  originCoords?: { lat: number; lng: number };
  travelMode?: TravelMode;
  timeOfTravel?: TimeOfTravel;
  routes: AnalyzedRoute[];
  selectedRoute: AnalyzedRoute | null;
  activeJourney: Journey | null;
  contacts: EmergencyContact[];
  unsafeReports: UnsafeReport[];
}): AiAssistantContext {
  return {
    activeTab: params.activeTab,
    originLabel: params.originLabel,
    destinationLabel: params.destinationLabel,
    originCoords: params.originCoords,
    travelMode: params.travelMode,
    timeOfTravel: params.timeOfTravel,
    routes: params.routes.map((r) => ({
      id: r.id,
      name: r.name,
      distanceMeters: r.distanceMeters,
      durationMinutes: Math.max(1, Math.round(r.durationSeconds / 60)),
      overallScore: r.breakdown.overallScore,
      litRoadPct: r.breakdown.litRoadPct,
      counts: r.breakdown.counts,
      nearestPoliceName: r.breakdown.nearestPoliceName,
      nearestPoliceDistanceM: r.breakdown.nearestPoliceDistanceM,
      dataSource: r.breakdown.dataSource,
      isRecommended: r.isRecommended,
    })),
    selectedRouteName: params.selectedRoute?.name,
    activeJourney: params.activeJourney
      ? {
          shareCode: params.activeJourney.shareCode,
          status: params.activeJourney.status,
          progressPct: params.activeJourney.progressPct,
          etaMinutes: params.activeJourney.etaMinutes,
          originLabel: params.activeJourney.originLabel,
          destinationLabel: params.activeJourney.destinationLabel,
        }
      : null,
    authorizedEmergencyContacts: params.contacts.map((c) => ({
      name: c.name,
      relation: c.relation,
    })),
    nearbyHazardSummaries: params.unsafeReports.slice(0, 15).map((r) => ({
      locationLabel: r.locationLabel,
      category: r.category,
      severity: r.severity,
      timeConcern: r.timeConcern,
      status: r.status,
    })),
  };
}
