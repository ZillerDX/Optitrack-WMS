import { createHash } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Required server-side configuration. Read lazily (at request time) so that
 * `next build` succeeds without secrets, but a misconfigured deployment fails
 * loudly instead of silently falling back to a publicly known key.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getJwtSecret(): Uint8Array {
  const secret = requireEnv('SECRET_KEY');
  if (secret.length < 32) {
    throw new Error('SECRET_KEY must be at least 32 characters long');
  }
  return new TextEncoder().encode(secret);
}

export async function supabaseRest(path: string, options: RequestInit = {}) {
  // Service-role key only: all access control is enforced in these route
  // handlers (RLS denies anon). Never fall back to the anon key.
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const url = `${requireEnv('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/${path}`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
}

export async function createSessionToken(payload: { sub: string; email: string; role: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ['HS256'] });
    // Scoped tokens (e.g. the emailed password-reset link) are not sessions.
    if (payload.scope !== undefined) return null;
    return payload;
  } catch {
    return null;
  }
}

export const PASSWORD_RESET_SCOPE = 'password_reset';

/** Digest of the current password hash; embedded in reset tokens so they die once the password changes. */
export function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

export async function createPasswordResetToken(userId: number, passwordHash: string) {
  return await new SignJWT({
    sub: String(userId),
    scope: PASSWORD_RESET_SCOPE,
    pwd: passwordFingerprint(passwordHash),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(getJwtSecret());
}

export async function verifyPasswordResetToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (payload.scope !== PASSWORD_RESET_SCOPE || !payload.sub || typeof payload.pwd !== 'string') {
      return null;
    }
    return payload as typeof payload & { sub: string; pwd: string };
  } catch {
    return null;
  }
}

export interface AuthUser {
  id: number;
  email: string;
  role: string;
}

export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload || !payload.sub) return null;

  return {
    id: Number(payload.sub),
    email: (payload.email as string) || '',
    role: 'ADMIN',
  };
}