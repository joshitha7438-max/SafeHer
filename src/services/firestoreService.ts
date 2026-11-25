import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AnalyzedRoute,
  EmergencyContact,
  EmergencyIncident,
  IncidentCategory,
  IncidentStatus,
  Journey,
  JourneyStatus,
  OfficerRequest,
  PoliceOfficer,
  UnsafeCategory,
  UnsafeReport,
  UnsafeReportStatus,
  UserProfile,
} from '../types/safeher';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  BLUEPRINT_LIMITS,
  clampCoord,
  clampText,
  generateSafeId,
} from './validation';

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    const profile: UserProfile = {
      uid: user.uid,
      displayName: clampText(user.displayName || user.email?.split('@')[0] || 'SafeHer User', BLUEPRINT_LIMITS.displayNameMaxLength),
      role: 'citizen',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function checkPoliceAuthorization(
  user: User
): Promise<{ isAdmin: boolean; isPolice: boolean }> {
  const isBootstrapped =
    Boolean(user.emailVerified) &&
    user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  if (isBootstrapped) {
    return { isAdmin: true, isPolice: true };
  }

  let isAdmin = false;
  let isPolice = false;

  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    isAdmin = adminSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `admins/${user.uid}`);
  }

  try {
    const officerSnap = await getDoc(doc(db, 'police_officers', user.uid));
    isPolice = isAdmin || (officerSnap.exists() && officerSnap.data()?.active === true);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `police_officers/${user.uid}`);
  }

  return { isAdmin, isPolice };
}

// --- Emergency Contacts (Private Subcollection) ---
export function subscribeUserContacts(
  uid: string,
  callback: (contacts: EmergencyContact[]) => void
): Unsubscribe {
  const path = `users/${uid}/emergency_contacts`;
  const q = query(collection(db, 'users', uid, 'emergency_contacts'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: EmergencyContact[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<EmergencyContact, 'id'>),
      }));
      callback(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function addEmergencyContact(
  uid: string,
  input: { name: string; relation: string; phone: string }
): Promise<void> {
  const contactId = generateSafeId('CTC');
  const path = `users/${uid}/emergency_contacts/${contactId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'emergency_contacts', contactId), {
      ownerId: uid,
      name: clampText(input.name, BLUEPRINT_LIMITS.displayNameMaxLength),
      relation: clampText(input.relation, BLUEPRINT_LIMITS.relationMaxLength),
      phone: clampText(input.phone, BLUEPRINT_LIMITS.phoneMaxLength),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteEmergencyContact(uid: string, contactId: string): Promise<void> {
  const path = `users/${uid}/emergency_contacts/${contactId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'emergency_contacts', contactId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Live Journeys ---
export async function createLiveJourney(
  user: User,
  route: AnalyzedRoute,
  originLabel: string,
  destinationLabel: string
): Promise<string> {
  const shareCode = generateSafeId('SH');
  const path = `journeys/${shareCode}`;
  const startCoord = route.coordinates[0] || [12.9716, 77.5946];
  const endCoord = route.coordinates[route.coordinates.length - 1] || startCoord;
  const clampedStart = clampCoord(startCoord[0], startCoord[1]);
  const clampedEnd = clampCoord(endCoord[0], endCoord[1]);
  const etaMinutes = Math.max(1, Math.min(1440, Math.round(route.durationSeconds / 60)));

  try {
    await setDoc(doc(db, 'journeys', shareCode), {
      ownerId: user.uid,
      travelerName: clampText(
        user.displayName?.split(' ')[0] || 'Traveler',
        BLUEPRINT_LIMITS.displayNameMaxLength
      ),
      shareCode,
      originLabel: clampText(originLabel, BLUEPRINT_LIMITS.originDestMaxLength),
      destinationLabel: clampText(destinationLabel, BLUEPRINT_LIMITS.originDestMaxLength),
      routeName: clampText(route.name, BLUEPRINT_LIMITS.routeNameMaxLength),
      safetyScore: Math.max(0, Math.min(100, Math.round(route.breakdown.overallScore))),
      currentLat: clampedStart.lat,
      currentLng: clampedStart.lng,
      destLat: clampedEnd.lat,
      destLng: clampedEnd.lng,
      progressPct: 0,
      etaMinutes,
      status: 'active',
      isShared: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return shareCode;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateJourneyProgress(
  journeyId: string,
  lat: number,
  lng: number,
  progressPct: number,
  etaMinutes: number
): Promise<void> {
  const path = `journeys/${journeyId}`;
  const coord = clampCoord(lat, lng);
  try {
    await updateDoc(doc(db, 'journeys', journeyId), {
      currentLat: coord.lat,
      currentLng: coord.lng,
      progressPct: Math.max(0, Math.min(100, Math.round(progressPct))),
      etaMinutes: Math.max(0, Math.min(1440, Math.round(etaMinutes))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateJourneyStatus(
  journeyId: string,
  status: JourneyStatus,
  lat: number,
  lng: number,
  progressPct: number,
  etaMinutes: number
): Promise<void> {
  const path = `journeys/${journeyId}`;
  const coord = clampCoord(lat, lng);
  try {
    await updateDoc(doc(db, 'journeys', journeyId), {
      status,
      currentLat: coord.lat,
      currentLng: coord.lng,
      progressPct: Math.max(0, Math.min(100, Math.round(progressPct))),
      etaMinutes: Math.max(0, Math.min(1440, Math.round(etaMinutes))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleJourneySharing(journeyId: string, isShared: boolean): Promise<void> {
  const path = `journeys/${journeyId}`;
  try {
    await updateDoc(doc(db, 'journeys', journeyId), {
      isShared,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeJourneyByCode(
  shareCode: string,
  callback: (journey: Journey | null) => void
): Unsubscribe {
  const normalized = shareCode.trim().toUpperCase();
  const path = `journeys/${normalized}`;
  return onSnapshot(
    doc(db, 'journeys', normalized),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...(snap.data() as Omit<Journey, 'id'>) });
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
}

function toMillis(ts: unknown): number {
  if (ts && typeof ts === 'object' && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function subscribeMyJourneys(
  uid: string,
  callback: (journeys: Journey[]) => void
): Unsubscribe {
  const path = 'journeys';
  const q = query(collection(db, 'journeys'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Journey, 'id'>),
      }));
      items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

// --- Emergency SOS Incidents ---
export async function triggerSosIncident(input: {
  user: User;
  journeyId?: string;
  category: IncidentCategory;
  severity: 'critical' | 'high';
  lat: number;
  lng: number;
  locationLabel: string;
  nearestStation: string;
  notes: string;
}): Promise<string> {
  const incidentId = generateSafeId('SOS');
  const path = `incidents/${incidentId}`;
  const coord = clampCoord(input.lat, input.lng);

  try {
    await setDoc(doc(db, 'incidents', incidentId), {
      reporterId: input.user.uid,
      reporterName: clampText(
        input.user.displayName || input.user.email?.split('@')[0] || 'SafeHer User',
        BLUEPRINT_LIMITS.displayNameMaxLength
      ),
      journeyId: clampText(input.journeyId || '', BLUEPRINT_LIMITS.idMaxLength),
      category: input.category,
      severity: input.severity,
      status: 'active',
      lat: coord.lat,
      lng: coord.lng,
      locationLabel: clampText(input.locationLabel, BLUEPRINT_LIMITS.locationLabelMaxLength),
      nearestStation: clampText(input.nearestStation, BLUEPRINT_LIMITS.nearestStationMaxLength),
      notes: clampText(input.notes, BLUEPRINT_LIMITS.notesMaxLength),
      officerNotes: '',
      assignedUnit: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return incidentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cancelSosIncident(incidentId: string, notes: string): Promise<void> {
  const path = `incidents/${incidentId}`;
  try {
    await updateDoc(doc(db, 'incidents', incidentId), {
      status: 'cancelled_by_user',
      notes: clampText(notes, BLUEPRINT_LIMITS.notesMaxLength),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateIncidentDispatch(
  incidentId: string,
  status: IncidentStatus,
  assignedUnit: string,
  officerNotes: string
): Promise<void> {
  const path = `incidents/${incidentId}`;
  try {
    await updateDoc(doc(db, 'incidents', incidentId), {
      status,
      assignedUnit: clampText(assignedUnit, BLUEPRINT_LIMITS.assignedUnitMaxLength),
      officerNotes: clampText(officerNotes, BLUEPRINT_LIMITS.notesMaxLength),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeMyIncidents(
  uid: string,
  callback: (incidents: EmergencyIncident[]) => void
): Unsubscribe {
  const path = 'incidents';
  const q = query(collection(db, 'incidents'), where('reporterId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<EmergencyIncident, 'id'>),
      }));
      items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeAllIncidents(
  callback: (incidents: EmergencyIncident[]) => void
): Unsubscribe {
  const path = 'incidents';
  const q = query(collection(db, 'incidents'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EmergencyIncident, 'id'>),
        }))
      );
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

// --- Unsafe Location Reports ---
export async function submitUnsafeReport(input: {
  user: User;
  category: UnsafeCategory;
  severity: 'low' | 'medium' | 'high';
  timeConcern: 'night' | 'evening' | 'all_day';
  lat: number;
  lng: number;
  locationLabel: string;
  description: string;
}): Promise<string> {
  const reportId = generateSafeId('RPT');
  const path = `unsafe_reports/${reportId}`;
  const coord = clampCoord(input.lat, input.lng);

  try {
    await setDoc(doc(db, 'unsafe_reports', reportId), {
      reporterId: input.user.uid,
      reporterName: clampText(
        input.user.displayName?.split(' ')[0] || 'Community Member',
        BLUEPRINT_LIMITS.displayNameMaxLength
      ),
      category: input.category,
      severity: input.severity,
      timeConcern: input.timeConcern,
      status: 'pending',
      lat: coord.lat,
      lng: coord.lng,
      locationLabel: clampText(input.locationLabel, BLUEPRINT_LIMITS.locationLabelMaxLength),
      description: clampText(input.description, BLUEPRINT_LIMITS.descriptionMaxLength),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return reportId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUnsafeReportStatus(
  reportId: string,
  status: UnsafeReportStatus,
  severity: 'low' | 'medium' | 'high'
): Promise<void> {
  const path = `unsafe_reports/${reportId}`;
  try {
    await updateDoc(doc(db, 'unsafe_reports', reportId), {
      status,
      severity,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUnsafeReport(reportId: string): Promise<void> {
  const path = `unsafe_reports/${reportId}`;
  try {
    await deleteDoc(doc(db, 'unsafe_reports', reportId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeActiveUnsafeReports(
  callback: (reports: UnsafeReport[]) => void
): Unsubscribe {
  const path = 'unsafe_reports';
  const q = query(
    collection(db, 'unsafe_reports'),
    where('status', 'in', ['pending', 'verified', 'patrolled'])
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<UnsafeReport, 'id'>),
      }));
      items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeAllUnsafeReports(
  callback: (reports: UnsafeReport[]) => void
): Unsubscribe {
  const path = 'unsafe_reports';
  const q = query(collection(db, 'unsafe_reports'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<UnsafeReport, 'id'>),
        }))
      );
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

// --- Police Authorization & Officer Requests ---
export async function submitOfficerRequest(
  user: User,
  badgeNumber: string,
  precinct: string
): Promise<void> {
  const path = `officer_requests/${user.uid}`;
  try {
    await setDoc(doc(db, 'officer_requests', user.uid), {
      uid: user.uid,
      officerName: clampText(
        user.displayName || user.email?.split('@')[0] || 'Officer',
        BLUEPRINT_LIMITS.displayNameMaxLength
      ),
      badgeNumber: clampText(badgeNumber.toUpperCase(), BLUEPRINT_LIMITS.badgeMaxLength),
      precinct: clampText(precinct, BLUEPRINT_LIMITS.precinctMaxLength),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeMyOfficerRequest(
  uid: string,
  callback: (req: OfficerRequest | null) => void
): Unsubscribe {
  const path = `officer_requests/${uid}`;
  return onSnapshot(
    doc(db, 'officer_requests', uid),
    (snap) => {
      callback(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<OfficerRequest, 'id'>) }) : null);
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
}

export function subscribeOfficerRequests(
  callback: (requests: OfficerRequest[]) => void
): Unsubscribe {
  const path = 'officer_requests';
  const q = query(collection(db, 'officer_requests'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<OfficerRequest, 'id'>),
        }))
      );
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribePoliceRoster(
  callback: (officers: PoliceOfficer[]) => void
): Unsubscribe {
  const path = 'police_officers';
  const q = query(collection(db, 'police_officers'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PoliceOfficer, 'id'>),
        }))
      );
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function approveOfficerRequest(req: OfficerRequest): Promise<void> {
  const officerPath = `police_officers/${req.uid}`;
  const reqPath = `officer_requests/${req.id}`;
  try {
    await setDoc(doc(db, 'police_officers', req.uid), {
      uid: req.uid,
      officerName: clampText(req.officerName, BLUEPRINT_LIMITS.displayNameMaxLength),
      badgeNumber: clampText(req.badgeNumber, BLUEPRINT_LIMITS.badgeMaxLength),
      precinct: clampText(req.precinct, BLUEPRINT_LIMITS.precinctMaxLength),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, officerPath);
  }

  try {
    await updateDoc(doc(db, 'officer_requests', req.id), {
      status: 'approved',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, reqPath);
  }
}

export async function rejectOfficerRequest(requestId: string): Promise<void> {
  const path = `officer_requests/${requestId}`;
  try {
    await updateDoc(doc(db, 'officer_requests', requestId), {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function revokeOfficer(uid: string): Promise<void> {
  const path = `police_officers/${uid}`;
  try {
    await deleteDoc(doc(db, 'police_officers', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
