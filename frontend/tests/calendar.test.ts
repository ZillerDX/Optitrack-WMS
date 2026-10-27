import { describe, expect, it } from 'vitest';
import { addDays, addMonths, clampDay, compareDays, dayLabel, isOutOfRange, monthGrid, monthLabel, parseDay, weekday } from '@/lib/calendar';

describe('parseDay', () => {
  it('accepts real days and rejects the rest', () => {
    expect(parseDay('2026-03-05')).toEqual([2026, 3, 5]);
    expect(parseDay('2028-02-29')).toEqual([2028, 2, 29]);
    for (const bad of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-00-10', '2026-3-5', '', 'today']) expect(parseDay(bad)).toBeNull();
  });
});

describe('addDays and addMonths', () => {
  it('cross month, year and leap-day borders', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-05', 7)).toBe('2026-03-12');
  });
  it('are not moved by a daylight-saving change', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
  it('keep the day number, or the last day of a shorter month', () => {
    expect(addMonths('2026-03-15', 1)).toBe('2026-04-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-10', 1)).toBe('2027-01-10');
    expect(addMonths('2026-01-10', -1)).toBe('2025-12-10');
    expect(addMonths('2026-05-31', -1)).toBe('2026-04-30');
  });
  it('leave a value that is not a day alone', () => {
    expect(addDays('nope', 3)).toBe('nope');
    expect(addMonths('nope', 3)).toBe('nope');
  });
});

describe('range helpers', () => {
  it('compare and clamp', () => {
    expect(compareDays('2026-03-05', '2026-03-06')).toBe(-1);
    expect(compareDays('2026-03-05', '2026-03-05')).toBe(0);
    expect(isOutOfRange('2026-03-05', '2026-03-06')).toBe(true);
    expect(isOutOfRange('2026-03-05', undefined, '2026-03-04')).toBe(true);
    expect(isOutOfRange('2026-03-05', '2026-03-05', '2026-03-05')).toBe(false);
    expect(isOutOfRange('2026-03-05', '', '')).toBe(false);
    expect(clampDay('2026-03-01', '2026-03-05', '2026-03-09')).toBe('2026-03-05');
    expect(clampDay('2026-03-20', '2026-03-05', '2026-03-09')).toBe('2026-03-09');
    expect(clampDay('2026-03-07', '2026-03-05', '2026-03-09')).toBe('2026-03-07');
  });
});

describe('monthGrid', () => {
  it('is six weeks, Sunday first, with the neighbouring days around the month', () => {
    const grid = monthGrid('2026-03-18');
    expect(grid).toHaveLength(6);
    expect(grid.every((row) => row.length === 7)).toBe(true);
    // 1 March 2026 is a Sunday: the first row starts on it, the sixth row is all April
    expect(grid[0][0]).toEqual({ day: '2026-03-01', inMonth: true });
    expect(grid[4][1]).toEqual({ day: '2026-03-30', inMonth: true });
    expect(grid[4][3]).toEqual({ day: '2026-04-01', inMonth: false });
    expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(31);
  });
  it('starts with the days of the previous month when the 1st is not a Sunday', () => {
    const grid = monthGrid('2026-04-10'); // 1 April 2026 is a Wednesday
    expect(grid[0].slice(0, 3)).toEqual([
      { day: '2026-03-29', inMonth: false },
      { day: '2026-03-30', inMonth: false },
      { day: '2026-03-31', inMonth: false },
    ]);
    expect(grid[0][3]).toEqual({ day: '2026-04-01', inMonth: true });
  });
  it('is empty for a value that is not a day', () => {
    expect(monthGrid('')).toEqual([]);
  });
});

describe('labels', () => {
  it('weekday and names', () => {
    expect(weekday('2026-03-01')).toBe(0);
    expect(weekday('2026-03-07')).toBe(6);
    expect(monthLabel('2026-03-18')).toBe('March 2026');
    expect(dayLabel('2026-03-05')).toContain('5 March 2026');
    expect(dayLabel('2026-03-05')).toContain('Thursday');
  });
});
