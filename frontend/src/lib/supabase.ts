import { SignJWT, jwtVerify } from 'jose';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hdvalaxaujjyqcejhyqb.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkdmFsYXhhdWpqeXFjZWpoeXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjYwODQsImV4cCI6MjEwMzg0MjA4NH0.JbTv5a-PwcLgVdie7wZej1hZFBXgLErHDun3kE_I7wg';

const JWT_SECRET = new TextEncoder().encode(
  process.env.SECRET_KEY || 'optitrack-dev-secret-key-32-chars-minimum-safe'
);

export async function supabaseRest(path: string, options: RequestInit = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
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
    role: (payload.role as string) || 'ADMIN',
  };
}