import { beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { clearAuthCache, createSessionToken, getAuthUser } from '@/lib/supabase';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as getMe, PUT as putMe } from '@/app/api/auth/me/route';
import { createDb, FakePostgrest } from './helpers/fakePostgrest';
import { PASSWORD, makeUser, req } from './helpers/http';

let db: FakePostgrest;

beforeEach(() => {
  db = createDb();
  clearAuthCache();
});

describe('session validation (B1)', () => {
  it('rejects a valid token once the account is deactivated', async () => {
    const u = await makeUser(db, 'a@x.com');
    expect(await getAuthUser(req('GET', undefined, { token: u.token }))).not.toBeNull();

    db.tables.users[0].is_active = false;
    clearAuthCache(); // stands in for the 5 s cache expiring
    expect(await getAuthUser(req('GET', undefined, { token: u.token }))).toBeNull();
    expect((await getMe(req('GET', undefined, { token: u.token }))).status).toBe(401);
  });

  it('rejects a valid token for a user that no longer exists', async () => {
    const u = await makeUser(db, 'a@x.com');
    db.tables.users = [];
    expect(await getAuthUser(req('GET', undefined, { token: u.token }))).toBeNull();
  });

  it('fails closed when the database is unavailable', async () => {
    const u = await makeUser(db, 'a@x.com');
    db.failAll = true;
    expect(await getAuthUser(req('GET', undefined, { token: u.token }))).toBeNull();
  });

  it('checks the database only once per cache window', async () => {
    const u = await makeUser(db, 'a@x.com');
    await getAuthUser(req('GET', undefined, { token: u.token }));
    await getAuthUser(req('GET', undefined, { token: u.token }));
    expect(db.calls.filter((c) => c.table === 'users').length).toBe(1);
  });

  it('still accepts sessions issued before token_version existed (no tv claim)', async () => {
    const row = db.insert('users', { email: 'old@x.com', password_hash: 'x', first_name: 'O', last_name: 'L' });
    const legacy = await createSessionToken({ sub: String(row.id), email: 'old@x.com', role: 'ADMIN' });
    expect(await getAuthUser(req('GET', undefined, { token: legacy }))).not.toBeNull();
  });

  it('rejects a token signed with another key or another algorithm', async () => {
    const u = await makeUser(db, 'a@x.com');
    const forged = await new SignJWT({ sub: String(u.id), email: 'a@x.com', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('some-other-secret-key-0123456789-abcdef'));
    expect(await getAuthUser(req('GET', undefined, { token: forged }))).toBeNull();
  });
});

describe('session revocation (B2)', () => {
  it('logout revokes the token that was used and any other session of the user', async () => {
    const u = await makeUser(db, 'a@x.com');
    const otherDevice = await createSessionToken({ sub: String(u.id), email: u.email, role: 'ADMIN', tv: 0 });

    expect((await logout(req('POST', undefined, { token: u.token }))).status).toBe(200);
    expect(db.tables.users[0].token_version).toBe(1);

    clearAuthCache();
    expect(await getAuthUser(req('GET', undefined, { token: u.token }))).toBeNull();
    expect(await getAuthUser(req('GET', undefined, { token: otherDevice }))).toBeNull();
  });

  it('a fresh login after logout gets a token that works', async () => {
    const u = await makeUser(db, 'a@x.com');
    await logout(req('POST', undefined, { token: u.token }));
    clearAuthCache();

    const res = await login(req('POST', { email: 'a@x.com', password: PASSWORD }));
    expect(res.status).toBe(200);
    const { access_token } = await res.json();
    expect(await getAuthUser(req('GET', undefined, { token: access_token }))).not.toBeNull();
  });

  it('logout without a session is harmless', async () => {
    const res = await logout(req('POST'));
    expect(res.status).toBe(200);
  });
});

describe('deploying before session_revocation.sql has run', () => {
  it('keeps everyone logged in when users has no token_version column', async () => {
    const u = await makeUser(db, 'a@x.com');
    delete db.tables.users[0].token_version; // the column does not exist yet
    expect(await getAuthUser(req('GET', undefined, { token: u.token }))).not.toBeNull();
  });

  it('logout does not fail or invent the column', async () => {
    const u = await makeUser(db, 'a@x.com');
    delete db.tables.users[0].token_version;
    expect((await logout(req('POST', undefined, { token: u.token }))).status).toBe(200);
    expect('token_version' in db.tables.users[0]).toBe(false);
  });
});

describe('profile update', () => {
  it('uses the revocation check too (PUT /me with a revoked token is 401)', async () => {
    const u = await makeUser(db, 'a@x.com');
    db.tables.users[0].token_version = 3;
    const res = await putMe(req('PUT', { first_name: 'Nope' }, { token: u.token }));
    expect(res.status).toBe(401);
    expect(db.tables.users[0].first_name).toBe('Test');
  });

  it.each([
    ['https://lh3.googleusercontent.com/a/photo=s96-c', true],
    ['data:image/png;base64,iVBORw0KGgo=', true],
    ['', true],
    ['javascript:alert(1)', false],
    ['http://lh3.googleusercontent.com/a.png', false],
    ['https://evil.example.com/a.png', false],
    ['https://googleusercontent.com.evil.example.com/a.png', false],
    ['https://user:pw@lh3.googleusercontent.com/a.png', false],
    ['data:text/html;base64,PHNjcmlwdD4=', false],
    ['/uploads/profiles/x.png', false],
  ])('avatar %s -> %s', async (url, allowed) => {
    const u = await makeUser(db, 'a@x.com');
    const res = await putMe(req('PUT', { image_url: url }, { token: u.token }));
    expect(res.status).toBe(allowed ? 200 : 422);
  });

  it.each(['email', 'is_active', 'role', 'token_version', 'password_hash'])('%s is not editable', async (field) => {
    const u = await makeUser(db, 'a@x.com');
    const before = { ...db.tables.users[0] };
    const res = await putMe(req('PUT', { [field]: field === 'is_active' ? false : 'x' }, { token: u.token }));
    expect(res.status).toBe(422);
    expect(db.tables.users[0]).toEqual(before);
  });
});
