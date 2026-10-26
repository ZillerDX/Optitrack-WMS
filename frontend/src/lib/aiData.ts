import { supabaseRest } from '@/lib/supabase';

/**
 * Shared warehouse numbers for the AI endpoints (chat, predictive reorder, report). They used to load
 * data and compute velocity and urgency separately, so the three screens disagreed: velocity came from
 * the last 25, 50 or 200 movements of any kind, the stock of a product from one location only, and the
 * minimum stock defaulted to 5 or 10 (an explicit 0 became 5 or 10). A read that failed was treated as
 * "no data", which made every product look depleted.
 */

export const VELOCITY_WINDOW_DAYS = 30;
/** Used only when a product has no minimum at all; an explicit 0 stays 0. */
export const DEFAULT_MIN_STOCK = 5;
/** Safety cap on rows read per table; reaching it is reported in `limits`. */
export const MAX_PRODUCTS = 1000;
export const MAX_INVENTORY_ROWS = 5000;
export const MAX_OUTBOUND_ROWS = 5000;
/** How many products go into an LLM prompt (the riskiest first); the prompt must stay bounded. */
export const PROMPT_MAX_ITEMS = 40;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A table the AI endpoints depend on could not be read. Callers answer 503, never "empty warehouse". */
export class DataUnavailableError extends Error {
  constructor(what: string) {
    super(`Could not read ${what}`);
    this.name = 'DataUnavailableError';
  }
}

export interface WarehouseData {
  products: any[];
  inventory: any[];
  /** OUTBOUND movements of the last 30 days (id, product_id, quantity, created_at only). */
  outbound: any[];
  locations: any[];
  categories: any[];
  /** The 25 most recent movements of any type, with their product. */
  recent: any[];
  limits: { outboundTruncated: boolean; inventoryTruncated: boolean; productsTruncated: boolean };
}

async function rows(res: Response, what: string): Promise<any[]> {
  if (!res.ok) {
    console.error(`[AI data] ${what} failed with status ${res.status}`);
    throw new DataUnavailableError(what);
  }
  const body = await res.json().catch(() => null);
  if (!Array.isArray(body)) {
    console.error(`[AI data] ${what} did not return a list`);
    throw new DataUnavailableError(what);
  }
  return body;
}

/** Everything the AI endpoints need for `userId`, or a `DataUnavailableError`. */
export async function loadWarehouse(userId: number, now: Date = new Date()): Promise<WarehouseData> {
  const since = encodeURIComponent(new Date(now.getTime() - VELOCITY_WINDOW_DAYS * DAY_MS).toISOString());
  const [p, i, o, l, c, t] = await Promise.all([
    supabaseRest(`products?owner_id=eq.${userId}&deleted_at=is.null&select=*&order=id.desc&limit=${MAX_PRODUCTS}`),
    supabaseRest(`inventory?select=*,product:products!inner(*)&product.owner_id=eq.${userId}&order=id.desc&limit=${MAX_INVENTORY_ROWS}`),
    supabaseRest(
      `transactions?user_id=eq.${userId}&type=eq.OUTBOUND&created_at=gte.${since}&select=id,product_id,quantity,created_at&order=created_at.desc&limit=${MAX_OUTBOUND_ROWS}`
    ),
    supabaseRest(`locations?owner_id=eq.${userId}&select=*`),
    supabaseRest(`categories?owner_id=eq.${userId}&select=*`),
    supabaseRest(`transactions?user_id=eq.${userId}&select=*,product:products(*)&order=created_at.desc&limit=25`),
  ]);
  const data = {
    products: await rows(p, 'products'),
    inventory: await rows(i, 'inventory'),
    outbound: await rows(o, 'outbound movements'),
    locations: await rows(l, 'locations'),
    categories: await rows(c, 'categories'),
    recent: await rows(t, 'recent movements'),
  };
  const limits = {
    productsTruncated: data.products.length >= MAX_PRODUCTS,
    inventoryTruncated: data.inventory.length >= MAX_INVENTORY_ROWS,
    outboundTruncated: data.outbound.length >= MAX_OUTBOUND_ROWS,
  };
  if (limits.outboundTruncated || limits.inventoryTruncated || limits.productsTruncated) {
    console.warn('[AI data] a table reached its row cap; figures are partial', limits);
  }
  return { ...data, limits };
}

/** The product's minimum stock: its own number (0 included), or the default when it has none. */
export function minStockLevel(product: { min_stock_level?: unknown } | null | undefined): number {
  const v = product?.min_stock_level;
  if (v === null || v === undefined || v === '') return DEFAULT_MIN_STOCK;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MIN_STOCK;
}

/** Units on hand per product, summed over ALL its locations. */
export function stockByProduct(inventory: any[]): Map<number, { quantity: number; locations: string[] }> {
  const map = new Map<number, { quantity: number; locations: string[] }>();
  for (const row of inventory) {
    const entry = map.get(row.product_id) ?? { quantity: 0, locations: [] };
    entry.quantity += Number(row.quantity) || 0;
    if (row.location && !entry.locations.includes(row.location)) entry.locations.push(row.location);
    map.set(row.product_id, entry);
  }
  return map;
}

/** Units shipped per product in the velocity window. Rows outside the window are ignored. */
export function unitsSoldByProduct(outbound: any[], now: Date = new Date()): Map<number, number> {
  const from = now.getTime() - VELOCITY_WINDOW_DAYS * DAY_MS;
  const map = new Map<number, number>();
  for (const tx of outbound) {
    const at = tx.created_at ? new Date(tx.created_at).getTime() : NaN;
    if (!(at >= from)) continue; // also drops rows without a usable date
    map.set(tx.product_id, (map.get(tx.product_id) ?? 0) + Math.abs(Number(tx.quantity) || 0));
  }
  return map;
}

export type Urgency = 'CRITICAL' | 'WARNING' | 'HEALTHY';

export interface ProductAnalysis {
  current_stock: number;
  min_stock_level: number;
  units_sold_30d: number;
  daily_burn_rate: number;
  /** null when nothing was shipped in the window (no basis for a forecast). */
  days_of_inventory: number | null;
  urgency: Urgency;
  suggested_reorder_qty: number;
}

/**
 * One rule for every screen. Below safety stock means `stock < minimum`, like the database status
 * (LOW_STOCK) and the stock endpoints; at the minimum is still fine.
 *   CRITICAL: nothing on hand, or at most 3 days of supply
 *   WARNING : below the minimum, or at most 10 days of supply
 */
export function analyzeProduct(product: any, stock: number, unitsSold30d: number): ProductAnalysis {
  const min = minStockLevel(product);
  const daily = Number((unitsSold30d / VELOCITY_WINDOW_DAYS).toFixed(2));
  const doi = stock <= 0 ? 0 : daily > 0 ? Math.round(stock / daily) : null;

  let urgency: Urgency = 'HEALTHY';
  if (stock <= 0 || (doi !== null && doi <= 3)) urgency = 'CRITICAL';
  else if (stock < min || (doi !== null && doi <= 10)) urgency = 'WARNING';

  return {
    current_stock: stock,
    min_stock_level: min,
    units_sold_30d: unitsSold30d,
    daily_burn_rate: daily,
    days_of_inventory: doi,
    urgency,
    suggested_reorder_qty: Math.max(1, Math.max(min * 2 - stock, Math.ceil(daily * 14))),
  };
}

const RANK: Record<Urgency, number> = { CRITICAL: 0, WARNING: 1, HEALTHY: 2 };

/** The riskiest `limit` items first (urgency, then least days of supply), for bounded prompts. */
export function riskiest<T extends { urgency: Urgency; days_of_inventory: number | null }>(items: T[], limit = PROMPT_MAX_ITEMS): T[] {
  return [...items]
    .sort((a, b) => RANK[a.urgency] - RANK[b.urgency] || (a.days_of_inventory ?? Infinity) - (b.days_of_inventory ?? Infinity))
    .slice(0, limit);
}
