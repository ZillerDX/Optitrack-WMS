/**
 * One place for every number, money amount and date the redesigned pages show.
 * English UI: numbers like 12,480.5 and amounts like $1,234.50 or ฿45,000; dates day first
 * ("26 Oct 2026"), 24-hour times, in the viewer's own time zone unless a zone is passed.
 *
 * Dates from the API are instants (ISO strings with a zone). A calendar date typed into a form
 * ("2026-10-26") is a day, not an instant: dayToInstant combines it with the current time of day in
 * the viewer's zone, so a movement entered at 14:05 is stored as 14:05 and not as 00:00 UTC (which
 * showed as 07:00 in Thailand and landed on the wrong day in the Americas).
 */

const NUMBER_LOCALE = 'en-US';
const DATE_LOCALE = 'en-GB';

export type CurrencyCode = 'USD' | 'THB' | 'EUR';

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits }).format(value);
}

/** +40 / -12 / 0: a signed change in units. */
export function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const abs = new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 0 }).format(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`; // a real minus sign, not a hyphen
  return '0';
}

export function formatPercent(value: number, maximumFractionDigits = 0): string {
  if (!Number.isFinite(value)) return '-';
  return `${formatNumber(value, maximumFractionDigits)}%`;
}

/**
 * Money. Amounts are stored in USD and converted with the given rate. THB has no minor unit in daily use,
 * so it is shown without decimals; others with two.
 */
export function formatMoney(amountUsd: number, currency: CurrencyCode = 'USD', rateFromUsd = 1): string {
  if (!Number.isFinite(amountUsd)) return '-';
  const amount = amountUsd * rateFromUsd;
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: currency === 'THB' ? 0 : 2,
    maximumFractionDigits: currency === 'THB' ? 0 : 2,
  }).format(amount);
}

/** A compact amount for chart axes and tiles: $1.2M, $184K. */
export function formatCompactMoney(amountUsd: number, currency: CurrencyCode = 'USD', rateFromUsd = 1): string {
  if (!Number.isFinite(amountUsd)) return '-';
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amountUsd * rateFromUsd);
}

function toDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface DateOptions {
  /** IANA zone name. Default: the viewer's own zone. */
  timeZone?: string;
}

/** 26 Oct 2026 */
export function formatDate(value: Date | string | number, options: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(DATE_LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: options.timeZone }).format(date);
}

/** 26 Oct 2026, 14:05 */
export function formatDateTime(value: Date | string | number, options: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: options.timeZone,
  }).format(date);
}

/** 26 Oct: for chart axes (no year). */
export function formatDayMonth(value: Date | string | number, options: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(DATE_LOCALE, { day: 'numeric', month: 'short', timeZone: options.timeZone }).format(date);
}

/** A calendar day as 'YYYY-MM-DD' ('2026-10-26' from the dashboard series) shown as 26 Oct, with no zone shift. */
export function formatDayString(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return '-';
  // UTC on both sides: a plain calendar day never moves
  return formatDayMonth(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)), { timeZone: 'UTC' });
}

/** Today, 14:05 / Yesterday, 09:12 / 24 Oct 2026, 16:40 */
export function formatRelativeDateTime(value: Date | string | number, now: Date = new Date(), options: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return '-';
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: options.timeZone }).format(d);
  const time = new Intl.DateTimeFormat(DATE_LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: options.timeZone }).format(date);
  const today = day(now);
  const yesterday = day(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const that = day(date);
  if (that === today) return `Today, ${time}`;
  if (that === yesterday) return `Yesterday, ${time}`;
  return formatDateTime(date, options);
}

/**
 * The instant for a day picked in a form: that calendar day in the viewer's zone, at the current time of day.
 * Picking today gives "now"; picking a past day keeps the clock time, so the movement sorts sensibly.
 * `day` is 'YYYY-MM-DD'; returns null for anything else.
 */
export function dayToInstant(day: string, now: Date = new Date()): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const result = new Date(y, mo - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  // reject 2026-02-31 and the like: the constructor would roll over to March
  if (result.getFullYear() !== y || result.getMonth() !== mo - 1 || result.getDate() !== d) return null;
  return result;
}

/** 'YYYY-MM-DD' of an instant in the viewer's zone, for <input type="date">. */
export function toDayString(value: Date | string | number): string | null {
  const date = toDate(value);
  if (!date) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
