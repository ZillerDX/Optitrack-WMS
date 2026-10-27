import { expect, type Locator, type Page } from '@playwright/test';

/** Chooses `option` in the dropdown (a combobox button with a listbox popup) found by `field`. */
export async function choose(page: Page, field: Locator, option: string) {
  await field.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(field).toContainText(option);
}

export const dayName = (day: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

/** 'YYYY-MM-DD' of today in the browser's zone, `offset` days away. */
export function dayFromToday(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Opens the date picker named `field`, goes to the month of `day` with the arrows, and clicks the day. */
export async function pickDay(page: Page, field: string, day: string) {
  await page.getByLabel(field, { exact: true }).click();
  const calendar = page.getByRole('group', { name: 'Calendar' });
  await expect(calendar).toBeVisible();
  const [y, m] = day.split('-').map(Number);
  for (let i = 0; i < 36; i++) {
    const shown = (await calendar.getByRole('grid').getAttribute('aria-labelledby')) ?? '';
    const text = (await calendar.locator(`[id="${shown}"]`).textContent()) ?? '';
    const at = new Date(`1 ${text} UTC`);
    const diff = (y - at.getUTCFullYear()) * 12 + (m - 1 - at.getUTCMonth());
    if (diff === 0) break;
    await calendar.getByRole('button', { name: diff < 0 ? 'Previous month' : 'Next month' }).click();
  }
  await calendar.getByRole('button', { name: dayName(day), exact: true }).click();
  await expect(calendar).toBeHidden();
}
