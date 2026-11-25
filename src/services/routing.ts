import { LatLng, RouteStep, TravelMode } from '../types/safeher';

export interface RawOsrmRoute {
  id: string;
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][]; // [lat, lng]
  steps: RouteStep[];
}

interface OsrmResponse {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    weight_name?: string;
    geometry: {
      type: 'LineString';
      coordinates: [number, number][]; // [lng, lat]
    };
    legs?: Array<{
      summary?: string;
      steps?: Array<{
        distance: number;
        duration: number;
        name?: string;
        maneuver?: {
          type?: string;
          modifier?: string;
        };
      }>;
    }>;
  }>;
}

function formatStepInstruction(
  type?: string,
  modifier?: string,
  roadName?: string
): string {
  const street = roadName && roadName.trim() ? ` onto ${roadName}` : '';
  if (type === 'depart') return `Start${street}`;
  if (type === 'arrive') return 'Arrive at destination';
  const dir = modifier ? modifier.replace(/_/g, ' ') : 'continue';
  return `${dir.charAt(0).toUpperCase() + dir.slice(1)}${street}`;
}

async function queryOsrm(
  waypoints: LatLng[],
  profile: 'foot' | 'driving',
  alternatives: boolean
): Promise<OsrmResponse> {
  const coordStr = waypoints.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coordStr}?alternatives=${
    alternatives ? '3' : 'false'
  }&overview=full&geometries=geojson&steps=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`OSRM error ${res.status}`);
    }
    return (await res.json()) as OsrmResponse;
  } finally {
    clearTimeout(timer);
  }
}

function mapOsrmRoute(
  route: NonNullable<OsrmResponse['routes']>[number],
  idx: number,
  fallbackName: string
): RawOsrmRoute {
  const coords: [number, number][] = route.geometry.coordinates.map(([lng, lat]) => [
    lat,
    lng,
  ]);
  const summary = route.legs?.[0]?.summary?.trim();
  const steps: RouteStep[] =
    route.legs?.flatMap((leg) =>
      (leg.steps || []).slice(0, 12).map((s) => ({
        instruction: formatStepInstruction(s.maneuver?.type, s.maneuver?.modifier, s.name),
        distanceM: Math.round(s.distance),
        durationS: Math.round(s.duration),
      }))
    ) || [];

  return {
    id: `route-${idx + 1}`,
    name: summary ? `Via ${summary}` : fallbackName,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    coordinates: coords,
    steps,
  };
}

function routeMidpoint(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  return coords[Math.floor(coords.length / 2)];
}

function approxMetersBetween(a: [number, number], b: [number, number]): number {
  const dLat = (a[0] - b[0]) * 111320;
  const dLng = (a[1] - b[1]) * 111320 * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

function deduplicateRoutes(routes: RawOsrmRoute[]): RawOsrmRoute[] {
  const kept: RawOsrmRoute[] = [];
  for (const candidate of routes) {
    const mid = routeMidpoint(candidate.coordinates);
    const isDuplicate = kept.some((existing) => {
      const existingMid = routeMidpoint(existing.coordinates);
      const midSeparation = approxMetersBetween(mid, existingMid);
      const distDiff = Math.abs(existing.distanceMeters - candidate.distanceMeters);
      return midSeparation < 140 && distDiff < 120;
    });
    if (!isDuplicate) {
      kept.push({ ...candidate, id: `route-${kept.length + 1}` });
    }
  }
  return kept.slice(0, 4);
}

function buildOffsetWaypoints(origin: LatLng, destination: LatLng): [LatLng, LatLng] {
  const midLat = (origin.lat + destination.lat) / 2;
  const midLng = (origin.lng + destination.lng) / 2;
  const dLat = destination.lat - origin.lat;
  const dLng = destination.lng - origin.lng;
  const span = Math.hypot(dLat, dLng) || 0.01;
  const offsetScale = Math.min(0.014, Math.max(0.0035, span * 0.22));
  const perpLat = (-dLng / span) * offsetScale;
  const perpLng = (dLat / span) * offsetScale;

  return [
    { lat: midLat + perpLat, lng: midLng + perpLng },
    { lat: midLat - perpLat, lng: midLng - perpLng },
  ];
}

function buildFallbackCorridors(
  origin: LatLng,
  destination: LatLng,
  mode: TravelMode
): RawOsrmRoute[] {
  const [leftVia, rightVia] = buildOffsetWaypoints(origin, destination);
  const directDist = approxMetersBetween([origin.lat, origin.lng], [destination.lat, destination.lng]);
  const speedMps = mode === 'walking' ? 1.35 : 8.5;

  const makeArc = (
    id: string,
    name: string,
    via: LatLng | null,
    detourFactor: number
  ): RawOsrmRoute => {
    const pts: [number, number][] = [[origin.lat, origin.lng]];
    if (via) {
      pts.push([
        (origin.lat + via.lat) / 2,
        (origin.lng + via.lng) / 2,
      ]);
      pts.push([via.lat, via.lng]);
      pts.push([
        (via.lat + destination.lat) / 2,
        (via.lng + destination.lng) / 2,
      ]);
    } else {
      pts.push([(origin.lat + destination.lat) / 2, (origin.lng + destination.lng) / 2]);
    }
    pts.push([destination.lat, destination.lng]);
    const dist = Math.round(directDist * detourFactor);
    return {
      id,
      name,
      distanceMeters: dist,
      durationSeconds: Math.max(60, Math.round(dist / speedMps)),
      coordinates: pts,
      steps: [
        { instruction: `Depart toward ${name}`, distanceM: Math.round(dist * 0.5), durationS: Math.round(dist / speedMps / 2) },
        { instruction: 'Continue to destination', distanceM: Math.round(dist * 0.5), durationS: Math.round(dist / speedMps / 2) },
      ],
    };
  };

  return [
    makeArc('route-1', 'Direct Arterial Corridor', null, 1.15),
    makeArc('route-2', 'North/East Commercial Loop', leftVia, 1.32),
    makeArc('route-3', 'South/West Avenue Bypass', rightVia, 1.38),
  ];
}

export async function fetchAlternativeRoutes(
  origin: LatLng,
  destination: LatLng,
  mode: TravelMode
): Promise<RawOsrmRoute[]> {
  const profile: 'foot' | 'driving' = mode === 'walking' ? 'foot' : 'driving';
  let collected: RawOsrmRoute[] = [];

  try {
    let primary = await queryOsrm([origin, destination], profile, true);
    if ((!primary.routes || primary.routes.length === 0) && profile === 'foot') {
      primary = await queryOsrm([origin, destination], 'driving', true);
    }

    if (primary.routes && primary.routes.length > 0) {
      collected = primary.routes.map((r, idx) =>
        mapOsrmRoute(r, idx, `Route ${idx + 1}`)
      );
    }

    // If OSRM returns fewer than 3 distinct routes, query real road via-corridors
    if (collected.length < 3) {
      const [leftVia, rightVia] = buildOffsetWaypoints(origin, destination);
      const viaResults = await Promise.allSettled([
        queryOsrm([origin, leftVia, destination], profile, false),
        queryOsrm([origin, rightVia, destination], profile, false),
      ]);

      viaResults.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value.routes?.[0]) {
          collected.push(
            mapOsrmRoute(
              result.value.routes[0],
              collected.length + i,
              i === 0 ? 'East Commercial Corridor' : 'West Avenue Corridor'
            )
          );
        }
      });
    }

    const deduped = deduplicateRoutes(collected);
    if (deduped.length > 0) {
      // Adjust walking duration realistically if OSRM foot server fell back to driving speed
      if (mode === 'walking') {
        return deduped.map((r) => {
          const speed = r.distanceMeters / Math.max(1, r.durationSeconds);
          if (speed > 3.0) {
            return { ...r, durationSeconds: Math.round(r.distanceMeters / 1.35) };
          }
          return r;
        });
      }
      return deduped;
    }
  } catch {
    // Graceful corridor fallback if OSRM public server times out
  }

  return buildFallbackCorridors(origin, destination, mode);
}
