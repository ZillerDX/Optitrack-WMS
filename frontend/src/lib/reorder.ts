import { inventoryStatus } from '@/lib/stockStatus';

export interface StockLine {
  product_id: number;
  quantity: number;
  product: { id: number; name: string; sku: string; min_stock_level: number };
}

export interface ProductLine {
  id: number;
  name: string;
  sku: string;
  min_stock_level: number;
}

export interface ReorderItem {
  productId: number;
  name: string;
  sku: string;
  quantity: number;
  minimum: number;
  /** Units missing to reach the minimum. */
  shortage: number;
  out: boolean;
}

/**
 * Products that need ordering: the total over every location is below the minimum (the same rule and the same
 * unit, the product, as the dashboard's status counts). Emptiest first, then the biggest shortage.
 */
export function reorderList(rows: StockLine[], products: ProductLine[], limit = 8): ReorderItem[] {
  const totals = new Map<number, ReorderItem>();
  // a product that never had a stock row has none: it counts as empty, like in the dashboard's figures
  for (const p of products) totals.set(p.id, { productId: p.id, name: p.name, sku: p.sku, quantity: 0, minimum: p.min_stock_level, shortage: 0, out: false });
  for (const r of rows) {
    const item = totals.get(r.product_id) ?? { productId: r.product_id, name: r.product.name, sku: r.product.sku, quantity: 0, minimum: r.product.min_stock_level, shortage: 0, out: false };
    item.quantity += r.quantity;
    totals.set(r.product_id, item);
  }
  const needing: ReorderItem[] = [];
  for (const item of totals.values()) {
    if (inventoryStatus(item.quantity, item.minimum) === 'IN_STOCK') continue;
    needing.push({ ...item, shortage: Math.max(0, item.minimum - item.quantity), out: item.quantity <= 0 });
  }
  needing.sort((a, b) => Number(b.out) - Number(a.out) || b.shortage - a.shortage || a.name.localeCompare(b.name));
  return needing.slice(0, limit);
}
