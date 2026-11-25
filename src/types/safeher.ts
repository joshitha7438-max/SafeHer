export type AppTab = 'planner' | 'journey' | 'report' | 'police';

export type TravelMode = 'walking' | 'driving';
export type TimeOfTravel = 'day' | 'evening' | 'night';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeoPlace {
  label: string;
  shortName: string;
  lat: number;
  lng: number;
}

export type FacilityCategory = 'streetlight' | 'shop' | 'cctv' | 'police';

export interface SafetyFacility {
  id: string;
  category: FacilityCategory;
  name: string;
  lat: number;
  lng: number;
  distanceToRouteM: number;
}

export interface SafetyCounts {
  streetlights: number;
  shops: number;
  cctv: number;
  police: number;
  hazards: number;
}

export interface SafetyBreakdown {
  overallScore: number;
  streetlightScore: number;
  policeScore: number;
  shopScore: number;
  cctvScore: number;
  hazardPenalty: number;
  litRoadPct: number;
  counts: SafetyCounts;
  nearestPoliceName: string;
  nearestPoliceDistanceM: number | null;
  verdict: 'Recommended Safe Route' | 'Moderate Caution' | 'Elevated Risk';
  reasons: string[];
  dataSource: 'osm-overpass' | 'corridor-baseline';
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
  durationS: number;
}

export interface AnalyzedRoute {
  id: string;
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][]; // [lat, lng]
  steps: RouteStep[];
  facilities: SafetyFacility[];
  nearbyReports: UnsafeReport[];
  breakdown: SafetyBreakdown;
  isRecommended: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  role: 'citizen' | 'police' | 'admin';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EmergencyContact {
  id: string;
  ownerId: string;
  name: string;
  relation: string;
  phone: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type JourneyStatus = 'active' | 'arrived' | 'sos' | 'cancelled';

export interface Journey {
  id: string;
  ownerId: string;
  travelerName: string;
  shareCode: string;
  originLabel: string;
  destinationLabel: string;
  routeName: string;
  safetyScore: number;
  currentLat: number;
  currentLng: number;
  destLat: number;
  destLng: number;
  progressPct: number;
  etaMinutes: number;
  status: JourneyStatus;
  isShared: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type IncidentCategory =
  | 'pursuit'
  | 'harassment'
  | 'poor_lighting'
  | 'stranded'
  | 'medical'
  | 'other';

export type IncidentStatus =
  | 'active'
  | 'acknowledged'
  | 'dispatched'
  | 'resolved'
  | 'cancelled_by_user';

export interface EmergencyIncident {
  id: string;
  reporterId: string;
  reporterName: string;
  journeyId: string;
  category: IncidentCategory;
  severity: 'critical' | 'high';
  status: IncidentStatus;
  lat: number;
  lng: number;
  locationLabel: string;
  nearestStation: string;
  notes: string;
  officerNotes: string;
  assignedUnit: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type UnsafeCategory =
  | 'no_streetlights'
  | 'isolated_area'
  | 'harassment_hotspot'
  | 'no_cctv'
  | 'unsafe_transit';

export type UnsafeReportStatus = 'pending' | 'verified' | 'patrolled' | 'dismissed';

export interface UnsafeReport {
  id: string;
  reporterId: string;
  reporterName: string;
  category: UnsafeCategory;
  severity: 'low' | 'medium' | 'high';
  timeConcern: 'night' | 'evening' | 'all_day';
  status: UnsafeReportStatus;
  lat: number;
  lng: number;
  locationLabel: string;
  description: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PoliceOfficer {
  id: string;
  uid: string;
  officerName: string;
  badgeNumber: string;
  precinct: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OfficerRequest {
  id: string;
  uid: string;
  officerName: string;
  badgeNumber: string;
  precinct: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: unknown;
  updatedAt?: unknown;
}

// --- AI Safety Intelligence Types ---
export interface AiRouteInsight {
  routeId: string;
  summary: string;
  verifiedStrengths: string[];
  estimatedOrLimitedData: string[];
  cautionNotes: string;
}

export interface AiHotspotInsight {
  areaLabel: string;
  riskLevel: string;
  insight: string;
  dataBasis: string;
}

export interface AiEvidenceClassification {
  verifiedSources: string[];
  estimatedMetrics: string[];
  unavailableData: string[];
}

export interface AiRouteAnalysisResult {
  recommendedRouteId: string;
  recommendationHeadline: string;
  recommendationReasoning: string;
  personalizedGuidance: string[];
  routeInsights: AiRouteInsight[];
  hotspotInsights: AiHotspotInsight[];
  evidenceClassification: AiEvidenceClassification;
}

export type AiActionType =
  | 'open_sos'
  | 'view_contacts'
  | 'start_journey'
  | 'report_hazard'
  | 'focus_recommended_route';

export interface AiSuggestedAction {
  type: AiActionType;
  label: string;
}

export type AiChatRole = 'analyst' | 'fast' | 'maps';

export interface GoogleMapsPlaceLink {
  title: string;
  uri: string;
  reviewSnippets?: string[];
}

export interface MapsGroundingResult {
  text: string;
  places: GoogleMapsPlaceLink[];
  model: string;
}

export interface AiChatResponse {
  reply: string;
  dataBasis: 'verified_context' | 'general_safety_guidance' | 'mixed' | 'google_maps_grounding' | string;
  disclaimer: string;
  suggestedActions: AiSuggestedAction[];
  mapsPlaces?: GoogleMapsPlaceLink[];
  modelUsed?: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  dataBasis?: string;
  disclaimer?: string;
  suggestedActions?: AiSuggestedAction[];
  mapsPlaces?: GoogleMapsPlaceLink[];
  modelUsed?: string;
}
