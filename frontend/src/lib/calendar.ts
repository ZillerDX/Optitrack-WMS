/**
 * Calendar days as 'YYYY-MM-DD' strings, the same form the history filters and the API use. All the maths runs
 * in UTC on plain y/m/d numbers, so a daylight-saving change or the viewer's zone can never move a day.
 */

export interface CalendarCell {
  day: string;
  inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' -> [year, month 1-12, day], or null when it is not a real calendar day (2026-02-31 is not). */
export function parseDay(value: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return [y, mo, d];
}

function fromUtc(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(day: string, days: number): string {
  const p = parseDay(day);
  if (!p) return day;
  return fromUtc(new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)));
}

/** The same day number in another month; a day that does not exist there (31 -> February) becomes its last day. */
export function addMonths(day: string, months: number): string {
  const p = parseDay(day);
  if (!p) return day;
  const first = new Date(Date.UTC(p[0], p[1] - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fromUtc(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(p[2], last))));
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(day: string): number {
  const p = parseDay(day);
  return p ? new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() : 0;
}

/** Strings of 'YYYY-MM-DD' sort like dates, so a plain comparison is enough. */
export function compareDays(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** True when the day is before `min` or after `max` (either may be empty). */
export function isOutOfRange(day: string, min?: string, max?: string): boolean {
  return Boolean((min && day < min) || (max && day > max));
}

/** Moves a day into [min, max]. */
export function clampDay(day: string, min?: string, max?: string): string {
  if (min && day < min) return min;
  if (max && day > max) return max;
  return day;
}

/** Six rows of seven days (Sunday first) for the month that contains `day`, with the days of the neighbours around it. */
export function monthGrid(day: string): CalendarCell[][] {
  const p = parseDay(day);
  if (!p) return [];
  const first = `${String(p[0]).padStart(4, '0')}-${pad(p[1])}-01`;
  const start = addDays(first, -weekday(first));
  const rows: CalendarCell[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: CalendarCell[] = [];
    for (let c = 0; c < 7; c++) {
      const cell = addDays(start, r * 7 + c);
      row.push({ day: cell, inMonth: cell.slice(0, 7) === first.slice(0, 7) });
    }
    rows.push(row);
  }
  return rows;
}

/** "March 2026". */
export function monthLabel(day: string): string {
  const p = parseDay(day);
  if (!p) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(p[0], p[1] - 1, 1)));
}

/** "Thursday, 5 March 2026", for the accessible name of a day button. */
export function dayLabel(day: string): string {
  const p = parseDay(day);
  if (!p) return day;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(p[0], p[1] - 1, p[2])));
}

export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
