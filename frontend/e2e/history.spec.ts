import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/* The History page: ADJUST has its own label and filter (U3), the day filter follows the viewer's days (U2), the CSV is safe (U9). */

const PASSWORD = 'correct-horse-1';
let n = 0;
// Sign-up and login are rate limited per client address (real, stays on): own range for this file.
const address = (k: number) => `10.91.${Math.floor(k / 250)}.${(k % 250) + 1}`;

async function setup(page: Page, request: APIRequestContext, baseURL: string) {
  const k = n++;
  const email = `e2e-history-${Date.now()}-${k}@example.com`;
  const res = await request.post('/api/auth/register', {
    headers: { 'X-Forwarded-For': address(k) },
    data: { email, password: PASSWORD, first_name: 'Hist', last_name: 'Tester' },
  });
  expect(res.status(), await res.text()).toBe(200);
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address(k + 500) });
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('form:has(#password) button[type="submit"]').click();
  await page.waitForURL('**/dashboard');

  const headers = { Origin: baseURL };
  expect((await page.request.post('/api/locations', { headers, data: { name: 'Shelf-A', capacity: 1000 } })).status()).toBe(200);
  // a name with a comma, a quote, a hash and a formula start: the CSV must survive all of it
  const name = '=Box #5, "large"';
  const p = await page.request.post('/api/products', { headers, data: { sku: `H-${Date.now()}-${k}`, name, cost_price: 1, sell_price: 2, min_stock_level: 0 } });
  expect(p.status(), await p.text()).toBe(200);
  const id = (await p.json()).id;
  const move = async (type: string, quantity: number) => {
    const r = await page.request.post('/api/transactions', { headers, data: { type, quantity, product_id: id, location: 'Shelf-A' } });
    expect(r.status(), await r.text()).toBe(201);
  };
  await move('INBOUND', 10);
  await move('OUTBOUND', 3);
  await move('ADJUST', 4); // 7 -> 4: a change of -3
  return { name };
}

test('movements read correctly, ADJUST has its own label and filter, filters narrow the list', async ({ page, request, baseURL }) => {
  await setup(page, request, baseURL!);
  await page.goto('/transactions');
  await expect(page.getByText('1-3 of 3')).toBeVisible();

  const adjust = page.getByRole('row', { name: /Adjusted/ });
  await expect(adjust).toContainText('−3'); // signed change, not drawn as a shipment
  await expect(adjust).toContainText('4'); // stock after
  await expect(page.getByRole('row', { name: /Received/ })).toContainText('+10');
  await expect(page.getByRole('row', { name: /Shipped/ })).toContainText('−3');

  await page.getByRole('radio', { name: 'Adjusted' }).click();
  await expect(page.getByText('1-1 of 1')).toBeVisible();
  await page.getByRole('radio', { name: 'All' }).click();

  // today's day contains all three; a day in the past contains none
  const today = new Date();
  const pad = (v: number) => String(v).padStart(2, '0');
  const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  await page.getByLabel('From').fill(day);
  await page.getByLabel('To').fill(day);
  await expect(page.getByText('1-3 of 3')).toBeVisible();
  await page.getByLabel('From').fill('2020-01-01');
  await page.getByLabel('To').fill('2020-01-02');
  await expect(page.getByText('No movement matches')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('1-3 of 3')).toBeVisible();
});

test('the CSV has a byte order mark, escapes quotes and commas, keeps the hash, and defuses a formula', async ({ page, request, baseURL }) => {
  const { name } = await setup(page, request, baseURL!);
  await page.goto('/transactions');
  await expect(page.getByText('1-3 of 3')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^history-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await readFile((await file.path())!, 'utf8');

  expect(text.charCodeAt(0)).toBe(0xfeff);
  const lines = text.slice(1).trim().split('\r\n');
  expect(lines).toHaveLength(4); // header + 3 movements: the # did not cut the file
  expect(lines[0]).toBe('Date (local),Date (UTC),Movement,Product,SKU,Location,Change,Stock after,Reference,Note,By');
  expect(text).toContain(`"'=Box #5, ""large"""`); // formula defused, quoted, quotes doubled
  expect(text).toContain(',Adjusted,');
  expect(text).toContain(',−3,4,');
  expect(name).toContain('#');
});
