import { User } from 'firebase/auth';
import { AlertOctagon, CheckCircle2, PhoneCall, ShieldAlert, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import {
  cancelSosIncident,
  triggerSosIncident,
  updateJourneyStatus,
} from '../services/firestoreService';
import { reverseGeocode } from '../services/geocoding';
import { BLUEPRINT_LIMITS } from '../services/validation';
import {
  AnalyzedRoute,
  EmergencyContact,
  EmergencyIncident,
  IncidentCategory,
  Journey,
} from '../types/safeher';

interface SosModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  activeJourney: Journey | null;
  activeRoute: AnalyzedRoute | null;
  activeIncident: EmergencyIncident | null;
  contacts: EmergencyContact[];
  onAskEmergencyAi?: (prompt: string) => void;
}

const CATEGORIES: { id: IncidentCategory; label: string }[] = [
  { id: 'pursuit', label: 'Being Followed / Pursuit' },
  { id: 'harassment', label: 'Harassment / Threat' },
  { id: 'poor_lighting', label: 'Unlit / Unsafe Stretch' },
  { id: 'stranded', label: 'Stranded / Transit Issue' },
  { id: 'medical', label: 'Medical Emergency' },
  { id: 'other', label: 'Other Urgent Distress' },
];

export function SosModal({
  isOpen,
  onClose,
  user,
  activeJourney,
  activeRoute,
  activeIncident,
  contacts,
  onAskEmergencyAi,
}: SosModalProps) {
  const [category, setCategory] = useState<IncidentCategory>('pursuit');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!isOpen) return null;

  const handleSendSos = async () => {
    setSending(true);
    try {
      let lat = activeJourney?.currentLat ?? activeRoute?.coordinates[0]?.[0] ?? 12.9716;
      let lng = activeJourney?.currentLng ?? activeRoute?.coordinates[0]?.[1] ?? 77.5946;

      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 3500,
            })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // Use journey or route coordinate fallback
        }
      }

      const place = await reverseGeocode(lat, lng);
      const nearestStation =
        activeRoute?.breakdown.nearestPoliceName || 'Nearest City Police Control';

      await triggerSosIncident({
        user,
        journeyId: activeJourney?.id || '',
        category,
        severity: 'critical',
        lat,
        lng,
        locationLabel: place.shortName || place.label,
        nearestStation,
        notes: notes.trim() || 'Emergency SOS triggered via SafeHer.',
      });

      if (activeJourney && activeJourney.status === 'active') {
        await updateJourneyStatus(
          activeJourney.id,
          'sos',
          lat,
          lng,
          activeJourney.progressPct,
          activeJourney.etaMinutes
        );
      }
      setNotes('');
    } finally {
      setSending(false);
    }
  };

  const handleMarkSafe = async () => {
    if (!activeIncident) return;
    setCancelling(true);
    try {
      await cancelSosIncident(
        activeIncident.id,
        'User confirmed they reached a safe location.'
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sos-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <h2 id="sos-modal-title" className="font-display text-lg font-bold text-slate-950">
                {activeIncident ? 'SOS Alert Active' : 'Emergency SOS Dispatch'}
              </h2>
              <p className="text-xs text-slate-500">
                {activeIncident
                  ? 'Live coordinates broadcast to Police Dispatch'
                  : 'Broadcasts your GPS location to the authorized Police Dashboard'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close SOS modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {activeIncident ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-red-800">
                <span>
                  <ShieldAlert className="w-4 h-4 inline mr-1.5" />
                  Incident {activeIncident.id}
                </span>
                <span className="font-mono uppercase">{activeIncident.status}</span>
              </div>
              <p className="text-slate-800">Location: {activeIncident.locationLabel}</p>
              <p className="text-slate-700">
                Nearest Station: {activeIncident.nearestStation}
              </p>
              {activeIncident.assignedUnit && (
                <p className="font-semibold text-emerald-800">
                  Assigned Patrol Unit: {activeIncident.assignedUnit}
                </p>
              )}
              {activeIncident.officerNotes && (
                <p className="text-slate-700">
                  Dispatcher Note: {activeIncident.officerNotes}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <a
                href="tel:112"
                className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Call Emergency 112</span>
              </a>
              <a
                href="tel:1091"
                className="py-2.5 px-3 border border-slate-300 hover:bg-slate-50 text-slate-900 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Women Helpline 1091</span>
              </a>
            </div>

            {contacts.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-700 mb-1.5">
                  Quick-Dial Trusted Family Contacts
                </p>
                <div className="flex flex-wrap gap-2">
                  {contacts.map((c) => (
                    <a
                      key={c.id}
                      href={`tel:${c.phone}`}
                      className="px-3 py-1.5 border border-slate-200 hover:border-teal-600 rounded-lg text-xs text-slate-800"
                    >
                      {c.name} ({c.relation})
                    </a>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={cancelling}
              onClick={() => void handleMarkSafe()}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{cancelling ? 'Updating Status...' : 'I Am Safe — Close SOS Alert'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                Select Situation
              </span>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`text-left px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      category === c.id
                        ? 'border-red-600 bg-red-50 text-red-900'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="sos-notes" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Optional Context for Responders
              </label>
              <textarea
                id="sos-notes"
                rows={2}
                maxLength={BLUEPRINT_LIMITS.notesMaxLength}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Clothing, landmark, vehicle details, or immediate danger..."
                className="w-full p-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void handleSendSos()}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
              >
                {sending ? 'Broadcasting SOS...' : 'Send SOS Alert Now'}
              </button>
            </div>

            {onAskEmergencyAi && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAskEmergencyAi(
                    `I need immediate emergency safety guidance (${category.replace('_', ' ')}). Tell me the nearest police station and my authorized emergency contacts.`
                  );
                }}
                className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span>Get AI Emergency Guidance &amp; Nearest Police</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
