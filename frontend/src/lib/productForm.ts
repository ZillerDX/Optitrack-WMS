/**
 * Turns what is typed in the product form into what is sent. Pure, so the rule that matters is testable:
 * an edit sends only the fields that changed (U5: a rename must never rewrite a price), a create sends all.
 */

export interface ProductFormValues {
  sku: string;
  name: string;
  category: string;
  barcode: string;
  supplier: string;
  unit: string;
  cost_price: string;
  sell_price: string;
  min_stock_level: string;
}

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  sku: '',
  name: '',
  category: '',
  barcode: '',
  supplier: '',
  unit: 'pcs',
  cost_price: '',
  sell_price: '',
  min_stock_level: '0',
};

export interface ProductFormResult {
  /** Field errors by field name; empty when the form can be sent. */
  errors: Partial<Record<keyof ProductFormValues, string>>;
  /** The body to send (only the changed fields when `original` is given). */
  changes: Record<string, string | number>;
}

const MONEY_MAX = 99_999_999;

function parseMoney(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MONEY_MAX) return null;
  return Math.round(n * 100) / 100;
}

export function productFormToChanges(values: ProductFormValues, original?: ProductFormValues): ProductFormResult {
  const errors: ProductFormResult['errors'] = {};
  const changes: ProductFormResult['changes'] = {};
  const changed = (key: keyof ProductFormValues) => !original || values[key].trim() !== original[key].trim();

  if (!values.sku.trim()) errors.sku = 'Enter a SKU.';
  if (!values.name.trim()) errors.name = 'Enter a name.';
  if (!values.unit.trim()) errors.unit = 'Enter a unit, for example pcs.';

  const cost = parseMoney(values.cost_price);
  const sell = parseMoney(values.sell_price);
  if (cost === null) errors.cost_price = 'Enter a price, 0 or more.';
  if (sell === null) errors.sell_price = 'Enter a price, 0 or more.';
  if (cost !== null && sell !== null && sell < cost) errors.sell_price = 'The selling price cannot be below the cost price.';

  const minimum = Number(values.min_stock_level);
  if (values.min_stock_level.trim() === '' || !Number.isInteger(minimum) || minimum < 0) errors.min_stock_level = 'Enter a whole number, 0 or more.';

  if (Object.keys(errors).length > 0) return { errors, changes };

  for (const key of ['sku', 'name', 'category', 'barcode', 'supplier', 'unit'] as const) {
    if (changed(key)) changes[key] = values[key].trim();
  }
  if (changed('cost_price')) changes.cost_price = cost as number;
  if (changed('sell_price')) changes.sell_price = sell as number;
  if (changed('min_stock_level')) changes.min_stock_level = minimum;
  return { errors, changes };
}

export function productToForm(p: {
  sku: string;
  name: string;
  category: string | null;
  barcode: string | null;
  supplier: string | null;
  unit: string | null;
  cost_price: number | string;
  sell_price: number | string;
  min_stock_level: number;
}): ProductFormValues {
  return {
    sku: p.sku,
    name: p.name,
    category: p.category ?? '',
    barcode: p.barcode ?? '',
    supplier: p.supplier ?? '',
    unit: p.unit ?? 'pcs',
    cost_price: String(p.cost_price),
    sell_price: String(p.sell_price),
    min_stock_level: String(p.min_stock_level),
  };
}
