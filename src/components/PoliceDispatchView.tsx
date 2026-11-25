import { User } from 'firebase/auth';
import {
  CheckCircle2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  approveOfficerRequest,
  rejectOfficerRequest,
  revokeOfficer,
  subscribeAllIncidents,
  subscribeAllUnsafeReports,
  subscribeMyOfficerRequest,
  subscribeOfficerRequests,
  subscribePoliceRoster,
  submitOfficerRequest,
  updateIncidentDispatch,
  updateUnsafeReportStatus,
} from '../services/firestoreService';
import { BLUEPRINT_LIMITS, validateBadgeNumber } from '../services/validation';
import {
  EmergencyIncident,
  IncidentStatus,
  LatLng,
  OfficerRequest,
  PoliceOfficer,
  UnsafeReport,
  UnsafeReportStatus,
} from '../types/safeher';
import { SafetyMap } from './SafetyMap';

interface PoliceDispatchViewProps {
  user: User;
  isPolice: boolean;
  isAdmin: boolean;
  onAskAi?: (prefillPrompt?: string) => void;
}

export function PoliceDispatchView({
  user,
  isPolice,
  isAdmin,
  onAskAi,
}: PoliceDispatchViewProps) {
  const [incidents, setIncidents] = useState<EmergencyIncident[]>([]);
  const [reports, setReports] = useState<UnsafeReport[]>([]);
  const [requests, setRequests] = useState<OfficerRequest[]>([]);
  const [officers, setOfficers] = useState<PoliceOfficer[]>([]);
  const [myRequest, setMyRequest] = useState<OfficerRequest | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [assignedUnitInput, setAssignedUnitInput] = useState('');
  const [officerNotesInput, setOfficerNotesInput] = useState('');
  const [focusPoint, setFocusPoint] = useState<LatLng | null>(null);
  const [savingDispatch, setSavingDispatch] = useState(false);

  // Officer authorization request form (for non-police signed-in users)
  const [badgeInput, setBadgeInput] = useState('');
  const [precinctInput, setPrecinctInput] = useState('');
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqSubmitting, setReqSubmitting] = useState(false);

  useEffect(() => {
    if (!isPolice) {
      const unsubReq = subscribeMyOfficerRequest(user.uid, setMyRequest);
      return () => unsubReq();
    }

    const unsubInc = subscribeAllIncidents(setIncidents);
    const unsubRep = subscribeAllUnsafeReports(setReports);

    let unsubReqs: (() => void) | undefined;
    let unsubOfficers: (() => void) | undefined;
    if (isAdmin) {
      unsubReqs = subscribeOfficerRequests(setRequests);
      unsubOfficers = subscribePoliceRoster(setOfficers);
    }

    return () => {
      unsubInc();
      unsubRep();
      if (unsubReqs) unsubReqs();
      if (unsubOfficers) unsubOfficers();
    };
  }, [isPolice, isAdmin, user.uid]);

  const selectedIncident =
    incidents.find((i) => i.id === selectedIncidentId) || incidents[0] || null;

  useEffect(() => {
    if (selectedIncident) {
      setAssignedUnitInput(selectedIncident.assignedUnit || '');
      setOfficerNotesInput(selectedIncident.officerNotes || '');
    }
  }, [selectedIncident?.id]);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqError(null);
    const badgeErr = validateBadgeNumber(badgeInput);
    if (badgeErr) {
      setReqError(badgeErr);
      return;
    }
    if (precinctInput.trim().length < BLUEPRINT_LIMITS.precinctMinLength) {
      setReqError('Enter your precinct or control room name.');
      return;
    }
    setReqSubmitting(true);
    try {
      await submitOfficerRequest(user, badgeInput, precinctInput);
    } finally {
      setReqSubmitting(false);
    }
  };

  if (!isPolice) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <section className="bg-white border border-slate-200 rounded-xl p-8 space-y-5">
          <div className="flex items-start gap-3">
            <Lock className="w-6 h-6 text-slate-700 shrink-0 mt-0.5" />
            <div>
              <h1 className="font-display text-xl font-bold text-slate-950">
                Authorized Police Dispatch Access Required
              </h1>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                Emergency SOS telemetry and citizen incident details are strictly protected by Firestore role-based access rules. Only verified police dispatchers and administrators may view live emergency feeds.
              </p>
            </div>
          </div>

          {myRequest ? (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <p className="font-semibold text-slate-900">
                Authorization Request Status:{' '}
                <span className="uppercase font-mono">{myRequest.status}</span>
              </p>
              <p className="text-slate-600">
                Badge {myRequest.badgeNumber} · {myRequest.precinct}
              </p>
            </div>
          ) : (
            <form onSubmit={handleRequestSubmit} className="space-y-3 pt-2 border-t border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">
                Request Dispatcher Authorization
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={badgeInput}
                  onChange={(e) => setBadgeInput(e.target.value.toUpperCase())}
                  placeholder="Badge ID (e.g. BLR-402)"
                  maxLength={BLUEPRINT_LIMITS.badgeMaxLength}
                  className="h-10 px-3 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <input
                  type="text"
                  value={precinctInput}
                  onChange={(e) => setPrecinctInput(e.target.value)}
                  placeholder="Station / Control Room"
                  maxLength={BLUEPRINT_LIMITS.precinctMaxLength}
                  className="h-10 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              {reqError && <p className="text-xs text-red-600">{reqError}</p>}
              <button
                type="submit"
                disabled={reqSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>{reqSubmitting ? 'Submitting...' : 'Submit Authorization Request'}</span>
              </button>
            </form>
          )}
        </section>
      </div>
    );
  }

  const filteredIncidents = incidents.filter((inc) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'open') {
      return inc.status === 'active' || inc.status === 'acknowledged' || inc.status === 'dispatched';
    }
    return inc.status === 'resolved' || inc.status === 'cancelled_by_user';
  });

  const activeCount = incidents.filter((i) => i.status === 'active').length;
  const dispatchedCount = incidents.filter(
    (i) => i.status === 'acknowledged' || i.status === 'dispatched'
  ).length;
  const resolvedCount = incidents.filter((i) => i.status === 'resolved').length;
  const pendingHazards = reports.filter((r) => r.status === 'pending').length;

  const handleDispatchUpdate = async (newStatus: IncidentStatus) => {
    if (!selectedIncident) return;
    setSavingDispatch(true);
    try {
      await updateIncidentDispatch(
        selectedIncident.id,
        newStatus,
        assignedUnitInput || 'Patrol-01',
        officerNotesInput
      );
    } finally {
      setSavingDispatch(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top KPI Summary Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Active SOS Alerts</span>
          <p className="font-mono text-2xl font-bold text-red-600 tabular-nums mt-1">
            {activeCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Units Dispatched</span>
          <p className="font-mono text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {dispatchedCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Resolved Incidents</span>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-1">
            {resolvedCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Pending Hazard Reviews</span>
          <p className="font-mono text-2xl font-bold text-slate-950 tabular-nums mt-1">
            {pendingHazards}
          </p>
        </div>
      </section>

      {/* Main Split: Incident Queue + Live Dispatch Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-display text-base font-bold text-slate-950">
              SOS Incident Queue
            </h1>
            <div className="flex items-center gap-2">
              {onAskAi && (
                <button
                  type="button"
                  onClick={() =>
                    onAskAi(
                      `Give a concise dispatch briefing on our ${activeCount} active SOS alerts and ${pendingHazards} pending hazard reports.`
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold rounded-md cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-teal-400" />
                  <span>AI Brief</span>
                </button>
              )}
            <div className="flex p-1 bg-slate-100 rounded-lg">
              {(['open', 'resolved', 'all'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-2.5 py-1 text-xs font-medium capitalize rounded-md cursor-pointer ${
                    statusFilter === tab
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            </div>
          </div>

          {filteredIncidents.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No {statusFilter === 'all' ? '' : statusFilter} emergency incidents at this time.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
              {filteredIncidents.map((inc) => {
                const isSel = inc.id === selectedIncident?.id;
                return (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => {
                      setSelectedIncidentId(inc.id);
                      setFocusPoint({ lat: inc.lat, lng: inc.lng });
                    }}
                    className={`w-full text-left py-3 px-3 rounded-lg transition-colors cursor-pointer ${
                      isSel ? 'bg-red-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-950">
                        <ShieldAlert className="w-3.5 h-3.5 inline mr-1.5 text-red-600" />
                        {inc.reporterName}
                      </span>
                      <span className="font-mono text-[11px] uppercase font-semibold text-red-700">
                        {inc.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 truncate">
                      {inc.locationLabel}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Category: {inc.category.replace('_', ' ')} · Station: {inc.nearestStation}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected Incident Dispatch Action Panel */}
          {selectedIncident && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-950">
                  Dispatch Controls · {selectedIncident.id}
                </h2>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {selectedIncident.lat.toFixed(4)}, {selectedIncident.lng.toFixed(4)}
                </span>
              </div>
              {selectedIncident.notes && (
                <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  Caller note: {selectedIncident.notes}
                </p>
              )}

              <div className="space-y-2">
                <input
                  type="text"
                  value={assignedUnitInput}
                  onChange={(e) => setAssignedUnitInput(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.assignedUnitMaxLength}
                  placeholder="Assign patrol unit (e.g. Hoysala-14)"
                  className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <textarea
                  rows={2}
                  value={officerNotesInput}
                  onChange={(e) => setOfficerNotesInput(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.notesMaxLength}
                  placeholder="Officer dispatch notes & ETA..."
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={savingDispatch}
                  onClick={() => void handleDispatchUpdate('acknowledged')}
                  className="py-2 px-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  disabled={savingDispatch}
                  onClick={() => void handleDispatchUpdate('dispatched')}
                  className="py-2 px-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Dispatch Unit
                </button>
                <button
                  type="button"
                  disabled={savingDispatch}
                  onClick={() => void handleDispatchUpdate('resolved')}
                  className="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Mark Resolved
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="lg:col-span-7 space-y-5">
          <SafetyMap
            center={
              selectedIncident
                ? { lat: selectedIncident.lat, lng: selectedIncident.lng }
                : { lat: 12.9716, lng: 77.5946 }
            }
            incidents={incidents}
            unsafeReports={reports}
            focusPoint={focusPoint}
            className="h-[460px] lg:h-[520px] w-full"
          />
        </div>
      </div>

      {/* Community Hazard Verification Queue */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-display text-sm font-bold text-slate-950">
            Community Hazard Verification &amp; Patrol Assignment
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Category &amp; Details</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Officer Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.slice(0, 12).map((rep) => (
                <tr key={rep.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {rep.locationLabel}
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-md">
                    {rep.description}
                  </td>
                  <td className="py-3 px-4 capitalize font-medium">{rep.severity}</td>
                  <td className="py-3 px-4 font-mono uppercase text-[11px]">{rep.status}</td>
                  <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                    {(['verified', 'patrolled', 'dismissed'] as UnsafeReportStatus[]).map(
                      (st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() =>
                            void updateUnsafeReportStatus(rep.id, st, rep.severity)
                          }
                          className="px-2 py-1 border border-slate-200 hover:border-slate-400 rounded text-[11px] font-medium capitalize cursor-pointer"
                        >
                          {st}
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Admin-Only Officer Roster & Authorization Requests */}
      {isAdmin && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-sm font-bold text-slate-950">
              Pending Officer Access Requests ({requests.filter((r) => r.status === 'pending').length})
            </h2>
            {requests.filter((r) => r.status === 'pending').length === 0 ? (
              <p className="text-xs text-slate-500">No pending dispatcher requests.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {requests
                  .filter((r) => r.status === 'pending')
                  .map((req) => (
                    <div key={req.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="text-xs">
                        <p className="font-semibold text-slate-900">{req.officerName}</p>
                        <p className="text-slate-500 font-mono">
                          {req.badgeNumber} · {req.precinct}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void approveOfficerRequest(req)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void rejectOfficerRequest(req.id)}
                          className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-sm font-bold text-slate-950">
              Authorized Police Roster ({officers.length})
            </h2>
            {officers.length === 0 ? (
              <p className="text-xs text-slate-500">
                You are signed in as the primary system administrator. Approved officers appear here.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {officers.map((off) => (
                  <div key={off.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">
                        <ShieldCheck className="w-3.5 h-3.5 inline mr-1.5 text-teal-700" />
                        {off.officerName}
                      </p>
                      <p className="text-slate-500 font-mono">
                        {off.badgeNumber} · {off.precinct}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void revokeOfficer(off.uid)}
                      aria-label={`Revoke ${off.officerName}`}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              Admin account ({user.email}) has full dispatch and roster privileges.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
