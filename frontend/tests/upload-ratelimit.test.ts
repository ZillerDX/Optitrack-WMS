import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthCache } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/rateLimit';
import { POST as uploadImage } from '@/app/api/auth/upload-image/route';
import { createDb, FakePostgrest } from './helpers/fakePostgrest';
import { makeUser } from './helpers/http';

let db: FakePostgrest;

beforeEach(() => {
  db = createDb();
  clearAuthCache();
});

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

function upload(bytes: Uint8Array, type: string, token?: string, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new File([bytes as BlobPart], 'avatar.png', { type }));
  const h: Record<string, string> = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  return uploadImage(new Request('http://app.test/api/auth/upload-image', { method: 'POST', body: form, headers: h }) as any);
}

describe('POST /api/auth/upload-image', () => {
  it('requires a session', async () => {
    expect((await upload(PNG, 'image/png')).status).toBe(401);
  });

  it('stores a real image as a data URL of the type its bytes prove', async () => {
    const u = await makeUser(db, 'a@x.com');
    const res = await upload(PNG, 'image/png', u.token);
    expect(res.status).toBe(200);
    expect(db.tables.users[0].image_url).toMatch(/^data:image\/png;base64,/);
  });

  it('rejects HTML dressed up as an image, and a declared type that does not match the bytes', async () => {
    const u = await makeUser(db, 'a@x.com');
    expect((await upload(HTML, 'image/png', u.token)).status).toBe(400);
    expect((await upload(JPEG, 'image/png', u.token)).status).toBe(400);
    expect((await upload(PNG, 'text/html', u.token)).status).toBe(400);
    expect(db.tables.users[0].image_url).toBeNull();
  });

  it('rejects a file over 2 MB', async () => {
    const u = await makeUser(db, 'a@x.com');
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await upload(big, 'image/png', u.token)).status).toBe(400);
  });

  it('is limited to 10 uploads a minute per user', async () => {
    const u = await makeUser(db, 'a@x.com');
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await upload(PNG, 'image/png', u.token)).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });
});

describe('rateLimit()', () => {
  const request = (ip: string) => new Request('http://app.test/x', { headers: { 'x-forwarded-for': ip } });

  it('answers 429 with Retry-After once the window is used up, then recovers when it resets', async () => {
    const opts = { name: 't', limit: 2, windowSeconds: 60 };
    expect(await rateLimit(request('1.1.1.1'), opts)).toBeNull();
    expect(await rateLimit(request('1.1.1.1'), opts)).toBeNull();
    const limited = await rateLimit(request('1.1.1.1'), opts);
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get('retry-after'))).toBeGreaterThan(0);

    for (const row of db.tables.rate_limits) row.window_start -= 61_000; // the window passes
    expect(await rateLimit(request('1.1.1.1'), opts)).toBeNull();
  });

  it('counts each address and each action separately', async () => {
    const opts = { name: 't', limit: 1, windowSeconds: 60 };
    expect(await rateLimit(request('1.1.1.1'), opts)).toBeNull();
    expect(await rateLimit(request('2.2.2.2'), opts)).toBeNull();
    expect(await rateLimit(request('1.1.1.1'), { ...opts, name: 'other' })).toBeNull();
    expect((await rateLimit(request('1.1.1.1'), opts))?.status).toBe(429);
  });

  it('applies a per-identifier limit across addresses and stores only a hash of it', async () => {
    const opts = { name: 'login', limit: 100, windowSeconds: 60, identifier: { value: 'Victim@X.com', limit: 2, windowSeconds: 900 } };
    expect(await rateLimit(request('1.1.1.1'), opts)).toBeNull();
    expect(await rateLimit(request('2.2.2.2'), opts)).toBeNull();
    expect((await rateLimit(request('3.3.3.3'), opts))?.status).toBe(429);
    expect(db.tables.rate_limits.some((r) => /victim/i.test(r.key))).toBe(false);
  });

  it('is case-insensitive for identifiers and supports several windows at once', async () => {
    const id = (v: string) => ({ value: v, limit: 100, windowSeconds: 60 });
    const opts = (v: string) => ({ name: 'ai', limit: 100, windowSeconds: 60, identifier: [id(v), { value: v, limit: 1, windowSeconds: 86400 }] });
    expect(await rateLimit(request('1.1.1.1'), opts('User@X.com'))).toBeNull();
    expect((await rateLimit(request('1.1.1.1'), opts('user@x.com')))?.status).toBe(429); // the daily one
  });

  it('fails open when the limiter backend is unavailable', async () => {
    db.failAll = true;
    expect(await rateLimit(request('1.1.1.1'), { name: 't', limit: 1, windowSeconds: 60 })).toBeNull();
    db.failAll = false;
    delete db.rpc.rate_limit_hit; // migration not applied
    expect(await rateLimit(request('1.1.1.1'), { name: 't', limit: 1, windowSeconds: 60 })).toBeNull();
  });

  it('takes the client address from x-forwarded-for (first hop) or x-real-ip', () => {
    expect(getClientIp(new Request('http://x', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } }))).toBe('9.9.9.9');
    expect(getClientIp(new Request('http://x', { headers: { 'x-real-ip': '8.8.8.8' } }))).toBe('8.8.8.8');
    expect(getClientIp(new Request('http://x'))).toBe('unknown');
  });
});
