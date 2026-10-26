import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/* The Dashboard: an empty state for a new account, figures that match the seeded stock, charts in both themes. */

const PASSWORD = 'correct-horse-1';
let n = 0;
// Sign-up and login are rate limited per client address (real, stays on): own range for this file.
const address = (k: number) => `10.92.${Math.floor(k / 250)}.${(k % 250) + 1}`;

async function signIn(page: Page, request: APIRequestContext) {
  const k = n++;
  const email = `e2e-dash-${Date.now()}-${k}@example.com`;
  const res = await request.post('/api/auth/register', {
    headers: { 'X-Forwarded-For': address(k) },
    data: { email, password: PASSWORD, first_name: 'Dash', last_name: 'Tester' },
  });
  expect(res.status(), await res.text()).toBe(200);
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address(k + 500) });
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('form:has(#password) button[type="submit"]').click();
  await page.waitForURL('**/dashboard');
}

test('a new account sees an empty state, not zeros and empty charts', async ({ page, request }) => {
  await signIn(page, request);
  await expect(page.getByText('Nothing to show yet')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add products' })).toBeVisible();
});

test('figures match the stock, the reorder list uses product totals, and the charts draw in both themes', async ({ page, request, baseURL }) => {
  await signIn(page, request);
  const headers = { Origin: baseURL! };
  expect((await page.request.post('/api/locations', { headers, data: { name: 'Shelf-A', capacity: 100 } })).status()).toBe(200);
  expect((await page.request.post('/api/locations', { headers, data: { name: 'Shelf-B', capacity: 100 } })).status()).toBe(200);
  const make = async (sku: string, name: string, cost: number, sell: number, min: number, category: string) => {
    const r = await page.request.post('/api/products', { headers, data: { sku, name, cost_price: cost, sell_price: sell, min_stock_level: min, category } });
    expect(r.status(), await r.text()).toBe(200);
    return (await r.json()).id as number;
  };
  const move = async (type: string, product_id: number, location: string, quantity: number) => {
    const r = await page.request.post('/api/transactions', { headers, data: { type, product_id, location, quantity } });
    expect(r.status(), await r.text()).toBe(201);
  };
  const a = await make('D-A', 'Alpha', 2, 5, 10, 'General');
  const b = await make('D-B', 'Beta', 1, 3, 20, 'General');
  await make('D-C', 'Gamma', 4, 8, 5, 'General'); // never received: out of stock

  await move('INBOUND', a, 'Shelf-A', 6); // Alpha is 6 + 5 = 11 over two shelves: fine for a minimum of 10
  await move('INBOUND', a, 'Shelf-B', 5);
  await move('INBOUND', b, 'Shelf-A', 12); // Beta 12 of minimum 20: below
  await move('OUTBOUND', b, 'Shelf-A', 2); // Beta 10

  await page.goto('/dashboard');
  const tiles = page.getByRole('region', { name: 'Key figures' });
  await expect(tiles.getByText('Units in stock').locator('..')).toContainText('21'); // 11 + 10
  await expect(tiles.getByText('Stock value').locator('..')).toContainText('$85.00'); // 11*5 + 10*3
  await expect(tiles.getByText('Below minimum').locator('..')).toContainText('1'); // Beta
  await expect(tiles.getByText('Out of stock').locator('..')).toContainText('1'); // Gamma

  const needs = page.getByRole('heading', { name: 'Needs ordering' }).locator('xpath=ancestor::div[contains(@class,"rounded-[14px]")][1]');
  await expect(needs).toContainText('Beta');
  await expect(needs).toContainText('Short by 10');
  await expect(needs).toContainText('Gamma');
  await expect(needs).not.toContainText('Alpha'); // 11 over two locations is enough, although each shelf alone is not

  // the charts draw (bars exist) in light and in dark
  for (const theme of ['Light', 'Dark']) {
    await page.goto('/settings');
    await page.getByRole('radio', { name: theme }).click();
    await page.goto('/dashboard');
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible();
    expect(await page.locator('.recharts-bar-rectangle').count()).toBeGreaterThan(0);
    const fill = await page.locator('.recharts-bar-rectangle path').first().getAttribute('fill');
    expect(fill).toContain('--chart-1');
  }

  // one location only: Shelf-B holds 5 of Alpha
  await page.getByLabel('Location').selectOption('Shelf-B');
  await expect(tiles.getByText('Units in stock').locator('..')).toContainText('5');
});
