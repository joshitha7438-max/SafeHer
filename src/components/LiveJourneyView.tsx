import { User } from 'firebase/auth';
import {
  Check,
  Copy,
  Eye,
  Navigation,
  Phone,
  Plus,
  Radio,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  addEmergencyContact,
  deleteEmergencyContact,
  subscribeJourneyByCode,
  toggleJourneySharing,
  updateJourneyProgress,
  updateJourneyStatus,
} from '../services/firestoreService';
import { validatePhone, validateShareCode } from '../services/validation';
import { AnalyzedRoute, EmergencyContact, Journey } from '../types/safeher';
import { SafetyMap } from './SafetyMap';

interface LiveJourneyViewProps {
  user: User;
  activeJourney: Journey | null;
  activeRoute: AnalyzedRoute | null;
  myJourneys: Journey[];
  contacts: EmergencyContact[];
  initialTrackCode?: string | null;
  onTriggerSos: () => void;
  onAskAi?: (prefillPrompt?: string) => void;
}

export function LiveJourneyView({
  user,
  activeJourney,
  activeRoute,
  myJourneys,
  contacts,
  initialTrackCode,
  onTriggerSos,
  onAskAi,
}: LiveJourneyViewProps) {
  const [copied, setCopied] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Emergency contacts form state
  const [contactName, setContactName] = useState('');
  const [contactRelation, setContactRelation] = useState('Mother');
  const [contactPhone, setContactPhone] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);

  // Family tracking lookup state
  const [trackCodeInput, setTrackCodeInput] = useState(initialTrackCode || '');
  const [trackedJourney, setTrackedJourney] = useState<Journey | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [activeWatchCode, setActiveWatchCode] = useState<string | null>(
    initialTrackCode || null
  );

  const simStepRef = useRef(0);

  // Subscribe to tracked family member's journey
  useEffect(() => {
    if (!activeWatchCode) {
      setTrackedJourney(null);
      return;
    }
    const unsub = subscribeJourneyByCode(activeWatchCode, (j) => {
      if (!j) {
        setTrackError(`No active shared journey found for code ${activeWatchCode}.`);
        setTrackedJourney(null);
      } else {
        setTrackError(null);
        setTrackedJourney(j);
      }
    });
    return () => unsub();
  }, [activeWatchCode]);

  // Real browser GPS watchPosition when enabled
  useEffect(() => {
    if (!gpsActive || !activeJourney || activeJourney.status !== 'active') return;
    if (!navigator.geolocation) {
      setGpsError('Browser GPS unavailable; use Route Walk Simulation below.');
      setGpsActive(false);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        void updateJourneyProgress(
          activeJourney.id,
          pos.coords.latitude,
          pos.coords.longitude,
          Math.min(95, activeJourney.progressPct + 5),
          Math.max(1, activeJourney.etaMinutes - 1)
        );
      },
      () => {
        setGpsError('GPS access denied. Switch to Route Walk Simulation to demonstrate live tracking.');
        setGpsActive(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [gpsActive, activeJourney?.id, activeJourney?.status]);

  // Smooth simulated walk along selected route coordinates
  useEffect(() => {
    if (!simulating || !activeJourney || activeJourney.status !== 'active') return;
    const coords = activeRoute?.coordinates || [
      [activeJourney.currentLat, activeJourney.currentLng],
      [activeJourney.destLat, activeJourney.destLng],
    ];
    if (coords.length < 2) return;

    const timer = setInterval(() => {
      simStepRef.current = Math.min(coords.length - 1, simStepRef.current + Math.max(1, Math.floor(coords.length / 18)));
      const idx = simStepRef.current;
      const [lat, lng] = coords[idx];
      const pct = Math.round((idx / (coords.length - 1)) * 100);
      const remainingMins = Math.max(0, Math.round(((100 - pct) / 100) * Math.max(5, activeJourney.etaMinutes)));

      if (pct >= 100) {
        setSimulating(false);
        void updateJourneyStatus(activeJourney.id, 'arrived', lat, lng, 100, 0);
      } else {
        void updateJourneyProgress(activeJourney.id, lat, lng, pct, remainingMins);
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [simulating, activeJourney?.id, activeJourney?.status, activeRoute]);

  const handleCopyShareLink = async (code: string) => {
    const shareUrl = `${window.location.origin}/?track=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    if (!contactName.trim()) {
      setContactError('Contact name is required.');
      return;
    }
    const phoneErr = validatePhone(contactPhone);
    if (phoneErr) {
      setContactError(phoneErr);
      return;
    }
    setSavingContact(true);
    try {
      await addEmergencyContact(user.uid, {
        name: contactName,
        relation: contactRelation,
        phone: contactPhone,
      });
      setContactName('');
      setContactPhone('');
    } finally {
      setSavingContact(false);
    }
  };

  const handleLookupTrack = (e: React.FormEvent) => {
    e.preventDefault();
    const code = trackCodeInput.trim().toUpperCase();
    const err = validateShareCode(code);
    if (err) {
      setTrackError(err);
      return;
    }
    setTrackError(null);
    setActiveWatchCode(code);
  };

  const mapJourney = trackedJourney || activeJourney;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Active Journey & Family Contacts */}
      <div className="lg:col-span-5 space-y-5">
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-950">
                Live Journey Sharing
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time location link synced via Cloud Firestore
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activeJourney && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                  <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
                  Live
                </span>
              )}
              {onAskAi && (
                <button
                  type="button"
                  onClick={() =>
                    onAskAi(
                      activeJourney
                        ? `Give me real-time safety guidance for my active journey from ${activeJourney.originLabel} to ${activeJourney.destinationLabel}.`
                        : 'How do I share a live journey safely and prepare my emergency contacts?'
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold rounded-lg cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-teal-400" />
                  <span>Ask AI</span>
                </button>
              )}
            </div>
          </div>

          {activeJourney ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Share Code</span>
                  <span className="font-mono text-sm font-bold text-slate-950">
                    {activeJourney.shareCode}
                  </span>
                </div>
                <div className="text-xs text-slate-700">
                  {activeJourney.originLabel} → {activeJourney.destinationLabel}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 pt-1 tabular-nums">
                  <span>Progress: {activeJourney.progressPct}%</span>
                  <span>ETA: {activeJourney.etaMinutes} min</span>
                  <span>Safety: {activeJourney.safetyScore}/100</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-600 transition-all duration-300"
                    style={{ width: `${activeJourney.progressPct}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyShareLink(activeJourney.shareCode)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Tracking Link Copied' : 'Copy Family Share Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void toggleJourneySharing(activeJourney.id, !activeJourney.isShared)
                  }
                  className="px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
                >
                  {activeJourney.isShared ? 'Pause Sharing' : 'Resume Sharing'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setSimulating(false);
                    setGpsActive((v) => !v);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    gpsActive
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5 inline mr-1.5" />
                  {gpsActive ? 'Live GPS Active' : 'Stream Device GPS'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGpsActive(false);
                    setSimulating((v) => !v);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    simulating
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5 inline mr-1.5" />
                  {simulating ? 'Simulating Walk...' : 'Simulate Walk'}
                </button>
              </div>

              {gpsError && <p className="text-xs text-amber-700">{gpsError}</p>}

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setSimulating(false);
                    setGpsActive(false);
                    void updateJourneyStatus(
                      activeJourney.id,
                      'arrived',
                      activeJourney.destLat,
                      activeJourney.destLng,
                      100,
                      0
                    );
                  }}
                  className="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Arrived Safe
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSimulating(false);
                    setGpsActive(false);
                    void updateJourneyStatus(
                      activeJourney.id,
                      'cancelled',
                      activeJourney.currentLat,
                      activeJourney.currentLng,
                      activeJourney.progressPct,
                      activeJourney.etaMinutes
                    );
                  }}
                  className="py-2 px-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg cursor-pointer"
                >
                  End Share
                </button>
                <button
                  type="button"
                  onClick={onTriggerSos}
                  className="py-2 px-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Trigger SOS
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
              No active journey right now. Select a route in the <strong className="text-slate-900">Route Planner</strong> tab and click <strong className="text-slate-900">Start Live Journey</strong> to generate a family tracking link.
            </div>
          )}
        </section>

        {/* Track a Family Member by Share Code */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="font-display text-sm font-bold text-slate-950">
            Track a Family Member
          </h2>
          <form onSubmit={handleLookupTrack} className="flex gap-2">
            <input
              type="text"
              value={trackCodeInput}
              onChange={(e) => setTrackCodeInput(e.target.value.toUpperCase())}
              placeholder="Enter share code (e.g. SH-7K4P9M)"
              className="flex-1 h-9 px-3 text-xs font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            <button
              type="submit"
              className="px-3.5 h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Track</span>
            </button>
          </form>
          {trackError && <p className="text-xs text-red-600">{trackError}</p>}
          {trackedJourney && (
            <div className="p-3 rounded-lg bg-teal-50/70 border border-teal-200 text-xs space-y-1">
              <div className="flex items-center justify-between font-semibold text-slate-900">
                <span>
                  <Eye className="w-3.5 h-3.5 inline mr-1 text-teal-700" />
                  Watching {trackedJourney.travelerName}
                </span>
                <span className="uppercase font-mono">{trackedJourney.status}</span>
              </div>
              <p className="text-slate-600">
                {trackedJourney.originLabel} → {trackedJourney.destinationLabel}
              </p>
              <p className="text-slate-600 tabular-nums">
                Progress {trackedJourney.progressPct}% · ETA {trackedJourney.etaMinutes} min
              </p>
            </div>
          )}
        </section>

        {/* Private Emergency Contacts */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-display text-sm font-bold text-slate-950">
              Trusted Family Contacts ({contacts.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Stored privately under your account for SOS notifications
            </p>
          </div>

          <form onSubmit={handleAddContact} className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact name"
                maxLength={80}
                className="h-9 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <input
                type="text"
                value={contactRelation}
                onChange={(e) => setContactRelation(e.target.value)}
                placeholder="Relation (e.g. Mother)"
                maxLength={40}
                className="h-9 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Phone (+91 98...)"
                maxLength={24}
                className="flex-1 h-9 px-3 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="submit"
                disabled={savingContact}
                className="px-3.5 h-9 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
            {contactError && <p className="text-xs text-red-600">{contactError}</p>}
          </form>

          {contacts.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <li key={c.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      <UserCheck className="w-3.5 h-3.5 inline mr-1.5 text-teal-700" />
                      {c.name} · <span className="font-normal text-slate-500">{c.relation}</span>
                    </p>
                    <p className="text-xs font-mono text-slate-600 mt-0.5">{c.phone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${c.phone}`}
                      aria-label={`Call ${c.name}`}
                      className="p-1.5 text-slate-500 hover:text-teal-700 rounded"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => void deleteEmergencyContact(user.uid, c.id)}
                      aria-label={`Remove ${c.name}`}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">
              No trusted contacts saved yet. Add at least one family member.
            </p>
          )}
        </section>
      </div>

      {/* Right Column: Live Tracking Map & Recent Journeys */}
      <div className="lg:col-span-7 space-y-5">
        <SafetyMap
          center={
            mapJourney
              ? { lat: mapJourney.currentLat, lng: mapJourney.currentLng }
              : { lat: 12.9716, lng: 77.5946 }
          }
          routes={activeRoute && !trackedJourney ? [activeRoute] : []}
          selectedRouteId={activeRoute?.id || null}
          destination={
            mapJourney ? { lat: mapJourney.destLat, lng: mapJourney.destLng } : null
          }
          liveTraveler={
            mapJourney
              ? {
                  lat: mapJourney.currentLat,
                  lng: mapJourney.currentLng,
                  label: `${mapJourney.travelerName} (${mapJourney.progressPct}%)`,
                  isSos: mapJourney.status === 'sos',
                }
              : null
          }
          className="h-[440px] lg:h-[540px] w-full"
        />

        {myJourneys.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-display text-sm font-bold text-slate-950 mb-3">
              Recent Journey History
            </h2>
            <div className="divide-y divide-slate-100">
              {myJourneys.slice(0, 5).map((j) => (
                <div key={j.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {j.originLabel} → {j.destinationLabel}
                    </p>
                    <p className="text-slate-500 mt-0.5 tabular-nums">
                      Code {j.shareCode} · {j.routeName} · Safety {j.safetyScore}/100
                    </p>
                  </div>
                  <span className="font-mono font-medium capitalize text-slate-700 shrink-0">
                    {j.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
