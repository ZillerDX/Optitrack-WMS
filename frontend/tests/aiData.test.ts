import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeProduct,
  DataUnavailableError,
  DEFAULT_MIN_STOCK,
  loadWarehouse,
  minStockLevel,
  PROMPT_MAX_ITEMS,
  riskiest,
  stockByProduct,
  unitsSoldByProduct,
} from '@/lib/aiData';
import { fetchWithTimeout } from '@/lib/http';
import { clearAuthCache } from '@/lib/supabase';
import { createDb, FakePostgrest } from './helpers/fakePostgrest';

const NOW = new Date('2026-10-26T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe('minStockLevel', () => {
  it('keeps an explicit 0 (it used to become 5 or 10) and defaults only when there is no number', () => {
    expect(minStockLevel({ min_stock_level: 0 })).toBe(0);
    expect(minStockLevel({ min_stock_level: '0' })).toBe(0);
    expect(minStockLevel({ min_stock_level: 12 })).toBe(12);
    expect(minStockLevel({ min_stock_level: null })).toBe(DEFAULT_MIN_STOCK);
    expect(minStockLevel({})).toBe(DEFAULT_MIN_STOCK);
    expect(minStockLevel({ min_stock_level: 'abc' })).toBe(DEFAULT_MIN_STOCK);
    expect(minStockLevel({ min_stock_level: -3 })).toBe(DEFAULT_MIN_STOCK);
    expect(minStockLevel(null)).toBe(DEFAULT_MIN_STOCK);
  });
});

describe('stockByProduct', () => {
  it('sums every location of a product (it used to count the first one only)', () => {
    const map = stockByProduct([
      { product_id: 1, location: 'A', quantity: 10 },
      { product_id: 1, location: 'B', quantity: 5 },
      { product_id: 2, location: 'A', quantity: 3 },
    ]);
    expect(map.get(1)).toEqual({ quantity: 15, locations: ['A', 'B'] });
    expect(map.get(2)).toEqual({ quantity: 3, locations: ['A'] });
  });
});

describe('unitsSoldByProduct', () => {
  it('adds the shipments of the last 30 days per product and ignores older or undated rows', () => {
    const map = unitsSoldByProduct(
      [
        { product_id: 1, quantity: 4, created_at: daysAgo(1) },
        { product_id: 1, quantity: 6, created_at: daysAgo(29) },
        { product_id: 1, quantity: 100, created_at: daysAgo(31) },
        { product_id: 2, quantity: -5, created_at: daysAgo(2) },
        { product_id: 3, quantity: 9, created_at: null },
        { product_id: 4, quantity: 9, created_at: 'not a date' },
      ],
      NOW
    );
    expect(map.get(1)).toBe(10);
    expect(map.get(2)).toBe(5);
    expect(map.has(3)).toBe(false);
    expect(map.has(4)).toBe(false);
  });
});

describe('analyzeProduct (one rule for chat, predictive and report)', () => {
  const p = (min: number) => ({ min_stock_level: min });

  it('is CRITICAL with nothing on hand or at most 3 days of supply', () => {
    expect(analyzeProduct(p(5), 0, 0)).toMatchObject({ urgency: 'CRITICAL', days_of_inventory: 0 });
    // 30 units shipped in 30 days = 1/day; 3 on hand = 3 days
    expect(analyzeProduct(p(1), 3, 30)).toMatchObject({ urgency: 'CRITICAL', days_of_inventory: 3, daily_burn_rate: 1 });
  });

  it('is WARNING below the minimum or at most 10 days of supply, HEALTHY at the minimum', () => {
    expect(analyzeProduct(p(5), 4, 0).urgency).toBe('WARNING');
    expect(analyzeProduct(p(5), 5, 0).urgency).toBe('HEALTHY'); // at the minimum is not below it (same as the database status)
    expect(analyzeProduct(p(1), 10, 30)).toMatchObject({ urgency: 'WARNING', days_of_inventory: 10 });
    expect(analyzeProduct(p(1), 11, 30).urgency).toBe('HEALTHY');
  });

  it('has no forecast without sales, and a minimum of 0 never raises a warning by itself', () => {
    const a = analyzeProduct(p(0), 2, 0);
    expect(a).toMatchObject({ urgency: 'HEALTHY', days_of_inventory: null, daily_burn_rate: 0, min_stock_level: 0 });
  });

  it('suggests the larger of "twice the minimum minus stock" and two weeks of sales, at least 1', () => {
    expect(analyzeProduct(p(5), 2, 0).suggested_reorder_qty).toBe(8);
    expect(analyzeProduct(p(1), 1, 300).suggested_reorder_qty).toBe(140); // 10/day x 14
    expect(analyzeProduct(p(0), 50, 0).suggested_reorder_qty).toBe(1);
  });
});

describe('riskiest', () => {
  it('orders by urgency then days of supply and keeps at most the limit', () => {
    const items = [
      { id: 'h', urgency: 'HEALTHY' as const, days_of_inventory: null },
      { id: 'w2', urgency: 'WARNING' as const, days_of_inventory: 8 },
      { id: 'c', urgency: 'CRITICAL' as const, days_of_inventory: 0 },
      { id: 'w1', urgency: 'WARNING' as const, days_of_inventory: 2 },
    ];
    expect(riskiest(items).map((i) => i.id)).toEqual(['c', 'w1', 'w2', 'h']);
    expect(riskiest(items, 2).map((i) => i.id)).toEqual(['c', 'w1']);
    const many = Array.from({ length: PROMPT_MAX_ITEMS + 25 }, (_, n) => ({ urgency: 'HEALTHY' as const, days_of_inventory: n }));
    expect(riskiest(many)).toHaveLength(PROMPT_MAX_ITEMS);
  });
});

describe('loadWarehouse', () => {
  let db: FakePostgrest;
  beforeEach(() => {
    db = createDb();
    clearAuthCache();
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns only the caller\'s rows', async () => {
    db.insert('products', { owner_id: 1, sku: 'A', name: 'A', cost_price: 1, sell_price: 2, min_stock_level: 0 });
    db.insert('products', { owner_id: 2, sku: 'B', name: 'B', cost_price: 1, sell_price: 2, min_stock_level: 0 });
    const data = await loadWarehouse(1, NOW);
    expect(data.products.map((r) => r.sku)).toEqual(['A']);
    expect(data.limits).toEqual({ productsTruncated: false, inventoryTruncated: false, outboundTruncated: false });
  });

  it('throws DataUnavailableError when a table cannot be read, instead of pretending the warehouse is empty', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const real = global.fetch;
    vi.spyOn(global, 'fetch').mockImplementation(async (input: any, init?: any) => {
      if (String(input).includes('/rest/v1/inventory')) return new Response('boom', { status: 500 });
      return real(input, init);
    });
    await expect(loadWarehouse(1, NOW)).rejects.toBeInstanceOf(DataUnavailableError);
  });
});

describe('fetchWithTimeout', () => {
  afterEach(() => vi.restoreAllMocks());

  it('aborts a call that does not answer in time', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      (_url: any, init: any) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason));
        })
    );
    const started = Date.now();
    await expect(fetchWithTimeout('https://slow.example.test', {}, 30)).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('passes the request through when the answer is in time', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('ok'));
    const res = await fetchWithTimeout('https://fast.example.test', { method: 'POST' }, 1000);
    expect(await res.text()).toBe('ok');
  });
});
