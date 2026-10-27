import { expect, test, type Page } from '@playwright/test';

/* The reviewer demo: one click on the login page gives a private account with mock data and a guide that
   ticks off by itself while the reviewer walks through the whole system. */

let n = 0;
// The demo route is limited per address (real, stays on): each test uses its own.
const visitor = (page: Page) => page.setExtraHTTPHeaders({ 'X-Forwarded-For': `10.110.${Math.floor(n / 250)}.${(n++ % 250) + 1}` });

const panelOf = (page: Page) => page.getByRole('complementary', { name: 'Reviewer guide' });
const stepRow = (page: Page, title: string) => panelOf(page).locator('summary', { hasText: title });

async function openDemo(page: Page) {
  await visitor(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Reviewing this project?' })).toBeVisible();
  await page.getByRole('button', { name: 'Open the reviewer demo' }).click();
  await page.waitForURL('**/dashboard');
  await expect(panelOf(page)).toBeVisible();
}

test('one click opens a private demo account with mock data and the guide', async ({ page }) => {
  await openDemo(page);

  // mock data: a dashboard with figures (not the empty state) and the ten products
  await expect(page.getByText('Nothing to show yet')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Key figures' })).toContainText('Units in stock');
  await expect(page.getByText('Reviewer Demo').first()).toBeVisible();
  await page.goto('/products');
  await expect(page.getByText('1-10 of 10')).toBeVisible();

  // the guide starts at step 1 with nothing done
  await expect(panelOf(page)).toContainText('Step 1 of 9');
  await expect(stepRow(page, 'Create a location')).toContainText('current step');
  await expect(page.getByRole('progressbar', { name: 'Guide progress' })).toHaveAttribute('aria-valuenow', '0');

  // landing on the dashboard did not tick "See the result on the Dashboard"
  await expect(stepRow(page, 'See the result on the Dashboard')).not.toContainText('(done)');
});

test('a normal account sees no guide and no demo tags', async ({ page, request }) => {
  await visitor(page);
  const email = `e2e-nodemo-${Date.now()}@example.com`;
  expect((await request.post('/api/auth/register', { headers: { 'X-Forwarded-For': '10.111.0.1' }, data: { email, password: 'correct-horse-1', first_name: 'No', last_name: 'Demo' } })).status()).toBe(200);
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': '10.111.1.1' });
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('correct-horse-1');
  await page.locator('form:has(#password) button[type="submit"]').click();
  await page.waitForURL('**/dashboard');
  await page.goto('/inventory');
  await expect(page.getByRole('button', { name: 'Locations', exact: true })).toBeVisible();
  await expect(panelOf(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Step \d/ })).toHaveCount(0);
});

test('the guide walks from creating a location to the end, and each step ticks when it is really done', async ({ page }) => {
  test.setTimeout(150_000);
  await openDemo(page);

  // 1. create a location (the tag sits on the button that starts it)
  await page.goto('/inventory');
  await expect(page.getByRole('button', { name: /Guide: Step 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Locations', exact: true }).click();
  const locations = page.getByRole('dialog', { name: 'Locations' });
  await expect(locations.getByRole('button', { name: /Guide: Step 1/ })).toBeVisible();
  await locations.getByRole('button', { name: 'Add location' }).click();
  await locations.getByLabel('Name').fill('Overflow Shelf');
  await locations.getByLabel('Capacity (units)').fill('100');
  await locations.getByRole('button', { name: 'Save' }).click();
  await expect(locations.getByText('Overflow Shelf')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(stepRow(page, 'Create a location')).toContainText('(done)');
  await expect(stepRow(page, 'Add a product')).toContainText('current step');

  // 2. add a product
  await page.goto('/products');
  await page.getByRole('button', { name: 'Add product' }).first().click();
  const product = page.getByRole('dialog', { name: 'Add product' });
  await product.getByLabel('Name').fill('Demo widget');
  await product.getByLabel('SKU').fill('REVIEW-1');
  await product.getByLabel('Cost price (USD)').fill('2');
  await product.getByLabel('Selling price (USD)').fill('5');
  await product.getByLabel('Minimum stock').fill('5');
  await product.getByRole('button', { name: 'Add product' }).click();
  await expect(stepRow(page, 'Add a product')).toContainText('(done)');

  // 3. receive into the new location: the movement form carries the guide for this step
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Record movement' }).first().click();
  const movement = page.getByRole('dialog', { name: 'Record a movement' });
  await expect(movement.getByRole('note')).toContainText('Guide, step 3');
  await movement.getByLabel('Product').fill('Demo widget');
  await movement.getByRole('button', { name: /Demo widget/ }).click();
  await movement.getByLabel('Location').selectOption('Overflow Shelf');
  await movement.getByLabel('Quantity received').fill('20');
  await movement.getByRole('button', { name: 'Receive 20' }).click();
  await expect(stepRow(page, 'Receive stock into your location')).toContainText('(done)');

  // 4. ship: more than is there is refused first, then a valid amount
  await page.getByRole('button', { name: /^Ship Demo widget/ }).first().click();
  await expect(movement.getByRole('note')).toContainText('Guide, step 4');
  await movement.getByLabel('Quantity shipped').fill('25');
  await expect(movement.getByText('Only 20 in stock here')).toBeVisible();
  await expect(movement.getByRole('button', { name: /^Ship/ })).toBeDisabled();
  await movement.getByLabel('Quantity shipped').fill('5');
  await movement.getByRole('button', { name: 'Ship 5' }).click();
  await expect(stepRow(page, 'Ship stock out')).toContainText('(done)');

  // 5. adjust after a count
  await page.getByRole('button', { name: /^Adjust Demo widget/ }).first().click();
  await movement.getByLabel('Counted quantity').fill('10');
  await movement.getByRole('button', { name: 'Set stock' }).click();
  await expect(stepRow(page, 'Correct the stock after a count')).toContainText('(done)');

  // 6 and 7. visiting history and the dashboard now counts
  await page.getByRole('link', { name: 'History' }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(stepRow(page, 'Read the history')).toContainText('(done)');
  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(stepRow(page, 'See the result on the Dashboard')).toContainText('(done)');

  // 8 and 9 are marked by hand
  for (const title of ['Let the assistant suggest an order', 'Shortcuts and settings']) {
    const details = stepRow(page, title).locator('xpath=ancestor::details');
    // the current step is open already: opening it again would close it
    if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await stepRow(page, title).click();
    await details.getByRole('button', { name: 'Mark as done' }).click();
    await expect(stepRow(page, title)).toContainText('(done)');
  }
  await expect(panelOf(page)).toContainText('You have walked through everything');

  // the progress survives a reload, and the pill replaces the panel when it is hidden
  await page.reload();
  await expect(page.getByRole('progressbar', { name: 'Guide progress' })).toHaveAttribute('aria-valuenow', '9');
  await panelOf(page).getByRole('button', { name: 'Hide the guide' }).click();
  await expect(page.getByRole('button', { name: /Reviewer guide/ })).toContainText('9/9');
});

test('two demos are separate accounts: one cannot see what the other created', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await openDemo(page);
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Locations', exact: true }).click();
  const locations = page.getByRole('dialog', { name: 'Locations' });
  await locations.getByRole('button', { name: 'Add location' }).click();
  await locations.getByLabel('Name').fill('Only mine');
  await locations.getByLabel('Capacity (units)').fill('10');
  await locations.getByRole('button', { name: 'Save' }).click();
  await expect(locations.getByText('Only mine')).toBeVisible();

  const other = await browser.newContext({ baseURL: page.url().split('/inventory')[0] });
  const second = await other.newPage();
  await openDemo(second);
  await second.goto('/inventory');
  await second.getByRole('button', { name: 'Locations', exact: true }).click();
  await expect(second.getByRole('dialog', { name: 'Locations' }).getByText('Zone A-01')).toBeVisible();
  await expect(second.getByText('Only mine')).toHaveCount(0);
  await other.close();
});
