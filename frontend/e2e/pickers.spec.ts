import { expect, test, type Page } from '@playwright/test';
import { dayFromToday, dayName } from './pickers';

/* The dropdown and the date picker that replace the browser's own <select> and <input type="date">:
   keyboard use, Escape closing only the picker (not the sheet behind it), and the date limits. */

// The demo route is limited per address (real, stays on): a random address in this file's own range, so a re-run is not refused.
async function openDemo(page: Page) {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': `10.120.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Open the reviewer demo' }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('button', { name: 'Hide the guide' }).click();
}

test('the dropdown works from the keyboard and Escape closes it without closing the sheet', async ({ page }) => {
  await openDemo(page);
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Record movement' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Record a movement' });
  const location = sheet.getByRole('combobox', { name: 'Location' });

  await expect(location).toContainText('Choose a location');
  await location.focus();
  await page.keyboard.press('ArrowDown');
  await expect(location).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listbox')).toBeVisible();

  // Escape closes the list; the sheet stays and the button keeps the focus
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(location).toBeFocused();

  // type a letter to jump, Enter to choose
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('zone b');
  await expect(page.getByRole('option', { name: 'Zone B-02' })).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('Enter');
  await expect(location).toContainText('Zone B-02');
  await expect(page.getByRole('listbox')).toHaveCount(0);

  // reopened, the chosen option is the marked one
  await location.click();
  await expect(page.getByRole('option', { name: 'Zone B-02' })).toHaveAttribute('aria-selected', 'true');
  // a press outside closes it
  await sheet.getByRole('heading', { name: 'Record a movement' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(sheet).toBeVisible();
});

test('the date picker moves with the arrow keys, refuses days outside the range, and clears', async ({ page }) => {
  await openDemo(page);
  await page.goto('/transactions');
  const from = page.getByLabel('From', { exact: true });
  const to = page.getByLabel('To', { exact: true });
  const calendar = page.getByRole('group', { name: 'Calendar' });
  const today = dayFromToday(0);

  // the focus lands on today; ArrowLeft moves one day back, Enter chooses it
  await from.click();
  await expect(calendar.getByRole('button', { name: dayName(today), exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(calendar.getByRole('button', { name: dayName(dayFromToday(-1)), exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(calendar).toBeHidden();
  await expect(from).not.toContainText('Any date');

  // To cannot be earlier than From, and the other way round
  await to.click();
  await expect(calendar.getByRole('button', { name: dayName(dayFromToday(-2)), exact: true })).toBeDisabled();
  await calendar.getByRole('button', { name: 'Today' }).click();
  await expect(calendar).toBeHidden();
  await from.click();
  await expect(calendar.getByRole('button', { name: dayName(dayFromToday(1)), exact: true })).toBeDisabled();

  // Escape closes only the picker
  await page.keyboard.press('Escape');
  await expect(calendar).toBeHidden();
  await expect(from).toBeFocused();

  // Clear empties the field again
  await from.click();
  await calendar.getByRole('button', { name: 'Clear' }).click();
  await expect(from).toContainText('Any date');
});
