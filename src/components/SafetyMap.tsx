import L from 'leaflet';
import { useEffect, useRef } from 'react';
import {
  AnalyzedRoute,
  EmergencyIncident,
  FacilityCategory,
  LatLng,
  UnsafeReport,
} from '../types/safeher';

export interface MapLayerVisibility {
  streetlight: boolean;
  shop: boolean;
  cctv: boolean;
  police: boolean;
  hazards: boolean;
}

interface SafetyMapProps {
  center?: LatLng;
  zoom?: number;
  routes?: AnalyzedRoute[];
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;
  origin?: LatLng | null;
  destination?: LatLng | null;
  layerVisibility?: MapLayerVisibility;
  unsafeReports?: UnsafeReport[];
  incidents?: EmergencyIncident[];
  liveTraveler?: { lat: number; lng: number; label: string; isSos?: boolean } | null;
  pickedPoint?: LatLng | null;
  onMapClick?: (point: LatLng) => void;
  focusPoint?: LatLng | null;
  className?: string;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function createPinIcon(color: string, ringColor: string, label: string, pulse = false): L.DivIcon {
  const ring = pulse
    ? `<span class="sos-ring-pulse" style="position:absolute;inset:-6px;border-radius:9999px;border:2px solid ${ringColor};"></span>`
    : '';
  return L.divIcon({
    className: 'safeher-custom-marker',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `
      <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
        ${ring}
        <span style="width:24px;height:24px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 2px 6px rgba(15,23,42,0.35);color:#ffffff;font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;">
          ${escapeHtml(label)}
        </span>
      </div>
    `,
  });
}

function createFacilityDot(category: FacilityCategory): L.DivIcon {
  const styles: Record<FacilityCategory, { bg: string; letter: string; size: number }> = {
    police: { bg: '#1d4ed8', letter: 'P', size: 22 },
    cctv: { bg: '#475569', letter: 'C', size: 18 },
    shop: { bg: '#0f766e', letter: 'S', size: 16 },
    streetlight: { bg: '#d97706', letter: 'L', size: 12 },
  };
  const cfg = styles[category];
  return L.divIcon({
    className: 'safeher-custom-marker',
    iconSize: [cfg.size, cfg.size],
    iconAnchor: [cfg.size / 2, cfg.size / 2],
    html:
      category === 'streetlight'
        ? `<span style="display:block;width:10px;height:10px;border-radius:9999px;background:#f59e0b;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></span>`
        : `<span style="width:${cfg.size}px;height:${cfg.size}px;border-radius:9999px;background:${cfg.bg};border:1.5px solid #ffffff;box-shadow:0 1px 4px rgba(15,23,42,0.3);color:#ffffff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;">${cfg.letter}</span>`,
  });
}

export function SafetyMap({
  center = { lat: 12.96, lng: 77.63 },
  zoom = 13,
  routes = [],
  selectedRouteId = null,
  onSelectRoute,
  origin = null,
  destination = null,
  layerVisibility = {
    streetlight: true,
    shop: true,
    cctv: true,
    police: true,
    hazards: true,
  },
  unsafeReports = [],
  incidents = [],
  liveTraveler = null,
  pickedPoint = null,
  onMapClick,
  focusPoint = null,
  className = 'h-[480px] lg:h-[640px] w-full',
}: SafetyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const onSelectRouteRef = useRef(onSelectRoute);

  onMapClickRef.current = onMapClick;
  onSelectRouteRef.current = onSelectRoute;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    routeLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClickRef.current) {
        onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  // Pan smoothly to focusPoint when explicitly changed
  useEffect(() => {
    if (!mapRef.current || !focusPoint) return;
    mapRef.current.setView([focusPoint.lat, focusPoint.lng], Math.max(mapRef.current.getZoom(), 15), {
      animate: true,
    });
  }, [focusPoint?.lat, focusPoint?.lng]);

  // Render routes, endpoints, facilities, hazards, live traveler, and SOS pins
  useEffect(() => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    const markerLayer = markerLayerRef.current;
    if (!map || !routeLayer || !markerLayer) return;

    routeLayer.clearLayers();
    markerLayer.clearLayers();

    const bounds = L.latLngBounds([]);

    // 1. Draw unselected routes first, then selected route on top
    const orderedRoutes = [...routes].sort((a, b) => {
      if (a.id === selectedRouteId) return 1;
      if (b.id === selectedRouteId) return -1;
      return 0;
    });

    orderedRoutes.forEach((route) => {
      if (route.coordinates.length === 0) return;
      const isSelected = route.id === selectedRouteId;
      const color = route.isRecommended
        ? '#059669'
        : route.breakdown.overallScore >= 60
        ? '#d97706'
        : '#dc2626';

      const polyline = L.polyline(route.coordinates, {
        color: isSelected ? color : '#64748b',
        weight: isSelected ? 6 : 4,
        opacity: isSelected ? 0.95 : 0.55,
        dashArray: isSelected ? undefined : '6 6',
      });

      polyline.bindTooltip(
        `${escapeHtml(route.name)} · Safety ${route.breakdown.overallScore}/100`,
        { sticky: true }
      );

      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (onSelectRouteRef.current) {
          onSelectRouteRef.current(route.id);
        }
      });

      polyline.addTo(routeLayer);

      route.coordinates.forEach(([lat, lng]) => bounds.extend([lat, lng]));
    });

    // 2. Facility overlays for the currently selected route (or all routes if none selected)
    const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
    if (activeRoute) {
      const seen = new Set<string>();
      // Cap streetlight markers rendered at once to keep map crisp
      let lightRendered = 0;
      let shopRendered = 0;

      for (const fac of activeRoute.facilities) {
        if (seen.has(fac.id)) continue;
        seen.add(fac.id);
        if (!layerVisibility[fac.category]) continue;
        if (fac.category === 'streetlight' && lightRendered >= 45) continue;
        if (fac.category === 'shop' && shopRendered >= 40) continue;

        if (fac.category === 'streetlight') lightRendered++;
        if (fac.category === 'shop') shopRendered++;

        const marker = L.marker([fac.lat, fac.lng], {
          icon: createFacilityDot(fac.category),
        });
        marker.bindPopup(
          `<div style="font-size:12px;line-height:1.4;">
            <strong style="color:#0f172a;">${escapeHtml(fac.name)}</strong><br/>
            <span style="color:#475569;text-transform:capitalize;">${escapeHtml(fac.category)} · ${fac.distanceToRouteM}m from route</span>
          </div>`
        );
        marker.addTo(markerLayer);
      }
    }

    // 3. Unsafe Location Reports
    if (layerVisibility.hazards) {
      unsafeReports
        .filter((r) => r.status !== 'dismissed')
        .forEach((rep) => {
          const badgeColor =
            rep.status === 'patrolled'
              ? '#0284c7'
              : rep.severity === 'high'
              ? '#dc2626'
              : '#d97706';
          const marker = L.marker([rep.lat, rep.lng], {
            icon: createPinIcon(badgeColor, badgeColor, '!', false),
          });
          marker.bindPopup(
            `<div style="font-size:12px;line-height:1.45;max-width:220px;">
              <strong style="color:#0f172a;">Unsafe Area Report (${escapeHtml(rep.severity)})</strong><br/>
              <span style="color:#334155;">${escapeHtml(rep.locationLabel)}</span><br/>
              <span style="color:#64748b;">${escapeHtml(rep.description)}</span>
            </div>`
          );
          marker.addTo(markerLayer);
        });
    }

    // 4. Emergency SOS Incidents
    incidents.forEach((inc) => {
      const isLive = inc.status === 'active' || inc.status === 'acknowledged' || inc.status === 'dispatched';
      const marker = L.marker([inc.lat, inc.lng], {
        icon: createPinIcon(
          isLive ? '#dc2626' : '#475569',
          '#ef4444',
          'SOS',
          isLive
        ),
      });
      marker.bindPopup(
        `<div style="font-size:12px;line-height:1.45;max-width:230px;">
          <strong style="color:#b91c1c;">SOS · ${escapeHtml(inc.status.toUpperCase())}</strong><br/>
          <span style="color:#0f172a;font-weight:600;">${escapeHtml(inc.reporterName)}</span><br/>
          <span style="color:#475569;">${escapeHtml(inc.locationLabel)}</span><br/>
          <span style="color:#64748b;">Nearest: ${escapeHtml(inc.nearestStation)}</span>
        </div>`
      );
      marker.addTo(markerLayer);
      if (routes.length === 0) {
        bounds.extend([inc.lat, inc.lng]);
      }
    });

    // 5. Origin & Destination Pins
    if (origin) {
      L.marker([origin.lat, origin.lng], {
        icon: createPinIcon('#0f172a', '#0f172a', 'A', false),
      })
        .bindPopup('<strong>Origin</strong>')
        .addTo(markerLayer);
      bounds.extend([origin.lat, origin.lng]);
    }
    if (destination) {
      L.marker([destination.lat, destination.lng], {
        icon: createPinIcon('#0d9488', '#0d9488', 'B', false),
      })
        .bindPopup('<strong>Destination</strong>')
        .addTo(markerLayer);
      bounds.extend([destination.lat, destination.lng]);
    }

    // 6. Picked Point for Hazard Reporting
    if (pickedPoint) {
      L.marker([pickedPoint.lat, pickedPoint.lng], {
        icon: createPinIcon('#b45309', '#f59e0b', '?', false),
      })
        .bindPopup('<strong>Selected Hazard Location</strong>')
        .addTo(markerLayer);
    }

    // 7. Live Traveler Position
    if (liveTraveler) {
      L.marker([liveTraveler.lat, liveTraveler.lng], {
        icon: createPinIcon(
          liveTraveler.isSos ? '#dc2626' : '#0d9488',
          liveTraveler.isSos ? '#ef4444' : '#14b8a6',
          '★',
          true
        ),
      })
        .bindPopup(`<strong>${escapeHtml(liveTraveler.label)}</strong>`)
        .addTo(markerLayer);
      bounds.extend([liveTraveler.lat, liveTraveler.lng]);
    }

    if (bounds.isValid() && !focusPoint && !pickedPoint) {
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 15 });
    }
  }, [
    routes,
    selectedRouteId,
    origin?.lat,
    origin?.lng,
    destination?.lat,
    destination?.lng,
    layerVisibility,
    unsafeReports,
    incidents,
    liveTraveler?.lat,
    liveTraveler?.lng,
    liveTraveler?.isSos,
    pickedPoint?.lat,
    pickedPoint?.lng,
  ]);

  return (
    <div
      ref={containerRef}
      className={`rounded-xl border border-slate-200 bg-slate-100 overflow-hidden ${className}`}
      aria-label="Interactive safety map"
    />
  );
}
