import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/* The Products page: create, search, rename without touching the prices (U5), and delete. */

const PASSWORD = 'correct-horse-1';
let n = 0;
// Sign-up and login are rate limited per client address (real, stays on): own range for this file.
const address = (k: number) => `10.90.${Math.floor(k / 250)}.${(k % 250) + 1}`;

async function signIn(page: Page, request: APIRequestContext) {
  const k = n++;
  const email = `e2e-products-${Date.now()}-${k}@example.com`;
  const res = await request.post('/api/auth/register', {
    headers: { 'X-Forwarded-For': address(k) },
    data: { email, password: PASSWORD, first_name: 'Prod', last_name: 'Tester' },
  });
  expect(res.status(), await res.text()).toBe(200);
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address(k + 500) });
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('form:has(#password) button[type="submit"]').click();
  await page.waitForURL('**/dashboard');
}

test('add a product, rename it (prices stay), and delete it', async ({ page, request, baseURL }) => {
  await signIn(page, request);
  await page.goto('/products');
  await expect(page.getByText('No products yet')).toBeVisible();

  const sku = `P-${Date.now()}`;
  await page.getByRole('button', { name: 'Add product' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Add product' });
  await sheet.getByLabel('Name').fill('Widget');
  await sheet.getByLabel('SKU').fill(sku);
  await sheet.getByLabel('Cost price (USD)').fill('4.10');
  await sheet.getByLabel('Selling price (USD)').fill('7.35');
  await sheet.getByLabel('Minimum stock').fill('6');
  await sheet.getByRole('button', { name: 'Add product' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Added Widget' })).toBeVisible();
  const row = page.getByRole('row', { name: /Widget/ });
  await expect(row).toContainText('$7.35');

  // a form with a missing price explains itself instead of sending
  await page.getByRole('button', { name: 'Add product' }).first().click();
  await sheet.getByLabel('Name').fill('Broken');
  await sheet.getByRole('button', { name: 'Add product' }).click();
  await expect(sheet.getByText('Enter a SKU.')).toBeVisible();
  await expect(sheet.getByText('Enter a price, 0 or more.').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // rename only: the request carries the name and nothing else (U5), the prices are unchanged
  await page.getByRole('button', { name: 'Edit Widget' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit product' });
  await expect(edit.getByRole('button', { name: 'Save changes' })).toBeDisabled(); // nothing changed yet
  await edit.getByLabel('Name').fill('Widget Pro');
  const put = page.waitForRequest((r) => r.method() === 'PUT' && r.url().includes('/api/products/'));
  await edit.getByRole('button', { name: 'Save changes' }).click();
  expect((await put).postDataJSON()).toEqual({ name: 'Widget Pro' });
  const renamed = page.getByRole('row', { name: /Widget Pro/ });
  await expect(renamed).toContainText('$4.10');
  await expect(renamed).toContainText('$7.35');

  // search finds it, a miss says so
  await page.getByLabel('Search products').fill('zzz-nothing');
  await expect(page.getByText('No product matches')).toBeVisible();
  await page.getByLabel('Search products').fill(sku);
  await expect(renamed).toBeVisible();
  await page.getByLabel('Search products').fill('');

  // delete: with 5 units in stock the sheet says they are written off
  const list = await (await page.request.get('/api/products?limit=5')).json();
  const tx = await page.request.post('/api/transactions', { headers: { Origin: baseURL! }, data: { type: 'INBOUND', quantity: 5, product_id: list[0].id, location: (await (await page.request.get('/api/locations')).json())[0].name } });
  expect(tx.status(), await tx.text()).toBe(201);
  await page.reload();
  await page.getByRole('button', { name: 'Delete Widget Pro' }).click();
  const del = page.getByRole('dialog', { name: 'Delete product' });
  await expect(del).toContainText('5 units are still in stock');
  await del.getByRole('button', { name: 'Delete product' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Deleted Widget Pro' })).toBeVisible();
  await expect(page.getByText('No products yet')).toBeVisible();
});

test('a duplicate SKU is refused with the server message, and paging walks the list', async ({ page, request, baseURL }) => {
  await signIn(page, request);
  const headers = { Origin: baseURL! };
  for (let i = 0; i < 27; i++) {
    const r = await page.request.post('/api/products', { headers, data: { sku: `S-${i}`, name: `Item ${String(i).padStart(2, '0')}`, cost_price: 1, sell_price: 2, min_stock_level: 0 } });
    expect(r.status(), await r.text()).toBe(200);
  }
  await page.goto('/products');
  await expect(page.getByText('1-25 of 27')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('26-27 of 27')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();

  await page.getByRole('button', { name: 'Add product' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Add product' });
  await sheet.getByLabel('Name').fill('Copy');
  await sheet.getByLabel('SKU').fill('S-3');
  await sheet.getByLabel('Cost price (USD)').fill('1');
  await sheet.getByLabel('Selling price (USD)').fill('2');
  await sheet.getByRole('button', { name: 'Add product' }).click();
  await expect(sheet.getByRole('alert')).toContainText("already exists");
});
