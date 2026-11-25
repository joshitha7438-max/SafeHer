# SafeHer Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Identity Integrity**: Every user-created document (`users`, `emergency_contacts`, `journeys`, `incidents`, `unsafe_reports`, `officer_requests`) must bind its ownership field (`uid`, `ownerId`, `reporterId`) strictly to `request.auth.uid`, and reject unverified email tokens (`request.auth.token.email_verified == true`).
2. **No Self-Assigned Roles**: Creating `/users/{userId}` strictly enforces `role == 'citizen'`. Only `isAdmin()` can grant police access via `/police_officers/{officerId}` or modify user roles.
3. **PII Isolation**: Phone numbers (`emergency_contacts`) are isolated in `/users/{userId}/emergency_contacts/{contactId}` and readable/writable exclusively by `isOwner(userId)`. Shared `journeys` exclude phone numbers, emails, and home addresses.
4. **System/Officer Field Protection**: On `/incidents/{incidentId}` creation, `status` must equal `'active'`, and `officerNotes` and `assignedUnit` must be empty strings `""`. Only `isPolice()` can transition incidents to `acknowledged`, `dispatched`, or `resolved`.
5. **Terminal State Locking**: Completed journeys (`arrived`, `cancelled`) and closed incidents (`resolved`, `cancelled_by_user`) cannot be mutated unless overridden by `isAdmin()`.
6. **Temporal Integrity & Path Hardening**: All `createdAt` / `updatedAt` fields must equal `request.time`, all IDs must match `^[a-zA-Z0-9_\-]+$` with length `<= 128`, and every string/list has strict upper bounds.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Self-Assigned Police Role**: `POST /users/attackerUid` with `{ "uid": "attackerUid", "displayName": "Attacker", "role": "police" }` -> `PERMISSION_DENIED`.
2. **Shadow Field Injection**: `POST /unsafe_reports/rep1` with valid fields + `{ "isVerifiedByPolice": true }` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on SOS**: `POST /incidents/inc1` with `{ "reporterId": "victimUid", ... }` while signed in as `attackerUid` -> `PERMISSION_DENIED`.
4. **PII Snooping Across Users**: `GET /users/victimUid/emergency_contacts/c1` by `otherSignedInUid` -> `PERMISSION_DENIED`.
5. **Client Timestamp Forgery**: `POST /journeys/SH-123456` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> `PERMISSION_DENIED`.
6. **Path Poisoning (ID Overflow / Traversal)**: `PUT /unsafe_reports/../../admins/attacker` or 300-char ID -> `PERMISSION_DENIED`.
7. **Unauthorized Incident Dispatch**: `PATCH /incidents/inc1` by non-police citizen setting `{ "status": "resolved", "assignedUnit": "Unit-9" }` -> `PERMISSION_DENIED`.
8. **Mutating Resolved Incident**: `PATCH /incidents/incResolved` by reporter changing `notes` after `status == 'resolved'` -> `PERMISSION_DENIED`.
9. **Mutating Arrived Journey**: `PATCH /journeys/SH-ARRIVED` by owner changing `status` back to `'active'` -> `PERMISSION_DENIED`.
10. **Blanket Query Scraping on Incidents**: `LIST /incidents` by non-police user without `where('reporterId', '==', uid)` -> `PERMISSION_DENIED`.
11. **Oversized Description Denial-of-Wallet**: `POST /unsafe_reports/repBig` with `description` of 5,000 characters (`maxLength: 500`) -> `PERMISSION_DENIED`.
12. **Unverified Email Spoof**: Write attempt where `request.auth.token.email == 'joshitha.7438@gmail.com'` but `request.auth.token.email_verified == false` -> `PERMISSION_DENIED`.
