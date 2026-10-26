import { describe, expect, it } from 'vitest';
import { EMPTY_PRODUCT_FORM, productFormToChanges, productToForm } from '@/lib/productForm';

const valid = { ...EMPTY_PRODUCT_FORM, sku: 'G-1', name: 'Gizmo', cost_price: '5', sell_price: '9.5', min_stock_level: '3' };

describe('productFormToChanges', () => {
  it('a new product sends every field', () => {
    const { errors, changes } = productFormToChanges(valid);
    expect(errors).toEqual({});
    expect(changes).toMatchObject({ sku: 'G-1', name: 'Gizmo', cost_price: 5, sell_price: 9.5, min_stock_level: 3, unit: 'pcs' });
  });

  it('an edit that only renames sends only the name (U5: the prices are not touched)', () => {
    const original = productToForm({ sku: 'G-1', name: 'Gizmo', category: null, barcode: null, supplier: null, unit: 'pcs', cost_price: '5.00', sell_price: 9.5, min_stock_level: 3 });
    const { errors, changes } = productFormToChanges({ ...original, name: 'Gizmo Pro' }, original);
    expect(errors).toEqual({});
    expect(changes).toEqual({ name: 'Gizmo Pro' });
  });

  it('a price shown as 5.00 and kept as typed is not a change', () => {
    const original = productToForm({ sku: 'A', name: 'A', category: null, barcode: null, supplier: null, unit: 'pcs', cost_price: '5.00', sell_price: '9.00', min_stock_level: 0 });
    expect(productFormToChanges(original, original).changes).toEqual({});
  });

  it('explains what is wrong, per field', () => {
    const { errors } = productFormToChanges({ ...valid, sku: ' ', name: '', cost_price: '', sell_price: '-1', min_stock_level: '1.5' });
    expect(Object.keys(errors).sort()).toEqual(['cost_price', 'min_stock_level', 'name', 'sell_price', 'sku']);
  });

  it('refuses a selling price below the cost price', () => {
    expect(productFormToChanges({ ...valid, cost_price: '10', sell_price: '9.99' }).errors.sell_price).toContain('cannot be below');
  });

  it('rounds money to cents', () => {
    expect(productFormToChanges({ ...valid, sell_price: '9.999' }).changes.sell_price).toBe(10);
  });
});
