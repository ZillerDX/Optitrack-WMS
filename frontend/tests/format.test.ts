import { afterEach, describe, expect, it } from 'vitest';
import {
  dayToInstant,
  formatCompactMoney,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatDayString,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelativeDateTime,
  formatSigned,
  toDayString,
} from '@/lib/format';

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('numbers', () => {
  it('groups thousands with commas and rounds to whole units by default', () => {
    expect(formatNumber(12480)).toBe('12,480');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1234.567)).toBe('1,235');
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
  });

  it('shows a dash for values that are not numbers', () => {
    expect(formatNumber(NaN)).toBe('-');
    expect(formatNumber(Infinity)).toBe('-');
    expect(formatPercent(NaN)).toBe('-');
  });

  it('writes a signed change with a real minus sign', () => {
    expect(formatSigned(40)).toBe('+40');
    expect(formatSigned(-12)).toBe('−12');
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(-1200)).toBe('−1,200');
  });

  it('writes percentages', () => {
    expect(formatPercent(63)).toBe('63%');
    expect(formatPercent(62.55, 1)).toBe('62.6%');
  });
});

describe('money', () => {
  it('formats USD with a symbol and two decimals', () => {
    expect(formatMoney(184200)).toBe('$184,200.00');
    expect(formatMoney(0.5)).toBe('$0.50');
  });

  it('converts with the rate and formats THB without decimals and EUR with a euro sign (English style, not German)', () => {
    expect(formatMoney(1000, 'THB', 36)).toBe('฿36,000');
    expect(formatMoney(100, 'EUR', 0.92)).toBe('€92.00');
  });

  it('shows a dash for an amount that is not a number', () => {
    expect(formatMoney(NaN)).toBe('-');
    expect(formatCompactMoney(NaN)).toBe('-');
  });

  it('has a compact form for tiles and axes', () => {
    expect(formatCompactMoney(184200)).toBe('$184.2K');
    expect(formatCompactMoney(1_250_000)).toBe('$1.3M');
  });
});

describe('dates and times (day first, 24 hours, viewer zone unless one is given)', () => {
  const instant = new Date('2026-10-26T07:05:00Z');

  it('formats a date and a date with time in a given zone', () => {
    expect(formatDate(instant, { timeZone: 'Asia/Bangkok' })).toBe('26 Oct 2026');
    expect(formatDateTime(instant, { timeZone: 'Asia/Bangkok' })).toBe('26 Oct 2026, 14:05');
    expect(formatDateTime(instant, { timeZone: 'UTC' })).toBe('26 Oct 2026, 07:05');
    expect(formatDateTime(instant, { timeZone: 'America/Los_Angeles' })).toBe('26 Oct 2026, 00:05');
  });

  it('accepts ISO strings and numbers, and shows a dash for garbage', () => {
    expect(formatDate('2026-10-26T07:05:00Z', { timeZone: 'UTC' })).toBe('26 Oct 2026');
    expect(formatDate(instant.getTime(), { timeZone: 'UTC' })).toBe('26 Oct 2026');
    expect(formatDate('not a date')).toBe('-');
    expect(formatDateTime('')).toBe('-');
    expect(formatDayMonth('nope')).toBe('-');
  });

  it('formats a day without the year', () => {
    expect(formatDayMonth(instant, { timeZone: 'UTC' })).toBe('26 Oct');
  });

  it('shows a plain calendar day as itself, whatever the viewer zone is', () => {
    for (const tz of ['Asia/Bangkok', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
      process.env.TZ = tz;
      expect(formatDayString('2026-10-26')).toBe('26 Oct');
    }
    expect(formatDayString('2026-1-5')).toBe('-');
    expect(formatDayString('')).toBe('-');
  });

  it('says Today / Yesterday for recent movements and the full date after that', () => {
    const now = new Date('2026-10-26T09:00:00Z'); // 16:00 in Bangkok
    const opts = { timeZone: 'Asia/Bangkok' };
    expect(formatRelativeDateTime('2026-10-26T07:05:00Z', now, opts)).toBe('Today, 14:05');
    expect(formatRelativeDateTime('2026-10-25T02:30:00Z', now, opts)).toBe('Yesterday, 09:30');
    expect(formatRelativeDateTime('2026-10-20T02:30:00Z', now, opts)).toBe('20 Oct 2026, 09:30');
    // 20:30 UTC on the 25th is 03:30 on the 26th in Bangkok: that is today there, yesterday in UTC
    expect(formatRelativeDateTime('2026-10-25T20:30:00Z', now, opts)).toBe('Today, 03:30');
    expect(formatRelativeDateTime('2026-10-25T20:30:00Z', now, { timeZone: 'UTC' })).toBe('Yesterday, 20:30');
  });
});

describe('a day picked in a form becomes an instant at the current time of day (it used to be 00:00 UTC)', () => {
  it.each(['Asia/Bangkok', 'America/Los_Angeles', 'Europe/London', 'Pacific/Auckland', 'UTC'])('in %s', (tz) => {
    process.env.TZ = tz;
    const now = new Date(2026, 9, 26, 14, 5, 30); // 26 Oct 14:05:30 local
    const picked = dayToInstant('2026-10-24', now)!;
    expect(picked.getFullYear()).toBe(2026);
    expect(picked.getMonth()).toBe(9);
    expect(picked.getDate()).toBe(24);
    expect(picked.getHours()).toBe(14);
    expect(picked.getMinutes()).toBe(5);
    // and it reads back as the same local day
    expect(toDayString(picked)).toBe('2026-10-24');
  });

  it('picking today gives the current time', () => {
    process.env.TZ = 'Asia/Bangkok';
    const now = new Date(2026, 9, 26, 14, 5, 30);
    expect(dayToInstant('2026-10-26', now)!.getTime()).toBe(now.getTime() - now.getMilliseconds());
  });

  it('refuses a day that does not exist or is not a day', () => {
    const now = new Date();
    expect(dayToInstant('2026-02-31', now)).toBeNull();
    expect(dayToInstant('2026-13-01', now)).toBeNull();
    expect(dayToInstant('26/10/2026', now)).toBeNull();
    expect(dayToInstant('', now)).toBeNull();
  });

  it('toDayString uses the viewer zone and refuses garbage', () => {
    process.env.TZ = 'Asia/Bangkok';
    expect(toDayString(new Date('2026-10-25T20:30:00Z'))).toBe('2026-10-26');
    process.env.TZ = 'America/Los_Angeles';
    expect(toDayString(new Date('2026-10-26T03:30:00Z'))).toBe('2026-10-25');
    expect(toDayString('nope')).toBeNull();
  });
});
