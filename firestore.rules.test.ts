/**
 * SafeHer Firestore Security Rules Verification Suite (Phase 0 TDD)
 * Validates that the "Dirty Dozen" adversarial payloads are rejected
 * with PERMISSION_DENIED and legitimate SafeHer workflows are permitted.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list';
  expected: 'PERMISSION_DENIED';
  payload: Record<string, unknown>;
}

export const DIRTY_DOZEN_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Self-Assigned Police Role on User Registration',
    collection: 'users/attackerUid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'attackerUid', displayName: 'Attacker', role: 'police' },
  },
  {
    id: 2,
    name: 'Shadow Field Injection on Unsafe Report',
    collection: 'unsafe_reports/rep_shadow',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      reporterId: 'user1',
      reporterName: 'User',
      category: 'no_streetlights',
      severity: 'high',
      timeConcern: 'night',
      status: 'pending',
      lat: 12.9716,
      lng: 77.5946,
      locationLabel: 'MG Road',
      description: 'Streetlights out near bus shelter.',
      isVerifiedByPolice: true,
    },
  },
  {
    id: 3,
    name: 'Identity Spoofing on SOS Incident',
    collection: 'incidents/inc_spoof',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { reporterId: 'victimUid', status: 'active' },
  },
  {
    id: 4,
    name: 'PII Snooping on Another User Emergency Contacts',
    collection: 'users/victimUid/emergency_contacts/c1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    payload: { callerUid: 'otherUserUid' },
  },
  {
    id: 5,
    name: 'Client Timestamp Forgery on Journey',
    collection: 'journeys/SH-123456',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { shareCode: 'SH-123456', createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 6,
    name: 'Path Poisoning / ID Length Overflow',
    collection: `unsafe_reports/${'A'.repeat(200)}`,
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { description: 'Oversized document path test.' },
  },
  {
    id: 7,
    name: 'Unauthorized Citizen Resolving SOS Incident',
    collection: 'incidents/inc_active',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { status: 'resolved', assignedUnit: 'Unit-9', officerNotes: 'Fake clear' },
  },
  {
    id: 8,
    name: 'Mutating Terminal Resolved Incident',
    collection: 'incidents/inc_resolved',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { notes: 'Post-resolution edit attempt' },
  },
  {
    id: 9,
    name: 'Reopening Arrived Journey After Terminal Lock',
    collection: 'journeys/SH-ARRIVED',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { status: 'active' },
  },
  {
    id: 10,
    name: 'Blanket Query Scraping on Incidents by Non-Police User',
    collection: 'incidents',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    payload: { callerUid: 'citizenUid', missingReporterFilter: true },
  },
  {
    id: 11,
    name: 'Oversized Description Payload (>500 chars)',
    collection: 'unsafe_reports/rep_big',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { description: 'X'.repeat(5000) },
  },
  {
    id: 12,
    name: 'Unverified Email Admin Spoof Attempt',
    collection: 'police_officers/rogueOfficer',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { email: 'joshitha.7438@gmail.com', email_verified: false },
  },
];
