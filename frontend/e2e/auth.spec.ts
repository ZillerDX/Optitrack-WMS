import { expect, test, type Page } from '@playwright/test';

/* The sign-in pages: sign up, sign in (right and wrong password), forgot and reset password. */

const PASSWORD = 'correct-horse-1';
// Next.js has its own empty role=alert (the route announcer): leave it out.
const alertOf = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
let n = 0;
// Sign-up, login and forgot-password are rate limited per client address (real, stays on): own range per test.
const asVisitor = (page: Page) => page.setExtraHTTPHeaders({ 'X-Forwarded-For': `10.60.${Math.floor(n / 250)}.${(n++ % 250) + 1}` });

test('sign up through the form, then sign in and reach the dashboard', async ({ page }) => {
  await asVisitor(page);
  const email = `e2e-auth-${Date.now()}@example.com`;

  await page.goto('/signup');
  await page.getByLabel('First name').fill('Ada');
  await page.getByLabel('Last name').fill('Lovelace');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/login\?registered=true/);
  await expect(page.getByRole('status')).toContainText('Your account is ready');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard');
});

test('a wrong password shows the server message and stays on the login page', async ({ page }) => {
  await asVisitor(page);
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(alertOf(page)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('the password can be shown and hidden', async ({ page }) => {
  await page.goto('/login');
  const field = page.getByLabel('Password', { exact: true });
  await field.fill('secret');
  await expect(field).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(field).toHaveAttribute('type', 'text');
});

test('forgot password always answers with the same confirmation', async ({ page }) => {
  await asVisitor(page);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If the email is registered');
});

test('reset password: no token, mismatch and an invalid token are all explained', async ({ page }) => {
  await asVisitor(page);
  await page.goto('/reset-password');
  await expect(alertOf(page)).toContainText('missing its token');

  await page.goto('/reset-password?token=not-a-real-token');
  await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm new password').fill('different-one');
  await expect(alertOf(page)).toContainText('do not match');

  await page.getByLabel('Confirm new password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(alertOf(page)).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password\?token=/);
});
