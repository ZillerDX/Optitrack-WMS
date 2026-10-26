import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '@/lib/csv';
import { endOfLocalDay, startOfLocalDay } from '@/lib/dateRange';

describe('csv', () => {
  it('starts with a byte order mark so Excel reads UTF-8', () => {
    expect(toCsv(['a'], [['ก']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('quotes commas, quotes and line breaks, and doubles the quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('keeps # and plain text as they are (a # must not cut the file)', () => {
    expect(csvCell('Box #5 (large)')).toBe('Box #5 (large)');
  });

  it('defuses spreadsheet formulas in text but leaves numbers alone', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+1 555')).toBe("'+1 555");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-5 units')).toBe("'-5 units");
    expect(csvCell(-5)).toBe('-5');
  });

  it('writes empty cells for null, undefined and non-finite numbers', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, NaN]])).toBe('﻿a,b,c\r\n,,\r\n');
  });

  it('joins rows with CRLF and ends with one', () => {
    expect(toCsv(['x', 'y'], [[1, 'two'], [3, 'four']])).toBe('﻿x,y\r\n1,two\r\n3,four\r\n');
  });
});

describe('dateRange', () => {
  it('covers the whole local day', () => {
    const from = new Date(startOfLocalDay('2026-03-05')!);
    const to = new Date(endOfLocalDay('2026-03-05')!);
    expect([from.getFullYear(), from.getMonth(), from.getDate(), from.getHours(), from.getMinutes()]).toEqual([2026, 2, 5, 0, 0]);
    expect([to.getDate(), to.getHours(), to.getMinutes(), to.getSeconds(), to.getMilliseconds()]).toEqual([5, 23, 59, 59, 999]);
  });

  it('rejects text that is not a real day', () => {
    expect(startOfLocalDay('')).toBeNull();
    expect(startOfLocalDay('2026-02-31')).toBeNull();
    expect(endOfLocalDay('05/03/2026')).toBeNull();
  });
});
