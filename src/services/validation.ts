/**
 * Synchronized validation limits & regex patterns matching firebase-blueprint.json
 * and firestore.rules to guarantee outgoing mutations satisfy volumetric and format bounds.
 */

export const BLUEPRINT_LIMITS = {
  idMaxLength: 128,
  displayNameMaxLength: 80,
  relationMaxLength: 40,
  phoneMinLength: 5,
  phoneMaxLength: 24,
  shareCodeMinLength: 6,
  shareCodeMaxLength: 16,
  locationLabelMaxLength: 200,
  originDestMaxLength: 160,
  routeNameMaxLength: 80,
  nearestStationMaxLength: 160,
  notesMaxLength: 500,
  descriptionMinLength: 5,
  descriptionMaxLength: 500,
  badgeMinLength: 2,
  badgeMaxLength: 32,
  precinctMinLength: 2,
  precinctMaxLength: 100,
  assignedUnitMaxLength: 80,
} as const;

export const BLUEPRINT_PATTERNS = {
  id: /^[a-zA-Z0-9_\-]+$/,
  phone: /^[+0-9\s\-()]{5,24}$/,
  shareCode: /^[A-Z0-9\-]{6,16}$/,
  badgeNumber: /^[A-Z0-9\-]{2,32}$/,
} as const;

export function clampText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function clampCoord(lat: number, lng: number): { lat: number; lng: number } {
  const safeLat = Number.isFinite(lat) ? Math.max(-90, Math.min(90, lat)) : 0;
  const safeLng = Number.isFinite(lng) ? Math.max(-180, Math.min(180, lng)) : 0;
  return {
    lat: Number(safeLat.toFixed(6)),
    lng: Number(safeLng.toFixed(6)),
  };
}

export function generateSafeId(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      token += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 6; i++) {
      token += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return `${prefix}-${token}`;
}

export function validatePhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!BLUEPRINT_PATTERNS.phone.test(trimmed)) {
    return 'Enter a valid phone number (5–24 digits, spaces, +, -, or parentheses).';
  }
  return null;
}

export function validateShareCode(code: string): string | null {
  const normalized = code.trim().toUpperCase();
  if (!BLUEPRINT_PATTERNS.shareCode.test(normalized)) {
    return 'Share code must be 6–16 uppercase letters, numbers, or hyphens (e.g. SH-7K4P9M).';
  }
  return null;
}

export function validateBadgeNumber(badge: string): string | null {
  const normalized = badge.trim().toUpperCase();
  if (!BLUEPRINT_PATTERNS.badgeNumber.test(normalized)) {
    return 'Badge number must be 2–32 uppercase letters, numbers, or hyphens (e.g. BLR-402).';
  }
  return null;
}
