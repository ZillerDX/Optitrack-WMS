import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/*
 * The parts of the cookie-session design that only a real browser can prove: what the browser
 * stores and lets scripts read, what the login form does, the CSRF check on a genuine cross-site
 * Origin, and that the pages load real data through the cookie.
 */

const PASSWORD = 'correct-horse-1';
const COOKIE = '__Host-session'; // `next start` runs with NODE_ENV=production

let counter = 0;
const uniqueEmail = () => `e2e-${Date.now()}-${counter++}@example.com`;

/**
 * Creates an account through the API (no UI), returns its email. Sign-up is limited to 5 per minute
 * per client address (that limit is real and stays on), so each account claims a different address
 * the way distinct visitors behind the platform proxy would.
 */
async function createAccount(request: APIRequestContext): Promise<string> {
  const email = uniqueEmail();
  const res = await request.post('/api/auth/register', {
    headers: { 'X-Forwarded-For': `10.20.${Math.floor(counter / 250)}.${(counter % 250) + 1}` },
    data: { email, password: PASSWORD, first_name: 'E2E', last_name: 'User' },
  });
  expect(res.status(), await res.text()).toBe(200);
  return email;
}

// Login is limited to 5 per minute per client address (real, stays on): every visitor gets its own.
let visitor = 0;
const nextAddress = () => `10.30.${Math.floor(visitor / 250)}.${(visitor++ % 250) + 1}`;

async function loginThroughForm(page: Page, email: string, password = PASSWORD) {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': nextAddress() });
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('form:has(#password) button[type="submit"]').click();
}

test('the login form signs in and the browser gets an HttpOnly, SameSite=Lax session cookie', async ({ page, context, request }) => {
  const email = await createAccount(request);
  await loginThroughForm(page, email);
  await page.waitForURL('**/dashboard');

  const cookie = (await context.cookies()).find((c) => c.name === COOKIE);
  expect(cookie, 'the session cookie').toBeTruthy();
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
  expect(cookie!.domain).toBe('localhost'); // __Host- cookies carry no Domain attribute

  // page scripts can neither read the cookie nor find the token in storage
  const visible = await page.evaluate(() => ({
    cookies: document.cookie,
    storage: JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
  }));
  expect(visible.cookies).not.toContain('session');
  expect(visible.storage).not.toContain(cookie!.value);
  expect(visible.storage).not.toMatch(/eyJ[\w-]+\.[\w-]+\./); // no JWT anywhere
});

test('a wrong password shows an error, sets no cookie and stays on the login page', async ({ page, context, request }) => {
  const email = await createAccount(request);
  await loginThroughForm(page, email, 'not-the-password');
  await expect(page.getByText(/invalid|incorrect|failed/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect((await context.cookies()).find((c) => c.name === COOKIE)).toBeUndefined();
});

test('an unauthenticated visitor is sent to the login page', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForURL('**/login');
});

test('signing out ends the session: the old cookie is refused by the API', async ({ page, context, request }) => {
  const email = await createAccount(request);
  await loginThroughForm(page, email);
  await page.waitForURL('**/dashboard');

  const before = (await context.cookies()).find((c) => c.name === COOKIE)!;
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);

  await page.getByRole('button', { name: /log ?out|sign ?out/i }).click();
  await page.waitForURL('**/login');

  // replay the cookie the browser held before signing out: the server revoked it, not just the browser
  const replay = await request.get('/api/auth/me', { headers: { Cookie: `${COOKIE}=${before.value}` } });
  expect(replay.status()).toBe(401);
});

test('a cross-site request cannot use the cookie (CSRF), a same-origin one can', async ({ page, request, baseURL }) => {
  const email = await createAccount(request);
  await loginThroughForm(page, email);
  await page.waitForURL('**/dashboard');
  const cookie = (await page.context().cookies()).find((c) => c.name === COOKIE)!;
  const withCookie = { Cookie: `${COOKIE}=${cookie.value}` };
  const location = { name: `Zone-${counter++}`, capacity: 10 };

  const evil = await request.post('/api/locations', { headers: { ...withCookie, Origin: 'https://evil.example' }, data: location });
  expect(evil.status()).toBe(401);
  const ok = await request.post('/api/locations', { headers: { ...withCookie, Origin: baseURL! }, data: location });
  expect(ok.status(), await ok.text()).toBe(200);
});

test('pages load the account\'s real data through the cookie, and only its own', async ({ page, request, baseURL, browser }) => {
  test.setTimeout(120_000);
  // account A with a location and a product that has stock
  const emailA = await createAccount(request);
  await loginThroughForm(page, emailA);
  await page.waitForURL('**/dashboard');
  const mine = page.request; // shares the browser's cookie
  const headers = { Origin: baseURL! };
  const product = `Widget ${counter++}`;
  expect((await mine.post('/api/locations', { headers, data: { name: 'Shelf-A', capacity: 100 } })).status()).toBe(200);
  const p = await mine.post('/api/products', { headers, data: { sku: `W-${counter}`, name: product, cost_price: 5, sell_price: 9, min_stock_level: 2 } });
  expect(p.status(), await p.text()).toBe(200);
  const productId = (await p.json()).id;
  const tx = await mine.post('/api/transactions', { headers, data: { type: 'INBOUND', quantity: 7, product_id: productId, location: 'Shelf-A' } });
  expect(tx.status(), await tx.text()).toBe(201);

  for (const path of ['/products', '/inventory', '/transactions']) {
    await page.goto(path);
    await expect(page.getByText(product).first(), path).toBeVisible();
  }

  // account B, in a separate browser context, sees none of it
  const other = await browser.newContext({ baseURL: baseURL! });
  const pageB = await other.newPage();
  const emailB = await createAccount(other.request);
  await loginThroughForm(pageB, emailB);
  await pageB.waitForURL('**/dashboard');
  const dataCalls: Record<string, string> = { '/products': '/api/products', '/inventory': '/api/inventory?', '/transactions': '/api/transactions' };
  for (const [path, api] of Object.entries(dataCalls)) {
    // wait for the page's own data request to be answered (not for a quiet network: the pages poll)
    const answered = pageB.waitForResponse((r) => r.url().includes(api) && r.request().method() === 'GET');
    await pageB.goto(path);
    expect((await answered).status(), path).toBe(200);
    await expect(pageB.getByText(product), path).toHaveCount(0);
  }
  await other.close();
});
