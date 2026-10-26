/**
 * Avatars are shown with next/image, whose optimizer only fetches hosts listed in
 * next.config.js. Accepting anything else would either break the image or widen
 * what the server can be made to fetch, so only these sources are allowed:
 *   - a Google profile picture (https://*.googleusercontent.com/...)
 *   - an image data URL (what /api/auth/upload-image stores)
 */
const MAX_AVATAR_DATA_URL_LENGTH = 3_000_000;
const DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;

export function isAllowedAvatarUrl(value: unknown): value is string | null | '' {
  if (value === null || value === '') return true;
  if (typeof value !== 'string') return false;

  if (value.startsWith('data:')) {
    return value.length <= MAX_AVATAR_DATA_URL_LENGTH && DATA_URL.test(value);
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))
    );
  } catch {
    return false;
  }
}

/**
 * A movement's `created_at` is client-supplied (users enter past receipts), but it feeds velocity
 * forecasts and date-ranged reports, so it must be believable: at most a year back and at most a day
 * ahead (the UI sends the start of the chosen day in UTC, which can be a few hours ahead of "now" for
 * users east of UTC).
 */
export const MOVEMENT_MAX_AGE_DAYS = 366;
export const MOVEMENT_MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

export type ParsedDate = { ok: true; iso: string } | { ok: false; detail: string };

export function parseMovementDate(value: unknown, now: Date = new Date()): ParsedDate {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return { ok: false, detail: 'created_at is not a valid date' };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { ok: false, detail: 'created_at is not a valid date' };
  const oldest = now.getTime() - MOVEMENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  if (parsed.getTime() < oldest) {
    return { ok: false, detail: `created_at cannot be more than ${MOVEMENT_MAX_AGE_DAYS} days in the past` };
  }
  if (parsed.getTime() > now.getTime() + MOVEMENT_MAX_FUTURE_MS) {
    return { ok: false, detail: 'created_at cannot be in the future' };
  }
  return { ok: true, iso: parsed.toISOString() };
}

/** bcrypt only uses the first 72 bytes of a password; longer ones would silently be truncated. */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_BYTES = 72;

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Upper bound for a location capacity (the database function behind PUT uses the same 9 digits). */
export const MAX_LOCATION_CAPACITY = 999_999_999;
