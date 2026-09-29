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

export const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
