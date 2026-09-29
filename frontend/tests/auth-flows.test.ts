import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';

const sendMail = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

import {
  clearAuthCache,
  createPasswordResetToken,
  createSessionToken,
  getAuthUser,
  passwordFingerprint,
} from '@/lib/supabase';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as google } from '@/app/api/auth/google/route';
import { POST as forgot } from '@/app/api/auth/forgot-password/route';
import { POST as reset } from '@/app/api/auth/reset-password/route';
import { createDb, FakePostgrest } from './helpers/fakePostgrest';
import { PASSWORD, hash, makeUser, req } from './helpers/http';

let db: FakePostgrest;
let ipCounter = 0;
/** Each request from a different address, so per-IP limits do not interfere with what is being tested. */
const fresh = () => ({ headers: { 'x-forwarded-for': `10.1.0.${++ipCounter}` } });

beforeEach(() => {
  db = createDb();
  clearAuthCache();
  sendMail.mockClear();
  delete process.env.SIGNUP_ALLOWED_DOMAINS;
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  process.env.APP_URL = 'https://app.test';
});

describe('POST /api/auth/register', () => {
  const body = { email: 'New@X.com', password: 'longenough1', first_name: 'N', last_name: 'U' };

  it('creates an ADMIN account, ignoring a client-supplied role, and lowercases the email', async () => {
    const res = await register(req('POST', { ...body, role: 'STAFF' }, fresh()));
    expect(res.status).toBe(200);
    const created = await res.json();
    expect(created).toMatchObject({ email: 'new@x.com', role: 'ADMIN' });
    expect(created.password_hash).toBeUndefined();
    expect(bcrypt.compareSync('longenough1', db.tables.users[0].password_hash)).toBe(true);
  });

  it('rejects a duplicate email, a short password and missing fields', async () => {
    await register(req('POST', body, fresh()));
    expect((await register(req('POST', body, fresh()))).status).toBe(400);
    expect((await register(req('POST', { ...body, email: 'b@x.com', password: '123' }, fresh()))).status).toBe(400);
    expect((await register(req('POST', { email: 'c@x.com' }, fresh()))).status).toBe(400);
    expect(db.tables.users).toHaveLength(1);
  });

  it('is limited to 5 sign-ups a minute per address', async () => {
    const same = { headers: { 'x-forwarded-for': '9.9.9.9' } };
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await register(req('POST', { ...body, email: `u${i}@x.com` }, same))).status);
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  it('honours SIGNUP_ALLOWED_DOMAINS', async () => {
    process.env.SIGNUP_ALLOWED_DOMAINS = 'acme.com, @acme.co.th';
    expect((await register(req('POST', { ...body, email: 'a@acme.com' }, fresh()))).status).toBe(200);
    expect((await register(req('POST', { ...body, email: 'a@acme.co.th' }, fresh()))).status).toBe(200);
    for (const email of ['a@evil.com', 'a@sub.acme.com', 'a@acme.com.evil.com']) {
      expect((await register(req('POST', { ...body, email }, fresh()))).status).toBe(403);
    }
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for a session that works, and never the password hash', async () => {
    await makeUser(db, 'a@x.com');
    const res = await login(req('POST', { email: 'A@x.com', password: PASSWORD }, fresh()));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(JSON.stringify(data)).not.toContain('password_hash');
    expect(await getAuthUser(req('GET', undefined, { token: data.access_token }))).toMatchObject({ email: 'a@x.com' });
  });

  it('answers wrong password and unknown email identically (401)', async () => {
    await makeUser(db, 'a@x.com');
    const wrong = await login(req('POST', { email: 'a@x.com', password: 'nope-nope' }, fresh()));
    const unknown = await login(req('POST', { email: 'ghost@x.com', password: 'nope-nope' }, fresh()));
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it('refuses an inactive account', async () => {
    await makeUser(db, 'a@x.com', { is_active: false });
    expect((await login(req('POST', { email: 'a@x.com', password: PASSWORD }, fresh()))).status).toBe(403);
  });

  it('limits guessing per address (5/min) and per account across addresses (10/15 min)', async () => {
    await makeUser(db, 'a@x.com');
    const sameIp = { headers: { 'x-forwarded-for': '7.7.7.7' } };
    const perIp: number[] = [];
    for (let i = 0; i < 6; i++) perIp.push((await login(req('POST', { email: 'q@x.com', password: 'x' }, sameIp))).status);
    expect(perIp).toEqual([401, 401, 401, 401, 401, 429]);

    const perAccount: number[] = [];
    for (let i = 0; i < 12; i++) perAccount.push((await login(req('POST', { email: 'a@x.com', password: 'bad-guess' }, fresh()))).status);
    expect(perAccount.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(perAccount.slice(10)).toEqual([429, 429]);
  });
});

describe('POST /api/auth/google', () => {
  const claims = (over: Record<string, unknown> = {}) => ({
    aud: 'test-client-id.apps.googleusercontent.com',
    iss: 'https://accounts.google.com',
    email: 'g@x.com',
    email_verified: 'true',
    given_name: 'G',
    family_name: 'User',
    ...over,
  });
  const signIn = (headers = fresh()) => google(req('POST', { credential: 'id-token' }, headers));
  const google_returns = (status: number, body: unknown) => (db.externalHandler = () => ({ status, body }));

  it('creates an ADMIN account and returns a working session', async () => {
    google_returns(200, claims());
    const res = await signIn();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(db.tables.users[0]).toMatchObject({ email: 'g@x.com', role: 'ADMIN' });
    expect(await getAuthUser(req('GET', undefined, { token: data.access_token }))).not.toBeNull();
  });

  it('logs an existing user in without creating another row', async () => {
    await makeUser(db, 'g@x.com');
    google_returns(200, claims());
    expect((await signIn()).status).toBe(200);
    expect(db.tables.users).toHaveLength(1);
  });

  it('refuses when no client id is configured (would accept any app\'s token)', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    google_returns(200, claims());
    expect((await signIn()).status).toBe(503);
    expect(db.external).toHaveLength(0);
  });

  it.each([
    ['a token minted for another app', { aud: 'someone-elses-app.apps.googleusercontent.com' }, 401],
    ['a token from another issuer', { iss: 'https://evil.example.com' }, 401],
    ['an unverified email', { email_verified: 'false' }, 400],
    ['a missing email', { email: undefined }, 400],
  ])('rejects %s', async (_name, over, status) => {
    google_returns(200, claims(over));
    expect((await signIn()).status).toBe(status);
    expect(db.tables.users).toHaveLength(0);
  });

  it('rejects a token Google itself refuses', async () => {
    google_returns(400, { error: 'invalid_token' });
    expect((await signIn()).status).toBe(401);
  });

  it('URL-encodes the credential it sends to Google', async () => {
    google_returns(200, claims());
    await google(req('POST', { credential: 'a&b=c d' }, fresh()));
    expect(db.external[0].url).toContain('id_token=a%26b%3Dc%20d');
  });

  it('applies the sign-up allowlist to new accounts only', async () => {
    process.env.SIGNUP_ALLOWED_DOMAINS = 'acme.com';
    google_returns(200, claims({ email: 'new@other.com' }));
    expect((await signIn()).status).toBe(403);
    expect(db.tables.users).toHaveLength(0);

    await makeUser(db, 'old@other.com');
    google_returns(200, claims({ email: 'old@other.com' }));
    expect((await signIn()).status).toBe(200);
  });
});

describe('password reset', () => {
  const link = () => {
    const text: string = (sendMail.mock.calls[0] as any)[0].text;
    return decodeURIComponent(text.split('token=')[1].trim());
  };
  const resetWith = (token: string, new_password = 'brand-new-pass') => reset(req('POST', { token, new_password }, fresh()));

  it('emails a link built from APP_URL, then sets the new password exactly once', async () => {
    await makeUser(db, 'a@x.com');
    await forgot(req('POST', { email: 'a@x.com' }, fresh()));
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect((sendMail.mock.calls[0] as any)[0].text).toContain('https://app.test/reset-password?token=');
    const token = link();

    expect((await resetWith(token)).status).toBe(200);
    expect(bcrypt.compareSync('brand-new-pass', db.tables.users[0].password_hash)).toBe(true);
    expect((await resetWith(token, 'another-pass-2')).status).toBe(400); // single use
    expect(bcrypt.compareSync('brand-new-pass', db.tables.users[0].password_hash)).toBe(true);
  });

  it('ends every existing session when the password is reset', async () => {
    const u = await makeUser(db, 'a@x.com');
    await forgot(req('POST', { email: 'a@x.com' }, fresh()));
    await resetWith(link());
    clearAuthCache();
    expect(db.tables.users[0].token_version).toBe(1);
    expect(await getAuthUser(req('GET', undefined, { token: u.token }))).toBeNull();
  });

  it('gives the same answer for unknown, inactive and known accounts, and only mails real ones', async () => {
    await makeUser(db, 'a@x.com');
    await makeUser(db, 'off@x.com', { is_active: false });
    const answers = [];
    for (const email of ['a@x.com', 'ghost@x.com', 'off@x.com']) {
      const res = await forgot(req('POST', { email }, fresh()));
      answers.push([res.status, JSON.stringify(await res.json())]);
    }
    expect(new Set(answers.map((a) => a.join())).size).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('does not send anything (and does not use request headers) when APP_URL is not configured', async () => {
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    await makeUser(db, 'a@x.com');
    const res = await forgot(req('POST', { email: 'a@x.com' }, { headers: { ...fresh().headers, host: 'evil.example.com', origin: 'https://evil.example.com' } }));
    expect(res.status).toBe(200);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('is limited to 3 requests a minute per address and 3 an hour per email', async () => {
    await makeUser(db, 'a@x.com');
    const sameIp = { headers: { 'x-forwarded-for': '5.5.5.5' } };
    const perIp: number[] = [];
    for (let i = 0; i < 4; i++) perIp.push((await forgot(req('POST', { email: `u${i}@x.com` }, sameIp))).status);
    expect(perIp).toEqual([200, 200, 200, 429]);

    const perEmail: number[] = [];
    for (let i = 0; i < 4; i++) perEmail.push((await forgot(req('POST', { email: 'victim@x.com' }, fresh()))).status);
    expect(perEmail).toEqual([200, 200, 200, 429]);
  });

  it('rejects tokens that are not reset links', async () => {
    const u = await makeUser(db, 'a@x.com');
    expect((await resetWith(u.token)).status).toBe(400); // a session token
    const forged = await new SignJWT({ sub: String(u.id), scope: 'password_reset', pwd: passwordFingerprint(db.tables.users[0].password_hash) })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('another-secret-key-0123456789-abcdefgh'));
    expect((await resetWith(forged)).status).toBe(400);
    const expired = await new SignJWT({ sub: String(u.id), scope: 'password_reset', pwd: passwordFingerprint(db.tables.users[0].password_hash) })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.SECRET_KEY!));
    expect((await resetWith(expired)).status).toBe(400);
    expect(bcrypt.compareSync(PASSWORD, db.tables.users[0].password_hash)).toBe(true);
  });

  it('a reset token cannot be used as a session', async () => {
    const u = await makeUser(db, 'a@x.com');
    const token = await createPasswordResetToken(u.id, db.tables.users[0].password_hash);
    expect(await getAuthUser(req('GET', undefined, { token }))).toBeNull();
  });

  it('validates the new password', async () => {
    const u = await makeUser(db, 'a@x.com');
    const token = await createPasswordResetToken(u.id, db.tables.users[0].password_hash);
    expect((await resetWith(token, '123')).status).toBe(400);
    expect((await resetWith(token, 'x'.repeat(73))).status).toBe(400); // bcrypt only reads 72 bytes
  });

  it('a session token still works for a legitimate user after an unrelated reset request', async () => {
    const u = await makeUser(db, 'a@x.com');
    await forgot(req('POST', { email: 'a@x.com' }, fresh()));
    expect(await getAuthUser(req('GET', undefined, { token: u.token }))).not.toBeNull();
  });
});

// keep unused import checks honest
void createSessionToken;
void hash;
