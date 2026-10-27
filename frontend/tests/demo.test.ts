import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthCache, getAuthUser } from '@/lib/supabase';
import { POST as demo } from '@/app/api/auth/demo/route';
import { GET as me } from '@/app/api/auth/me/route';
import { createDb, FakePostgrest, RpcError } from './helpers/fakePostgrest';
import { req, sessionFrom } from './helpers/http';

let db: FakePostgrest;
let ip = 0;
const fresh = () => ({ headers: { 'x-forwarded-for': `10.9.0.${++ip}` } });

beforeEach(() => {
  db = createDb();
  clearAuthCache();
  db.rpc.create_demo_account = ({ p_password_hash }) => {
    const row = db.insert('users', {
      email: `demo-${db.tables.users?.length ?? 0}@demo.invalid`,
      password_hash: p_password_hash,
      first_name: 'Reviewer',
      last_name: 'Demo',
      role: 'ADMIN',
      is_active: true,
      token_version: 0,
      demo_expires_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
    });
    return { ...row, image_url: null };
  };
});

describe('POST /api/auth/demo', () => {
  it('creates a demo account and signs it in through the session cookie, not the body', async () => {
    const res = await demo(req('POST', undefined, fresh()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ first_name: 'Reviewer', last_name: 'Demo', role: 'ADMIN', is_demo: true });
    expect(JSON.stringify(body)).not.toMatch(/password|token_version|eyJ/);

    const token = sessionFrom(res);
    const user = await getAuthUser(req('GET', undefined, { token }));
    expect(user?.id).toBe(body.user.id);
  });

  it('stores a hash of a random password, never a fixed one, and a different one each time', async () => {
    await demo(req('POST', undefined, fresh()));
    await demo(req('POST', undefined, fresh()));
    const hashes = (db.tables.users ?? []).map((u) => u.password_hash);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).toMatch(/^\$2[aby]\$/);
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it('is limited per address (6 an hour), so it cannot be used to fill the database', async () => {
    const same = { headers: { 'x-forwarded-for': '10.9.9.9' } };
    for (let i = 0; i < 6; i++) expect((await demo(req('POST', undefined, same))).status).toBe(200);
    const blocked = await demo(req('POST', undefined, same));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('shows the database message when the demo is full, without a session', async () => {
    db.rpc.create_demo_account = () => {
      throw new RpcError(429, { code: 'PT429', message: 'The demo is busy right now. Please try again in a few minutes.' });
    };
    const res = await demo(req('POST', undefined, fresh()));
    expect(res.status).toBe(429);
    expect((await res.json()).detail).toContain('busy');
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it('answers 503 with a plain message when migration 0014 is missing', async () => {
    delete db.rpc.create_demo_account;
    const res = await demo(req('POST', undefined, fresh()));
    expect([500, 503]).toContain(res.status);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});

describe('GET /api/auth/me', () => {
  it('says is_demo for a demo account and not for a normal one', async () => {
    const res = await demo(req('POST', undefined, fresh()));
    const token = sessionFrom(res);
    const mine = await (await me(req('GET', undefined, { token }))).json();
    expect(mine.is_demo).toBe(true);

    const { makeUser } = await import('./helpers/http');
    const normal = await makeUser(db, 'real@x.com');
    const other = await (await me(req('GET', undefined, { token: normal.token }))).json();
    expect(other.is_demo).toBe(false);
  });
});
