import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/supabase';
import type { FakePostgrest } from './fakePostgrest';

export const PASSWORD = 'correct-horse-1';

/** Cheap bcrypt cost: hashing speed is irrelevant to what these tests check. */
export const hash = (pw: string) => bcrypt.hashSync(pw, 4);

export interface TestUser {
  id: number;
  email: string;
  token: string;
}

export async function makeUser(db: FakePostgrest, email: string, extra: Record<string, unknown> = {}): Promise<TestUser> {
  const row = db.insert('users', {
    email,
    password_hash: hash(PASSWORD),
    first_name: 'Test',
    last_name: 'User',
    role: 'ADMIN',
    ...extra,
  });
  const token = await createSessionToken({ sub: String(row.id), email, role: 'ADMIN', tv: row.token_version ?? 0 });
  return { id: row.id, email, token };
}

export function req(
  method: string,
  body?: unknown,
  opts: { token?: string; headers?: Record<string, string>; url?: string } = {}
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  return new NextRequest(opts.url ?? 'http://app.test/api/x', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** The session token the server put in the Set-Cookie header (page scripts never see it). */
export function sessionFrom(res: Response): string {
  const cookie = res.headers.getSetCookie().find((c) => /^(__Host-)?session=/.test(c));
  if (!cookie) throw new Error('response has no session cookie');
  return decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='));
}

export const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
