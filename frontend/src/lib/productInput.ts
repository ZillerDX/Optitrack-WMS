export interface ProductFields {
  sku: string;
  name: string;
  category: string | null;
  barcode: string | null;
  supplier: string | null;
  cost_price: number;
  sell_price: number;
  min_stock_level: number;
  unit: string;
  image_url: string | null;
}

export type ProductInput =
  | { ok: true; data: Partial<ProductFields> }
  | { ok: false; detail: string };

const fail = (detail: string): ProductInput => ({ ok: false, detail });

function text(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) return undefined;
  return value.trim();
}

function money(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 99_999_999) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Validate a product body. Only known columns are ever returned, so a client cannot
 * set anything else (owner_id, id, ...). With `partial` (updates) missing fields are
 * simply left out; without it (create) sku, name and both prices are required.
 *
 * The rule `sell_price >= cost_price` is checked here when both are present; callers
 * updating only one of the two must compare against the stored value themselves.
 */
export function parseProductInput(body: unknown, opts: { partial: boolean }): ProductInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: Partial<ProductFields> = {};

  if (b.sku !== undefined || !opts.partial) {
    const sku = text(b.sku, 100);
    if (!sku) return fail('sku is required (max 100 characters)');
    data.sku = sku;
  }
  if (b.name !== undefined || !opts.partial) {
    const name = text(b.name, 255);
    if (!name) return fail('name is required (max 255 characters)');
    data.name = name;
  }
  for (const [key, max] of [['category', 100], ['barcode', 100], ['supplier', 255]] as const) {
    if (b[key] === undefined) continue;
    const v = text(b[key], max);
    if (v === undefined) return fail(`${key} must be text of at most ${max} characters`);
    data[key] = v;
  }
  if (b.unit !== undefined || !opts.partial) {
    const unit = text(b.unit ?? 'pcs', 50);
    if (!unit) return fail('unit must be 1-50 characters');
    data.unit = unit;
  }
  for (const key of ['cost_price', 'sell_price'] as const) {
    if (b[key] === undefined && opts.partial) continue;
    const v = money(b[key]);
    if (v === null) return fail(`${key} must be a number between 0 and 99999999`);
    data[key] = v;
  }
  if (b.min_stock_level !== undefined) {
    const n = Number(b.min_stock_level);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return fail('min_stock_level must be a non-negative integer');
    data.min_stock_level = n;
  } else if (!opts.partial) {
    data.min_stock_level = 0;
  }
  if (b.image_url !== undefined) {
    const v = text(b.image_url, 500);
    if (v === undefined || (v !== null && !/^https:\/\/\S+$/.test(v))) {
      return fail('image_url must be an https URL of at most 500 characters');
    }
    data.image_url = v;
  }

  if (data.cost_price !== undefined && data.sell_price !== undefined && data.sell_price < data.cost_price) {
    return fail(`sell_price (${data.sell_price}) must be >= cost_price (${data.cost_price})`);
  }
  return { ok: true, data };
}
