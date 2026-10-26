import { expect, test, type Page } from '@playwright/test';

/*
 * The redesigned shell and /settings: the theme and the display currency are remembered on the device,
 * and the shell shows the signed-in user.
 */

const PASSWORD = 'correct-horse-1';

let counter = 0;
const uniqueEmail = () => `e2e-settings-${Date.now()}-${counter++}@example.com`;
// Sign-up and login are rate limited per client address (real, stays on): this file uses its own range.
const address = (n: number) => `10.40.${Math.floor(n / 250)}.${(n % 250) + 1}`;

async function signIn(page: Page, request: import('@playwright/test').APIRequestContext): Promise<string> {
  const email = uniqueEmail();
  const n = counter;
  const res = await request.post('/api/auth/register', {
    headers: { 'X-Forwarded-For': address(n) },
    data: { email, password: PASSWORD, first_name: 'Sam', last_name: 'Settings' },
  });
  expect(res.status(), await res.text()).toBe(200);

  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': address(n + 500) });
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('form:has(#password) button[type="submit"]').click();
  await page.waitForURL('**/dashboard');
  return email;
}

test('settings: light by default, dark and currency are remembered after a reload', async ({ page, request }) => {
  const email = await signIn(page, request);
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.getByText(`(${email})`)).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('radio', { name: 'THB' }).click();
  await expect(page.getByTestId('currency-example')).toContainText('฿');

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'THB' })).toBeChecked();
});

test('shell: the five places are linked and Settings is the current page', async ({ page, request }) => {
  await signIn(page, request);
  await page.goto('/settings');

  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
  for (const name of ['Dashboard', 'Stock', 'Products', 'History', 'Settings']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
});

test('settings: sign out ends the session and returns to the login page', async ({ page, request }) => {
  await signIn(page, request);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out' }).last().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);
});
