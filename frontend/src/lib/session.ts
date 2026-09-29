import type { NextResponse } from 'next/server';

/**
 * The session lives in an httpOnly cookie so page scripts (and therefore XSS) cannot
 * read or copy it. In production it uses the `__Host-` prefix, which browsers only
 * accept when the cookie is Secure, has Path=/ and no Domain (so it cannot be set
 * from a sibling subdomain).
 */
const isProd = process.env.NODE_ENV === 'production';
export const SESSION_COOKIE = isProd ? '__Host-session' : 'session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

export function setSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests. SameSite=Lax already keeps the
 * browser from attaching the cookie to cross-site POST/PUT/DELETE; this is the second
 * layer: a request that changes data must come from this site's own origin.
 */
export function isSameOriginRequest(req: Request): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return true;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return req.headers.get('sec-fetch-site') === 'same-origin';
}
