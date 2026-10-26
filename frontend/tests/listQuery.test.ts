import { describe, expect, it } from 'vitest';
import {
  ilikeTerm,
  inventoryFilters,
  listResponse,
  MAX_LIST_LIMIT,
  pagingPath,
  parsePaging,
  productFilters,
  totalFromContentRange,
  transactionFilters,
} from '@/lib/listQuery';

const q = (s: string) => new URLSearchParams(s);

describe('parsePaging', () => {
  it('defaults to the 1000-row cap from offset 0 and says the limit was not asked for', () => {
    expect(parsePaging(q(''))).toEqual({ ok: true, value: { limit: MAX_LIST_LIMIT, offset: 0, explicit: false } });
  });

  it('accepts a limit and an offset', () => {
    expect(parsePaging(q('limit=50&offset=100'))).toEqual({ ok: true, value: { limit: 50, offset: 100, explicit: true } });
    expect(parsePaging(q('limit=1000'))).toMatchObject({ ok: true, value: { limit: 1000 } });
  });

  it.each(['limit=0', 'limit=1001', 'limit=-1', 'limit=abc', 'limit=1.5', 'limit=99999999999', 'offset=-1', 'offset=x', 'offset=1.5'])(
    'refuses %s',
    (s) => {
      expect(parsePaging(q(s)).ok).toBe(false);
    }
  );

  it('builds the path part', () => {
    expect(pagingPath({ limit: 20, offset: 40, explicit: true })).toBe('&limit=20&offset=40');
  });
});

describe('ilikeTerm', () => {
  it('wraps the term in wildcards inside a quoted value', () => {
    expect(ilikeTerm('bolt')).toBe('"*bolt*"');
  });

  it('makes the LIKE wildcards literal and drops the PostgREST wildcard', () => {
    expect(ilikeTerm('50%_off*')).toBe('"*50\\\\%\\\\_off*"'); // 50\\%\\_off after the two escaping layers
  });

  it('cannot break out of the quoted value or the or=(...) list', () => {
    const t = ilikeTerm('a"),sku.eq.1,(b');
    expect(t.startsWith('"*')).toBe(true);
    expect(t.endsWith('*"')).toBe(true);
    expect(t).toContain('\\"'); // the quote is escaped
  });

  it('escapes backslashes', () => {
    expect(ilikeTerm('a\\b')).toBe('"*a\\\\\\\\b*"');
  });
});

describe('productFilters', () => {
  it('is empty without parameters', () => {
    expect(productFilters(q(''))).toEqual({ ok: true, value: '' });
    expect(productFilters(q('q=%20%20&category='))).toEqual({ ok: true, value: '' });
  });

  it('searches name, SKU and barcode and filters the category', () => {
    const r = productFilters(q('q=bolt&category=Hardware%20%26%20Tools'));
    const or = encodeURIComponent('(name.ilike."*bolt*",sku.ilike."*bolt*",barcode.ilike."*bolt*")');
    expect(r.ok && r.value).toBe(`&or=${or}&category=eq.Hardware%20%26%20Tools`);
  });

  it('percent-encodes the search so that %, & and # in it cannot reach the URL raw', () => {
    const r = productFilters(q(`q=${encodeURIComponent('50%&#')}`));
    expect(r.ok && r.value).not.toMatch(/[%](?![0-9A-F]{2})/);
    expect(r.ok && r.value.slice(1)).not.toMatch(/[#]|&(?!category)/);
    // LIKE escape (\%) and then the quoted-string escape (\\%) leave two backslashes
    expect(r.ok && decodeURIComponent(r.value.slice('&or='.length))).toContain('50\\\\%&#');
  });

  it('refuses a search longer than 100 characters', () => {
    expect(productFilters(q(`q=${'x'.repeat(101)}`)).ok).toBe(false);
    expect(productFilters(q(`category=${'x'.repeat(101)}`)).ok).toBe(false);
  });
});

describe('transactionFilters', () => {
  it('is empty without parameters', () => {
    expect(transactionFilters(q(''))).toEqual({ ok: true, value: '' });
  });

  it('filters by type and product', () => {
    const r = transactionFilters(q('type=ADJUST&product_id=7'));
    expect(r.ok && r.value).toBe('&type=eq.ADJUST&product_id=eq.7');
  });

  it.each(['type=SELL', 'type=inbound', 'product_id=0', 'product_id=x', 'product_id=-3'])('refuses %s', (s) => {
    expect(transactionFilters(q(s)).ok).toBe(false);
  });

  it('turns a date into the whole day in UTC', () => {
    const r = transactionFilters(q('from=2026-10-01&to=2026-10-31'));
    expect(r.ok && r.value).toBe(
      `&created_at=gte.${encodeURIComponent('2026-10-01T00:00:00.000Z')}&created_at=lte.${encodeURIComponent('2026-10-31T23:59:59.999Z')}`
    );
  });

  it('takes a date-time as it is (the browser sends its own local day as UTC instants)', () => {
    const r = transactionFilters(q('from=2026-10-01T00:00:00%2B07:00'));
    expect(r.ok && r.value).toBe(`&created_at=gte.${encodeURIComponent('2026-09-30T17:00:00.000Z')}`);
  });

  it.each(['from=nope', 'to=2026-13-45', 'from=1970-01-01', 'to=9999-12-31', 'from=2026-10-31&to=2026-10-01'])('refuses %s', (s) => {
    expect(transactionFilters(q(s)).ok).toBe(false);
  });
});

describe('inventoryFilters', () => {
  it('filters by product', () => {
    expect(inventoryFilters(q('product_id=5'))).toEqual({ ok: true, value: '&product_id=eq.5' });
    expect(inventoryFilters(q(''))).toEqual({ ok: true, value: '' });
    expect(inventoryFilters(q('product_id=0')).ok).toBe(false);
  });
});

describe('totalFromContentRange', () => {
  it('reads the total after the slash', () => {
    expect(totalFromContentRange('0-9/42')).toBe(42);
    expect(totalFromContentRange('*/0')).toBe(0);
    expect(totalFromContentRange('0-9/*')).toBeNull();
    expect(totalFromContentRange(null)).toBeNull();
  });
});

describe('listResponse', () => {
  const upstream = (range: string | null) => new Response('[]', { headers: range ? { 'content-range': range } : {} });

  it('returns the rows as a plain array with the total', async () => {
    const res = listResponse(upstream('0-1/2'), [{ id: 1 }, { id: 2 }], { limit: 1000, offset: 0, explicit: false });
    expect(await res.json()).toEqual([{ id: 1 }, { id: 2 }]);
    expect(res.headers.get('x-total-count')).toBe('2');
    expect(res.headers.get('x-truncated')).toBeNull();
  });

  it('says so when the default cap cut the answer', () => {
    const rows = Array.from({ length: 1000 }, (_, id) => ({ id }));
    const res = listResponse(upstream('0-999/1500'), rows, { limit: 1000, offset: 0, explicit: false });
    expect(res.headers.get('x-total-count')).toBe('1500');
    expect(res.headers.get('x-truncated')).toBe('true');
  });

  it('does not call a page truncated when the caller asked for it', () => {
    const rows = Array.from({ length: 50 }, (_, id) => ({ id }));
    const res = listResponse(upstream('100-149/500'), rows, { limit: 50, offset: 100, explicit: true });
    expect(res.headers.get('x-total-count')).toBe('500');
    expect(res.headers.get('x-truncated')).toBeNull();
  });

  it('still answers with an array when the count is unknown or the body is not a list', async () => {
    const res = listResponse(upstream(null), { not: 'a list' }, { limit: 1000, offset: 0, explicit: false });
    expect(await res.json()).toEqual([]);
    expect(res.headers.get('x-total-count')).toBeNull();
  });
});
