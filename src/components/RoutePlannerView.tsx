import { User } from 'firebase/auth';
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  Compass,
  ExternalLink,
  Info,
  Lightbulb,
  Loader2,
  MapPin,
  Mic,
  Navigation,
  RefreshCw,
  Shield,
  Sparkles,
  Store,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchAiRouteAnalysis, fetchMapsSafePlaces } from '../services/aiClient';
import { CURATED_CORRIDORS } from '../services/geocoding';
import { fetchAlternativeRoutes } from '../services/routing';
import { analyzeAllRoutes } from '../services/safetyAnalyzer';
import {
  AiRouteAnalysisResult,
  AnalyzedRoute,
  GeoPlace,
  MapsGroundingResult,
  TimeOfTravel,
  TravelMode,
  UnsafeReport,
} from '../types/safeher';
import { PlaceSearchInput } from './PlaceSearchInput';
import { MapLayerVisibility, SafetyMap } from './SafetyMap';

interface RoutePlannerViewProps {
  user: User;
  unsafeReports: UnsafeReport[];
  onStartLiveJourney: (
    route: AnalyzedRoute,
    originLabel: string,
    destinationLabel: string
  ) => void;
  isStartingJourney: boolean;
  onRoutesUpdated?: (ctx: {
    originLabel: string;
    destinationLabel: string;
    originCoords: { lat: number; lng: number };
    travelMode: TravelMode;
    timeOfTravel: TimeOfTravel;
    routes: AnalyzedRoute[];
    selectedRoute: AnalyzedRoute | null;
  }) => void;
  onAskAi?: (prefillPrompt?: string, mode?: 'chat' | 'voice') => void;
  selectedRouteIdOverride?: string | null;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

export function RoutePlannerView({
  user,
  unsafeReports,
  onStartLiveJourney,
  isStartingJourney,
  onRoutesUpdated,
  onAskAi,
  selectedRouteIdOverride,
}: RoutePlannerViewProps) {
  const defaultCorridor = CURATED_CORRIDORS[0];
  const [origin, setOrigin] = useState<GeoPlace>(defaultCorridor.origin);
  const [destination, setDestination] = useState<GeoPlace>(defaultCorridor.destination);
  const [travelMode, setTravelMode] = useState<TravelMode>('walking');
  const [timeOfTravel, setTimeOfTravel] = useState<TimeOfTravel>('night');
  const [routes, setRoutes] = useState<AnalyzedRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI Smart Route Analysis & Google Maps Grounding state
  const [aiAnalysis, setAiAnalysis] = useState<AiRouteAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUnavailableMsg, setAiUnavailableMsg] = useState<string | null>(null);
  const [mapsResult, setMapsResult] = useState<MapsGroundingResult | null>(null);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);

  const [layers, setLayers] = useState<MapLayerVisibility>({
    streetlight: true,
    shop: true,
    cctv: true,
    police: true,
    hazards: true,
  });

  useEffect(() => {
    if (selectedRouteIdOverride) {
      setSelectedRouteId(selectedRouteIdOverride);
    }
  }, [selectedRouteIdOverride]);

  const runAiEvaluation = async (
    analyzed: AnalyzedRoute[],
    origLabel: string,
    destLabel: string,
    mode: TravelMode,
    time: TimeOfTravel
  ) => {
    if (analyzed.length === 0) return;
    setAiLoading(true);
    setAiUnavailableMsg(null);
    const res = await fetchAiRouteAnalysis(user, {
      originLabel: origLabel,
      destinationLabel: destLabel,
      travelMode: mode,
      timeOfTravel: time,
      routes: analyzed,
      communityReports: unsafeReports,
    });
    setAiLoading(false);

    if (res.ok) {
      setAiAnalysis(res.data);
    } else {
      setAiAnalysis(null);
      setAiUnavailableMsg(res.error);
    }
  };

  const runAnalysis = async (
    orig: GeoPlace = origin,
    dest: GeoPlace = destination,
    mode: TravelMode = travelMode,
    time: TimeOfTravel = timeOfTravel
  ) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const rawRoutes = await fetchAlternativeRoutes(
        { lat: orig.lat, lng: orig.lng },
        { lat: dest.lat, lng: dest.lng },
        mode
      );
      const analyzed = await analyzeAllRoutes(rawRoutes, unsafeReports, time);
      setRoutes(analyzed);
      const recommended = analyzed.find((r) => r.isRecommended) || analyzed[0];
      setSelectedRouteId(recommended?.id || null);

      onRoutesUpdated?.({
        originLabel: orig.shortName,
        destinationLabel: dest.shortName,
        originCoords: { lat: orig.lat, lng: orig.lng },
        travelMode: mode,
        timeOfTravel: time,
        routes: analyzed,
        selectedRoute: recommended || null,
      });

      void runAiEvaluation(analyzed, orig.shortName, dest.shortName, mode, time);
      void runMapsGrounding(orig, dest);
    } catch {
      setError('Could not retrieve routes for these coordinates. Try selecting a preset corridor or searching valid landmarks.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runMapsGrounding = async (orig: GeoPlace = origin, dest: GeoPlace = destination) => {
    setMapsLoading(true);
    setMapsError(null);
    const midLat = (orig.lat + dest.lat) / 2;
    const midLng = (orig.lng + dest.lng) / 2;
    const res = await fetchMapsSafePlaces(
      user,
      `Identify nearest verified police stations, 24-hour hospitals or pharmacies, and well-known public transit hubs between ${orig.shortName} and ${dest.shortName}.`,
      midLat,
      midLng
    );
    setMapsLoading(false);
    if (res.ok) {
      setMapsResult(res.data);
    } else {
      setMapsResult(null);
      setMapsError(res.error);
    }
  };

  useEffect(() => {
    void runAnalysis(defaultCorridor.origin, defaultCorridor.destination, 'walking', 'night');
  }, []);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0] || null;

  useEffect(() => {
    if (routes.length > 0) {
      onRoutesUpdated?.({
        originLabel: origin.shortName,
        destinationLabel: destination.shortName,
        originCoords: { lat: origin.lat, lng: origin.lng },
        travelMode,
        timeOfTravel,
        routes,
        selectedRoute,
      });
    }
  }, [selectedRoute?.id]);

  const selectedAiInsight = aiAnalysis?.routeInsights.find(
    (item) => item.routeId === selectedRoute?.id
  );

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Main Split Workspace: Controls + Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Control & Route List Rail */}
        <aside className="lg:col-span-4 space-y-5">
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="font-display text-lg font-bold text-slate-950">
                  AI Safety Route Planner
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Combines OpenStreetMap infrastructure, community reports, and Gemini route intelligence.
                </p>
              </div>
              {onAskAi && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAskAi(undefined, 'voice')}
                    title="Start Live Voice Assistant"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-semibold rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Voice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onAskAi(
                        `Analyze safety indicators for ${origin.shortName} to ${destination.shortName} (${timeOfTravel}).`,
                        'chat'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                    <span>Ask AI</span>
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <PlaceSearchInput
                id="safeher-origin"
                label="Starting Location"
                placeholder="Search starting street or landmark"
                value={origin}
                onChange={setOrigin}
                allowGps
              />
              <PlaceSearchInput
                id="safeher-destination"
                label="Destination"
                placeholder="Search destination address"
                value={destination}
                onChange={setDestination}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Travel Mode
                </span>
                <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setTravelMode('walking')}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      travelMode === 'walking'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Walking
                  </button>
                  <button
                    type="button"
                    onClick={() => setTravelMode('driving')}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      travelMode === 'driving'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Transit
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Time Window
                </span>
                <div className="grid grid-cols-3 p-1 bg-slate-100 rounded-lg">
                  {(['day', 'evening', 'night'] as TimeOfTravel[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTimeOfTravel(t)}
                      className={`py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap cursor-pointer ${
                        timeOfTravel === t
                          ? 'bg-white text-slate-950 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void runAnalysis()}
              disabled={isAnalyzing}
              className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing Routes &amp; Safety Layers...</span>
                </>
              ) : (
                <>
                  <Compass className="w-4 h-4" />
                  <span>Find &amp; Score Safe Routes</span>
                </>
              )}
            </button>

            {error && (
              <p role="alert" className="text-xs text-red-600">
                {error}
              </p>
            )}

            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-2">
                Quick Urban Corridors
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {CURATED_CORRIDORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setOrigin(c.origin);
                      setDestination(c.destination);
                      void runAnalysis(c.origin, c.destination, travelMode, timeOfTravel);
                    }}
                    className="text-left px-2.5 py-2 rounded-lg border border-slate-200 hover:border-teal-600 hover:bg-teal-50/40 transition-colors cursor-pointer"
                  >
                    <span className="block text-[11px] font-semibold text-slate-900 truncate">
                      {c.city}
                    </span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      {c.origin.shortName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Retrieved Alternative Routes List */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-950">
                Alternative Routes ({routes.length})
              </h2>
              {routes[0] && (
                <span className="text-[11px] text-slate-500">
                  {routes[0].breakdown.dataSource === 'osm-overpass'
                    ? 'OpenStreetMap Live'
                    : 'Corridor Baseline'}
                </span>
              )}
            </div>

            {isAnalyzing && routes.length === 0 ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-lg bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {routes.map((route) => {
                  const isSelected = route.id === selectedRoute?.id;
                  const scoreColor =
                    route.breakdown.overallScore >= 72
                      ? 'text-emerald-700'
                      : route.breakdown.overallScore >= 52
                      ? 'text-amber-700'
                      : 'text-red-700';

                  return (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() => setSelectedRouteId(route.id)}
                      className={`w-full text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-teal-700 bg-teal-50/50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {route.isRecommended && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            )}
                            <p className="text-sm font-semibold text-slate-950 truncate">
                              {route.name}
                            </p>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 tabular-nums">
                            {formatDuration(route.durationSeconds)} · {formatDistance(route.distanceMeters)} · {route.breakdown.verdict}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`font-mono text-lg font-bold tabular-nums ${scoreColor}`}>
                            {route.breakdown.overallScore}
                          </span>
                          <span className="block text-[10px] text-slate-500">/100</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </aside>

        {/* Right Interactive Map + AI Recommendation + Route Inspection */}
        <div className="lg:col-span-8 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-700">
              Safety Infrastructure Layers
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'police' as const, label: 'Police & Security', icon: Shield },
                { key: 'streetlight' as const, label: 'Streetlights', icon: Lightbulb },
                { key: 'shop' as const, label: 'Open Shops', icon: Store },
                { key: 'cctv' as const, label: 'CCTV Cameras', icon: Camera },
                { key: 'hazards' as const, label: 'Unsafe Reports', icon: AlertTriangle },
              ].map((item) => {
                const Icon = item.icon;
                const active = layers[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      setLayers((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <SafetyMap
            center={origin}
            routes={routes}
            selectedRouteId={selectedRoute?.id || null}
            onSelectRoute={setSelectedRouteId}
            origin={origin}
            destination={destination}
            layerVisibility={layers}
            unsafeReports={unsafeReports}
            className="h-[400px] lg:h-[480px] w-full"
          />

          {/* AI Route Recommendation & Personalized Safety Guidance */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-teal-700 shrink-0" />
                <div>
                  <h2 className="font-display text-base font-bold text-slate-950">
                    AI Route Recommendation &amp; Personalized Guidance
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Grounded in OpenStreetMap infrastructure, OSRM routing, and Firestore reports
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={aiLoading || routes.length === 0}
                  onClick={() =>
                    void runAiEvaluation(
                      routes,
                      origin.shortName,
                      destination.shortName,
                      travelMode,
                      timeOfTravel
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-300 text-xs font-medium text-slate-700 rounded-lg cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh AI</span>
                </button>
                {onAskAi && (
                  <button
                    type="button"
                    onClick={() =>
                      onAskAi('Explain why the recommended route is preferred and what precautions I should take.')
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Discuss with AI</span>
                  </button>
                )}
              </div>
            </div>

            {aiLoading ? (
              <div className="space-y-2 py-2">
                <div className="h-4 w-2/3 bg-slate-100 rounded animate-pulse" />
                <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
                <div className="h-4 w-5/6 bg-slate-100 rounded animate-pulse" />
              </div>
            ) : aiUnavailableMsg ? (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
                <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>AI narrative unavailable — deterministic route metrics active</span>
                </p>
                <p className="text-slate-600">{aiUnavailableMsg}</p>
              </div>
            ) : aiAnalysis ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-teal-50/60 border border-teal-200 space-y-1.5">
                  <p className="text-sm font-bold text-slate-950">
                    {aiAnalysis.recommendationHeadline}
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {aiAnalysis.recommendationReasoning}
                  </p>
                </div>

                {aiAnalysis.personalizedGuidance.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 mb-2">
                      Personalized Safety Recommendations ({timeOfTravel} · {travelMode})
                    </h3>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {aiAnalysis.personalizedGuidance.map((tip, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed"
                        >
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Honest Data Provenance */}
                <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                  <div>
                    <p className="font-semibold text-emerald-800 mb-1">Verified Sources</p>
                    <p className="text-slate-600 leading-relaxed">
                      {aiAnalysis.evidenceClassification.verifiedSources.join(' · ')}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-800 mb-1">Derived Estimates</p>
                    <p className="text-slate-600 leading-relaxed">
                      {aiAnalysis.evidenceClassification.estimatedMetrics.join(' · ')}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700 mb-1">Unavailable Data</p>
                    <p className="text-slate-600 leading-relaxed">
                      {aiAnalysis.evidenceClassification.unavailableData.join(' · ')}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {/* Selected Route Safety Breakdown & Action */}
          {selectedRoute && (
            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <p className="text-xs font-medium text-teal-700">
                    {selectedRoute.isRecommended
                      ? 'Highest Safety Rating · Recommended Corridor'
                      : 'Alternative Corridor Inspection'}
                  </p>
                  <h2 className="font-display text-xl font-bold text-slate-950 mt-0.5">
                    {selectedRoute.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    {formatDuration(selectedRoute.durationSeconds)} · {formatDistance(selectedRoute.distanceMeters)} · Nearest police: {selectedRoute.breakdown.nearestPoliceName}
                    {selectedRoute.breakdown.nearestPoliceDistanceM !== null
                      ? ` (${selectedRoute.breakdown.nearestPoliceDistanceM}m)`
                      : ''}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isStartingJourney}
                  onClick={() =>
                    onStartLiveJourney(selectedRoute, origin.shortName, destination.shortName)
                  }
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Navigation className="w-4 h-4" />
                  <span>
                    {isStartingJourney ? 'Starting Sharing...' : 'Start Live Journey'}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div>
                  <span className="text-xs text-slate-500">Overall Score</span>
                  <p className="font-mono text-2xl font-bold text-slate-950 tabular-nums mt-0.5">
                    {selectedRoute.breakdown.overallScore}
                    <span className="text-xs font-normal text-slate-500">/100</span>
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Lit Corridor</span>
                  <p className="font-mono text-2xl font-bold text-slate-950 tabular-nums mt-0.5">
                    {selectedRoute.breakdown.litRoadPct}%
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Shops &amp; Venues</span>
                  <p className="font-mono text-2xl font-bold text-slate-950 tabular-nums mt-0.5">
                    {selectedRoute.breakdown.counts.shops}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">CCTV / Police</span>
                  <p className="font-mono text-2xl font-bold text-slate-950 tabular-nums mt-0.5">
                    {selectedRoute.breakdown.counts.cctv} / {selectedRoute.breakdown.counts.police}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Hazard Reports</span>
                  <p
                    className={`font-mono text-2xl font-bold tabular-nums mt-0.5 ${
                      selectedRoute.breakdown.counts.hazards > 0
                        ? 'text-red-600'
                        : 'text-emerald-700'
                    }`}
                  >
                    {selectedRoute.breakdown.counts.hazards}
                  </p>
                </div>
              </div>

              {selectedAiInsight && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <p className="font-semibold text-slate-950">
                    AI Corridor Insight: {selectedAiInsight.summary}
                  </p>
                  <p className="text-emerald-800">
                    <span className="font-semibold">Verified strengths: </span>
                    {selectedAiInsight.verifiedStrengths.join(' · ') || 'None noted'}
                  </p>
                  <p className="text-amber-800">
                    <span className="font-semibold">Estimated / limited data: </span>
                    {selectedAiInsight.estimatedOrLimitedData.join(' · ') || 'None'}
                  </p>
                  <p className="text-slate-700">
                    <span className="font-semibold">Caution: </span>
                    {selectedAiInsight.cautionNotes}
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {selectedRoute.breakdown.reasons.map((reason, idx) => (
                  <p key={idx} className="text-xs text-slate-700 leading-relaxed">
                    • {reason}
                  </p>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Side-by-Side Route Comparison Matrix */}
      {routes.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-950">
                Route Safety Comparison Matrix
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Independent evaluation across every retrieved corridor
              </p>
            </div>
            {onAskAi && (
              <button
                type="button"
                onClick={() =>
                  onAskAi(
                    'Compare all retrieved routes by distance, travel time, lighting, police proximity, and hazards.'
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span>Ask AI About Comparison</span>
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Route Corridor</th>
                  <th className="py-3 px-4 text-right">Safety Score</th>
                  <th className="py-3 px-4 text-right">Distance</th>
                  <th className="py-3 px-4 text-right">Est. Time</th>
                  <th className="py-3 px-4 text-right">Streetlights</th>
                  <th className="py-3 px-4 text-right">Shops</th>
                  <th className="py-3 px-4 text-right">CCTV</th>
                  <th className="py-3 px-4 text-right">Police</th>
                  <th className="py-3 px-4 text-right">Hazards</th>
                  <th className="py-3 px-4">Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {routes.map((r) => {
                  const isSel = r.id === selectedRoute?.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedRouteId(r.id)}
                      className={`cursor-pointer transition-colors ${
                        isSel ? 'bg-teal-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">{r.name}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-950">
                        {r.breakdown.overallScore}/100
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatDistance(r.distanceMeters)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatDuration(r.durationSeconds)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {r.breakdown.counts.streetlights} ({r.breakdown.litRoadPct}%)
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {r.breakdown.counts.shops}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {r.breakdown.counts.cctv}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {r.breakdown.counts.police}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {r.breakdown.counts.hazards}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        <span
                          className={
                            r.isRecommended
                              ? 'text-emerald-700'
                              : r.breakdown.overallScore >= 52
                              ? 'text-amber-700'
                              : 'text-red-700'
                          }
                        >
                          {r.breakdown.verdict}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. AI Safety Insights: Hotspots, Poorly Lit Stretches & Facility Gaps */}
      {aiAnalysis && aiAnalysis.hotspotInsights.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-950">
                AI Safety Insights: Poorly Lit Stretches &amp; Risk Hotspots
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Synthesized from submitted community hazard reports and mapped public facility density
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {aiAnalysis.hotspotInsights.map((spot, idx) => (
              <div
                key={idx}
                className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-950 truncate">
                    {spot.areaLabel}
                  </h3>
                  <span className="text-[11px] font-mono font-semibold text-amber-800 shrink-0">
                    {spot.riskLevel}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{spot.insight}</p>
                <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                  Basis: {spot.dataBasis}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Google Maps Grounding: Verified Nearby Safe Places & Police Links */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-950">
              Google Maps Grounded Safe Places &amp; Emergency Hubs
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live Google Maps place verification via Gemini 4 Hydrogen around {origin.shortName} and {destination.shortName}
            </p>
          </div>
          <button
            type="button"
            disabled={mapsLoading}
            onClick={() => void runMapsGrounding()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:border-slate-400 text-xs font-semibold text-slate-800 rounded-lg cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${mapsLoading ? 'animate-spin' : ''}`} />
            <span>{mapsLoading ? 'Checking Google Maps...' : 'Refresh Maps Grounding'}</span>
          </button>
        </div>

        {mapsLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-2/3 bg-slate-100 rounded animate-pulse" />
            <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
          </div>
        ) : mapsError ? (
          <p className="text-xs text-slate-600">{mapsError}</p>
        ) : mapsResult ? (
          <div className="space-y-4">
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {mapsResult.text}
            </p>
            {mapsResult.places.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {mapsResult.places.map((place, idx) => (
                  <a
                    key={idx}
                    href={place.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-lg border border-slate-200 hover:border-teal-600 bg-slate-50 transition-colors block"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-slate-950 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                        <span>{place.title}</span>
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </div>
                    {place.reviewSnippets && place.reviewSnippets.length > 0 && (
                      <p className="text-[11px] text-slate-600 mt-1.5 line-clamp-2">
                        “{place.reviewSnippets[0]}”
                      </p>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
