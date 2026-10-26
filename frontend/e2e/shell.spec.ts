import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/* What the shell adds on every page: the command palette and its actions (U6), the assistant, and the profile (U10). */

const PASSWORD = 'correct-horse-1';
let n = 0;
// Sign-up and login are rate limited per client address (real, stays on): own range for this file.
const address = (k: number) => `10.95.${Math.floor(k / 250)}.${(k % 250) + 1}`;

async function signIn(page: Page, request: APIRequestContext) {
  const k = n++;
  const email = `e2e-shell-${Date.now()}-${k}@example.com`;
  const res = await request.post('/api/auth/register', {
    headers: { 'X-Forwarded-For': address(k) },
    data: { email, password: PASSWORD, first_name: 'Sam', last_name: 'Shell' },
  });
  expect(res.status(), await res.text()).toBe(200);
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address(k + 500) });
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('form:has(#password) button[type="submit"]').click();
  await page.waitForURL('**/dashboard');
  return email;
}

async function seed(page: Page, baseURL: string, stock: number, min: number) {
  const headers = { Origin: baseURL };
  expect((await page.request.post('/api/locations', { headers, data: { name: 'Shelf-A', capacity: 500 } })).status()).toBe(200);
  const p = await page.request.post('/api/products', { headers, data: { sku: `SH-${Date.now()}`, name: 'Sprocket', cost_price: 2, sell_price: 5, min_stock_level: min } });
  expect(p.status(), await p.text()).toBe(200);
  const id = (await p.json()).id;
  const tx = await page.request.post('/api/transactions', { headers, data: { type: 'INBOUND', quantity: stock, product_id: id, location: 'Shelf-A' } });
  expect(tx.status(), await tx.text()).toBe(201);
  return id as number;
}

test('the palette opens with Ctrl+K, jumps to pages and its actions really open the forms (U6)', async ({ page, request }) => {
  await signIn(page, request);

  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Search and commands' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('history');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/transactions$/);

  await page.keyboard.press('Control+k');
  await palette.getByRole('combobox').fill('record');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Record a movement' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('Control+k');
  await palette.getByRole('combobox').fill('add a prod');
  await page.getByRole('option', { name: /Add a product/ }).click();
  await expect(page.getByRole('dialog', { name: 'Add product' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('Control+k');
  await palette.getByRole('combobox').fill('zzz');
  await expect(palette.getByText('Nothing found.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
});

test('a product found in the palette opens the movement form with it chosen, and saving shows a notice', async ({ page, request, baseURL }) => {
  await signIn(page, request);
  await seed(page, baseURL!, 4, 1);
  await page.reload();

  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: /Search pages/ }).fill('Sprock');
  await page.getByRole('option', { name: /Sprocket/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Record a movement' });
  await expect(sheet.getByText('Sprocket')).toBeVisible();
  await sheet.getByLabel('Location').selectOption('Shelf-A');
  await expect(sheet.getByTestId('stock-now')).toContainText('4');
  await sheet.getByLabel('Quantity received').fill('6');
  await sheet.getByRole('button', { name: 'Receive 6' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Received 6 of Sprocket' })).toBeVisible();
});

test('the assistant answers without any API key, and suggests an order that can be approved', async ({ page, request, baseURL }) => {
  test.setTimeout(90_000);
  await signIn(page, request);
  await seed(page, baseURL!, 2, 10); // 2 of a minimum of 10

  await page.getByRole('button', { name: 'Assistant' }).first().click();
  const panel = page.getByRole('dialog', { name: 'Assistant' });
  await panel.getByLabel('Your question').fill('What is the total inventory value?');
  await panel.getByRole('button', { name: 'Send' }).click();
  await expect(panel.getByText(/Assistant: /)).toBeVisible({ timeout: 30_000 });

  await panel.getByRole('radio', { name: 'Reorder' }).click();
  await expect(panel.getByText('Sprocket')).toBeVisible();
  await panel.getByRole('button', { name: 'Review order for Sprocket' }).click();
  await expect(panel.getByText(/receives \d+ units into Shelf-A right away/)).toBeVisible();
  await panel.getByRole('button', { name: 'Approve and receive' }).click();
  await expect(panel.getByRole('status').filter({ hasText: /approved successfully/ })).toBeVisible();

  await panel.getByRole('radio', { name: 'Report' }).click();
  await panel.getByRole('button', { name: 'Generate report' }).click();
  await expect(panel.getByText(/Health score \d+ of 100/)).toBeVisible();
});

test('a saved name shows in the sidebar at once and after a reload (U10)', async ({ page, request }) => {
  await signIn(page, request);
  await page.goto('/profile');
  await page.getByLabel('First name').fill('Zed');
  await page.getByLabel('Last name').fill('Quinn');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByText('Zed Quinn').first()).toBeVisible(); // the sidebar user chip, without a reload
  await page.reload();
  await expect(page.getByLabel('First name')).toHaveValue('Zed');
});
