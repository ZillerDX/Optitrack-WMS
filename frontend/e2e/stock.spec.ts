import { expect, test, type Page } from '@playwright/test';
import { choose } from './pickers';

/* The Stock page: receive, ship (refused over the stock), adjust to 0, and managing locations. */

const PASSWORD = 'correct-horse-1';
let n = 0;
// Sign-up and login are rate limited per client address (real, stays on): own range for this file.
const address = (k: number) => `10.70.${Math.floor(k / 250)}.${(k % 250) + 1}`;

/** A new account with one location and one product, signed in through the form, on /inventory. */
async function setup(page: Page, request: import('@playwright/test').APIRequestContext, baseURL: string) {
  const k = n++;
  const email = `e2e-stock-${Date.now()}-${k}@example.com`;
  const res = await request.post('/api/auth/register', {
    headers: { 'X-Forwarded-For': address(k) },
    data: { email, password: PASSWORD, first_name: 'Stock', last_name: 'Tester' },
  });
  expect(res.status(), await res.text()).toBe(200);

  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address(k + 500) });
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('form:has(#password) button[type="submit"]').click();
  await page.waitForURL('**/dashboard');

  const headers = { Origin: baseURL };
  const product = `Gizmo ${Date.now()}-${k}`;
  expect((await page.request.post('/api/locations', { headers, data: { name: 'Shelf-A', capacity: 100 } })).status()).toBe(200);
  const p = await page.request.post('/api/products', { headers, data: { sku: `G-${Date.now()}-${k}`, name: product, cost_price: 5, sell_price: 9, min_stock_level: 5 } });
  expect(p.status(), await p.text()).toBe(200);
  await page.goto('/inventory');
  return product;
}

test('receive, ship over the stock is refused with the reason, ship within it, adjust to 0', async ({ page, request, baseURL }) => {
  const product = await setup(page, request, baseURL!);
  await expect(page.getByText('No stock yet')).toBeVisible();

  // receive 10
  await page.getByRole('button', { name: 'Record movement' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Record a movement' });
  await sheet.getByLabel('Product').fill(product);
  await sheet.getByRole('button', { name: new RegExp(product) }).click();
  await choose(page, sheet.getByRole('combobox', { name: 'Location' }), 'Shelf-A');
  await sheet.getByLabel('Quantity received').fill('10');
  await expect(sheet.getByTestId('stock-after')).toContainText('10');
  await sheet.getByRole('button', { name: 'Receive 10' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Received 10' })).toBeVisible();
  const row = page.getByRole('row', { name: new RegExp(product) });
  await expect(row).toContainText('10');

  // ship 11: refused before sending, with how much is there
  await page.getByRole('button', { name: new RegExp(`Ship ${product}`) }).click();
  await sheet.getByLabel('Quantity shipped').fill('11');
  await expect(sheet.getByText('Only 10 in stock here')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Ship/ })).toBeDisabled();

  // ship 6 leaves 4: below the minimum of 5
  await sheet.getByLabel('Quantity shipped').fill('6');
  await sheet.getByRole('button', { name: 'Ship 6' }).click();
  await expect(row).toContainText('Below minimum');

  // adjust to 0
  await page.getByRole('button', { name: new RegExp(`Adjust ${product}`) }).click();
  await sheet.getByLabel('Counted quantity').fill('0');
  await sheet.getByRole('button', { name: 'Set stock' }).click();
  await expect(row).toContainText('Out of stock');
});

test('locations: add, rename, and a location with stock cannot be deleted', async ({ page, request, baseURL }) => {
  const product = await setup(page, request, baseURL!);
  // put stock on Shelf-A through the API
  const products = await (await page.request.get('/api/products?limit=5')).json();
  const tx = await page.request.post('/api/transactions', { headers: { Origin: baseURL! }, data: { type: 'INBOUND', quantity: 3, product_id: products[0].id, location: 'Shelf-A' } });
  expect(tx.status(), await tx.text()).toBe(201);
  await page.reload();
  await expect(page.getByText(product).filter({ visible: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Locations', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Locations' });

  await sheet.getByRole('button', { name: 'Add location' }).click();
  await sheet.getByLabel('Name').fill('Dock-1');
  await sheet.getByLabel('Capacity (units)').fill('50');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.getByText('Dock-1')).toBeVisible();

  await sheet.getByRole('button', { name: 'Edit Dock-1' }).click();
  await sheet.getByLabel('Name').fill('Dock-2');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.getByText('Dock-2')).toBeVisible();

  // Shelf-A holds 3 units: refused, the server's reason is shown, the location stays
  await sheet.getByRole('button', { name: 'Delete Shelf-A' }).click();
  await sheet.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(sheet.getByRole('alert')).toBeVisible();
  await expect(sheet.getByText('Shelf-A', { exact: true })).toBeVisible();

  await sheet.getByRole('button', { name: 'Keep it' }).click();

  // the empty one can go
  await sheet.getByRole('button', { name: 'Delete Dock-2' }).click();
  await sheet.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(sheet.getByText('Dock-2')).toHaveCount(0);
});
