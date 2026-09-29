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
