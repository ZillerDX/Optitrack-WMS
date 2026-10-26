import { describe, expect, it } from 'vitest';
import { reorderList, type StockLine } from '@/lib/reorder';

const line = (product_id: number, name: string, quantity: number, min: number): StockLine => ({ product_id, quantity, product: { id: product_id, name, sku: `S${product_id}`, min_stock_level: min } });

const catalogue = (rows: StockLine[]) => [...new Map(rows.map((r) => [r.product_id, r.product])).values()];

describe('reorderList', () => {
  it('adds the product up over its locations before judging it', () => {
    // 3 + 4 = 7 is enough for a minimum of 6, although each location alone is below it
    const rows = [line(1, 'A', 3, 6), line(1, 'A', 4, 6)];
    expect(reorderList(rows, catalogue(rows))).toEqual([]);
  });

  it('exactly at the minimum is fine, one below needs ordering', () => {
    const at = [line(1, 'A', 5, 5)];
    const below = [line(1, 'A', 4, 5)];
    expect(reorderList(at, catalogue(at))).toEqual([]);
    expect(reorderList(below, catalogue(below))[0]).toMatchObject({ shortage: 1, out: false });
  });

  it('lists empty products first, then the biggest shortage', () => {
    const rows = [line(1, 'Small gap', 8, 10), line(2, 'Big gap', 1, 50), line(3, 'Empty', 0, 4)];
    const list = reorderList(rows, catalogue(rows));
    expect(list.map((i) => i.name)).toEqual(['Empty', 'Big gap', 'Small gap']);
    expect(list[0].out).toBe(true);
  });

  it('keeps at most the limit', () => {
    const rows = Array.from({ length: 12 }, (_, i) => line(i + 1, `P${i}`, 0, 5));
    expect(reorderList(rows, catalogue(rows), 8)).toHaveLength(8);
  });

  it('counts a product that never had a stock row as out of stock', () => {
    const list = reorderList([], [{ id: 9, name: 'Never received', sku: 'N', min_stock_level: 3 }]);
    expect(list).toEqual([expect.objectContaining({ name: 'Never received', out: true, shortage: 3 })]);
  });

  it('lists an empty product even when its minimum is 0 (it is out of stock)', () => {
    // 0 is not below 0, but it is out of stock: the dashboard counts it as out of stock, so it is listed too
    expect(reorderList([], [{ id: 1, name: 'Zero min', sku: 'Z', min_stock_level: 0 }])).toHaveLength(1);
  });
});
