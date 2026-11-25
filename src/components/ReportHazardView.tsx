import { User } from 'firebase/auth';
import { CheckCircle2, MapPin, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { reverseGeocode } from '../services/geocoding';
import { deleteUnsafeReport, submitUnsafeReport } from '../services/firestoreService';
import { BLUEPRINT_LIMITS } from '../services/validation';
import { GeoPlace, LatLng, UnsafeCategory, UnsafeReport } from '../types/safeher';
import { PlaceSearchInput } from './PlaceSearchInput';
import { SafetyMap } from './SafetyMap';

interface ReportHazardViewProps {
  user: User;
  unsafeReports: UnsafeReport[];
  onAskAi?: (prefillPrompt?: string) => void;
}

const CATEGORY_LABELS: Record<UnsafeCategory, string> = {
  no_streetlights: 'Broken / No Streetlights',
  isolated_area: 'Isolated / Deserted Stretch',
  harassment_hotspot: 'Harassment / Suspicious Activity',
  no_cctv: 'No CCTV / Blind Spot',
  unsafe_transit: 'Unsafe Bus Stop / Alley',
};

export function ReportHazardView({ user, unsafeReports, onAskAi }: ReportHazardViewProps) {
  const [pickedPlace, setPickedPlace] = useState<GeoPlace>({
    label: '100 Feet Road, Indiranagar, Bengaluru',
    shortName: '100 Feet Road, Indiranagar',
    lat: 12.9718,
    lng: 77.6412,
  });
  const [category, setCategory] = useState<UnsafeCategory>('no_streetlights');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('high');
  const [timeConcern, setTimeConcern] = useState<'night' | 'evening' | 'all_day'>('night');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<LatLng | null>(null);

  const handleMapPick = async (pt: LatLng) => {
    const place = await reverseGeocode(pt.lat, pt.lng);
    setPickedPlace(place);
    setFocusPoint(pt);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    if (description.trim().length < BLUEPRINT_LIMITS.descriptionMinLength) {
      setFormError('Please provide at least 5 characters describing the safety concern.');
      return;
    }

    setSubmitting(true);
    try {
      await submitUnsafeReport({
        user,
        category,
        severity,
        timeConcern,
        lat: pickedPlace.lat,
        lng: pickedPlace.lng,
        locationLabel: pickedPlace.shortName || pickedPlace.label,
        description,
      });
      setDescription('');
      setSuccessMsg('Hazard report saved to SafeHer. Nearby route safety scores will now reflect this warning.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="font-display text-lg font-bold text-slate-950">
              Report Unsafe Location
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Search an address or click directly on the map to pin unlit roads, deserted stretches, or unsafe spots.
            </p>
          </div>
          {onAskAi && (
            <button
              type="button"
              onClick={() =>
                onAskAi(
                  `Summarize the safety risks and lighting gaps across the ${unsafeReports.length} active community hazard reports.`
                )
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-teal-400" />
              <span>AI Insights</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PlaceSearchInput
            id="hazard-location-search"
            label="Location (or click map)"
            placeholder="Search street or landmark"
            value={pickedPlace}
            onChange={(place) => {
              setPickedPlace(place);
              setFocusPoint({ lat: place.lat, lng: place.lng });
            }}
            allowGps
          />

          <p className="text-[11px] font-mono text-slate-500 tabular-nums">
            Selected pin: {pickedPlace.lat.toFixed(5)}, {pickedPlace.lng.toFixed(5)}
          </p>

          <div>
            <label htmlFor="hazard-category" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Hazard Category
            </label>
            <select
              id="hazard-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as UnsafeCategory)}
              className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                Risk Severity
              </span>
              <div className="grid grid-cols-3 p-1 bg-slate-100 rounded-lg">
                {(['low', 'medium', 'high'] as const).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverity(sev)}
                    className={`py-1.5 text-xs font-medium capitalize rounded-md cursor-pointer ${
                      severity === sev
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-600'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                Peak Risk Window
              </span>
              <select
                aria-label="Peak Risk Window"
                value={timeConcern}
                onChange={(e) =>
                  setTimeConcern(e.target.value as 'night' | 'evening' | 'all_day')
                }
                className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="night">Late Night</option>
                <option value="evening">Evening</option>
                <option value="all_day">All Day</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="hazard-desc" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Details ({description.length}/{BLUEPRINT_LIMITS.descriptionMaxLength})
            </label>
            <textarea
              id="hazard-desc"
              rows={3}
              maxLength={BLUEPRINT_LIMITS.descriptionMaxLength}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe lighting conditions, visibility, or specific safety concerns..."
              className="w-full p-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {formError && <p className="text-xs text-red-600">{formError}</p>}
          {successMsg && (
            <p className="text-xs text-emerald-700 flex items-start gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {submitting ? 'Submitting Report...' : 'Submit Unsafe Location Report'}
          </button>
        </form>
      </section>

      <div className="lg:col-span-7 space-y-5">
        <SafetyMap
          center={pickedPlace}
          pickedPoint={pickedPlace}
          focusPoint={focusPoint}
          unsafeReports={unsafeReports}
          onMapClick={(pt) => void handleMapPick(pt)}
          className="h-[380px] lg:h-[440px] w-full"
        />

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm font-bold text-slate-950">
              Active Community Reports ({unsafeReports.length})
            </h2>
            <span className="text-xs text-slate-500">Click an entry to focus on map</span>
          </div>

          {unsafeReports.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              No community hazard reports submitted yet. Click the map to report an unsafe stretch.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {unsafeReports.map((rep) => (
                <div
                  key={rep.id}
                  onClick={() => setFocusPoint({ lat: rep.lat, lng: rep.lng })}
                  className="py-3 flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-50 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900">
                      <MapPin className="w-3.5 h-3.5 inline mr-1 text-amber-600" />
                      {rep.locationLabel}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {CATEGORY_LABELS[rep.category]} · Severity {rep.severity} · Status {rep.status}
                    </p>
                    <p className="text-xs text-slate-700 mt-1">{rep.description}</p>
                  </div>
                  {rep.reporterId === user.uid && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteUnsafeReport(rep.id);
                      }}
                      aria-label="Delete your report"
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
