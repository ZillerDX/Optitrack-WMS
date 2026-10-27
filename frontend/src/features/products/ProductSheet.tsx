'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { FormNotice, TextField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EMPTY_PRODUCT_FORM, productFormToChanges, productToForm, type ProductFormValues } from '@/lib/productForm';
import { useCategories, useSaveProduct, type Product } from './api';

/** Create or edit one product. Prices are in US dollars, the currency they are stored in (Settings only changes how they are shown). */
export function ProductSheet({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSaved: (message: string) => void;
}) {
  const original = useMemo(() => (product ? productToForm(product) : undefined), [product]);
  const [values, setValues] = useState<ProductFormValues>(EMPTY_PRODUCT_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const categories = useCategories();
  const save = useSaveProduct();

  useEffect(() => {
    if (!open) return;
    setValues(original ?? EMPTY_PRODUCT_FORM);
    setShowErrors(false);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, original]);

  const result = productFormToChanges(values, original);
  const nothingChanged = Boolean(original) && Object.keys(result.changes).length === 0 && Object.keys(result.errors).length === 0;
  const err = (key: keyof ProductFormValues) => (showErrors ? result.errors[key] ?? null : null);
  const set = (key: keyof ProductFormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (Object.keys(result.errors).length > 0) {
      setShowErrors(true);
      return;
    }
    save.mutate(
      { id: product?.id, changes: result.changes },
      {
        onSuccess: () => {
          onSaved(product ? `Saved ${values.name.trim()}.` : `Added ${values.name.trim()}. Receive some on the Stock page.`);
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={product ? 'Edit product' : 'Add product'} description={product ? `SKU ${product.sku}` : 'Stock is added afterwards, on the Stock page.'}>
      <form id="product-form" onSubmit={submit} className="space-y-4" noValidate>
        {save.error && <FormNotice tone="error">{save.error.message}</FormNotice>}
        <TextField id="product-name" label="Name" maxLength={255} value={values.name} onChange={set('name')} error={err('name')} disabled={save.isPending} />
        <div className="grid grid-cols-2 gap-3">
          <TextField id="product-sku" label="SKU" maxLength={100} value={values.sku} onChange={set('sku')} error={err('sku')} disabled={save.isPending} />
          <TextField id="product-unit" label="Unit" maxLength={50} value={values.unit} onChange={set('unit')} error={err('unit')} disabled={save.isPending} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField id="product-cost" label="Cost price (USD)" type="number" inputMode="decimal" min={0} step="0.01" value={values.cost_price} onChange={set('cost_price')} error={err('cost_price')} disabled={save.isPending} />
          <TextField id="product-sell" label="Selling price (USD)" type="number" inputMode="decimal" min={0} step="0.01" value={values.sell_price} onChange={set('sell_price')} error={err('sell_price')} disabled={save.isPending} />
        </div>
        <TextField
          id="product-min"
          label="Minimum stock"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={values.min_stock_level}
          onChange={set('min_stock_level')}
          error={err('min_stock_level')}
          hint="Stock below this is flagged as below minimum."
          disabled={save.isPending}
        />
        <div className="space-y-1.5">
          <label htmlFor="product-category" className="text-sm font-medium">
            Category (optional)
          </label>
          <Select
            id="product-category"
            size="lg"
            value={values.category}
            onChange={(category) => setValues((v) => ({ ...v, category }))}
            disabled={save.isPending}
            options={[
              { value: '', label: 'No category' },
              ...(values.category && !categories.data?.some((c) => c.name === values.category) ? [{ value: values.category, label: values.category }] : []),
              ...(categories.data ?? []).map((c) => ({ value: c.name, label: c.name })),
            ]}
          />
        </div>
        <TextField id="product-barcode" label="Barcode (optional)" maxLength={100} value={values.barcode} onChange={set('barcode')} disabled={save.isPending} />
        <TextField id="product-supplier" label="Supplier (optional)" maxLength={255} value={values.supplier} onChange={set('supplier')} disabled={save.isPending} />
      </form>
      <div className="mt-6">
        <Button type="submit" form="product-form" size="lg" className="h-11 w-full text-[15px] font-semibold" disabled={save.isPending || nothingChanged}>
          {save.isPending ? 'Saving...' : product ? 'Save changes' : 'Add product'}
        </Button>
      </div>
    </Sheet>
  );
}
