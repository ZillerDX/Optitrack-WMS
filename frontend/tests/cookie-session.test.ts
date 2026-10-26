import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthCache, getAuthUser } from '@/lib/supabase';
import { SESSION_COOKIE, isSameOriginRequest, readSessionCookie } from '@/lib/session';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { POST as google } from '@/app/api/auth/google/route';
import { GET as listProducts, POST as createProduct } from '@/app/api/products/route';
import { GET as listInventory } from '@/app/api/inventory/route';
import { GET as listInventoryLocations } from '@/app/api/inventory/locations/route';
import { GET as listTransactions } from '@/app/api/transactions/route';
import { GET as listLocations } from '@/app/api/locations/route';
import { GET as listCategories } from '@/app/api/categories/route';
import { GET as metrics } from '@/app/api/dashboard/metrics/route';
import { createDb, FakePostgrest } from './helpers/fakePostgrest';
import { PASSWORD, makeUser, req, sessionFrom } from './helpers/http';

let db: FakePostgrest;
beforeEach(() => {
  db = createDb();
  clearAuthCache();
});

const withCookie = (token: string, extra: Record<string, string> = {}) => ({
  headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}`, ...extra },
});

describe('session cookie', () => {
  it('login sets an httpOnly, SameSite=Lax cookie and keeps the token out of the body', async () => {
    await makeUser(db, 'a@x.com');
    const res = await login(req('POST', { email: 'a@x.com', password: PASSWORD }, { headers: { 'x-forwarded-for': '1.1.1.1' } }));
    expect(res.status).toBe(200);

    const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=86400/i);

    const body = JSON.stringify(await res.json());
    expect(body).not.toContain(sessionFrom(res));
    expect(body).not.toMatch(/access_token/);
  });

  it('Google sign-in also uses the cookie only', async () => {
    db.externalHandler = () => ({
      status: 200,
      body: { aud: process.env.GOOGLE_CLIENT_ID, iss: 'https://accounts.google.com', email: 'g@x.com', email_verified: 'true', given_name: 'G', family_name: 'U' },
    });
    const res = await google(req('POST', { credential: 't' }, { headers: { 'x-forwarded-for': '2.2.2.2' } }));
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`) && /HttpOnly/i.test(c))).toBe(true);
    expect(JSON.stringify(await res.json())).not.toMatch(/access_token/);
  });

  it('authenticates a request that carries the cookie', async () => {
    const u = await makeUser(db, 'a@x.com');
    expect((await listProducts(req('GET', undefined, withCookie(u.token)))).status).toBe(200);
  });

  it('logout expires the cookie and revokes the session', async () => {
    const u = await makeUser(db, 'a@x.com');
    const res = await logout(req('POST', undefined, withCookie(u.token, { origin: 'http://app.test', host: 'app.test' })));
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))).toMatch(/Max-Age=0/i);
    clearAuthCache();
    expect(await getAuthUser(req('GET', undefined, withCookie(u.token)))).toBeNull();
  });

  it('parses the cookie header defensively', () => {
    const r = (cookie: string) => new Request('http://x', { headers: { cookie } });
    expect(readSessionCookie(r(`a=1; ${SESSION_COOKIE}=tok%20en; b=2`))).toBe('tok en');
    expect(readSessionCookie(r('a=1; b=2'))).toBeNull();
    expect(readSessionCookie(r(`${SESSION_COOKIE}=`))).toBeNull();
    expect(readSessionCookie(new Request('http://x'))).toBeNull();
  });
});

describe('CSRF: cookie-authenticated requests that change data must be same-origin', () => {
  const product = { sku: 'S1', name: 'N', cost_price: 1, sell_price: 2 };
  const post = (token: string, headers: Record<string, string>) => createProduct(req('POST', product, withCookie(token, headers)));

  it('accepts a same-origin request (Origin matches Host)', async () => {
    const u = await makeUser(db, 'a@x.com');
    expect((await post(u.token, { origin: 'https://app.test', host: 'app.test' })).status).toBe(200);
  });

  it('accepts the proxy-forwarded host, and Sec-Fetch-Site when there is no Origin', async () => {
    const u = await makeUser(db, 'a@x.com');
    expect((await post(u.token, { origin: 'https://app.test', host: 'internal:3000', 'x-forwarded-host': 'app.test' })).status).toBe(200);
    db.tables.products = [];
    expect((await post(u.token, { host: 'app.test', 'sec-fetch-site': 'same-origin' })).status).toBe(200);
  });

  it.each([
    ['a cross-site Origin', { origin: 'https://evil.example.com', host: 'app.test' }],
    ['a look-alike Origin', { origin: 'https://app.test.evil.example.com', host: 'app.test' }],
    ['no Origin and no Sec-Fetch-Site', { host: 'app.test' }],
    ['Sec-Fetch-Site: cross-site', { host: 'app.test', 'sec-fetch-site': 'cross-site' }],
    ['a malformed Origin', { origin: 'null', host: 'app.test' }],
  ])('rejects %s with 401 and changes nothing', async (_n, headers) => {
    const u = await makeUser(db, 'a@x.com');
    expect((await post(u.token, headers)).status).toBe(401);
    expect(db.tables.products).toHaveLength(0);
  });

  it('does not apply to safe methods, nor to an explicit Authorization header (not sent automatically)', async () => {
    const u = await makeUser(db, 'a@x.com');
    expect((await listProducts(req('GET', undefined, withCookie(u.token, { origin: 'https://evil.example.com' })))).status).toBe(200);
    expect((await createProduct(req('POST', product, { token: u.token, headers: { origin: 'https://evil.example.com' } }))).status).toBe(200);
  });

  it('isSameOriginRequest treats GET/HEAD/OPTIONS as safe', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isSameOriginRequest(new Request('http://app.test', { method, headers: { origin: 'https://evil.example.com' } }))).toBe(true);
    }
  });
});

describe('unauthenticated reads are 401, not an empty warehouse', () => {
  it.each([
    ['products', listProducts],
    ['inventory', listInventory],
    ['inventory/locations', listInventoryLocations],
    ['transactions', listTransactions],
    ['locations', listLocations],
    ['categories', listCategories],
    ['dashboard/metrics', metrics],
  ])('%s', async (_name, handler: any) => {
    expect((await handler(req('GET'))).status).toBe(401);
  });

  it('a revoked or expired session is 401 (so the UI signs the user out)', async () => {
    const u = await makeUser(db, 'a@x.com');
    db.tables.users[0].token_version = 5;
    expect((await listProducts(req('GET', undefined, withCookie(u.token)))).status).toBe(401);
  });

  it.each([
    ['products', listProducts],
    ['inventory', listInventory],
    ['transactions', listTransactions],
    ['metrics', metrics],
  ])('%s: a data-store failure is a 500, not an empty list', async (_name, handler: any) => {
    const u = await makeUser(db, 'a@x.com');
    await handler(req('GET', undefined, { token: u.token })); // warm the auth cache while the store is up
    db.failAll = true;
    const res = await handler(req('GET', undefined, { token: u.token }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/down|503/);
  });
});
