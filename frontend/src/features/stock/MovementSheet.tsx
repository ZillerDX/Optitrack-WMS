'use client';

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { SegmentedControl } from '@/components/ui/segmented';
import { FormNotice, TextField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';
import { MOVEMENT_LABELS, type MovementType } from '@/lib/labels';
import { checkMovement } from '@/lib/movement';
import { useLocations, useProductOptions, useProductStock, useRecordMovement, type ProductOption } from './api';

export interface MovementPreset {
  type?: MovementType;
  product?: ProductOption;
  location?: string;
}

export interface MovementDone {
  type: MovementType;
  quantity: number;
  product: string;
  location: string;
}

const TYPES: MovementType[] = ['INBOUND', 'OUTBOUND', 'ADJUST'];

function ProductPicker({ value, onChange, disabled }: { value: ProductOption | null; onChange: (p: ProductOption | null) => void; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const options = useProductOptions(q.trim());
  const listId = useId();

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-muted/50 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{value.name}</p>
          <p className="text-xs text-muted-foreground">SKU {value.sku}</p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Change
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <TextField id="product-search" label="Product" placeholder="Search by name, SKU or barcode" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-controls={listId} />
      <ul id={listId} aria-label="Search results" className="max-h-52 overflow-y-auto rounded-[10px] border border-border">
        {options.isPending && <li className="px-3.5 py-3 text-sm text-muted-foreground">Loading...</li>}
        {options.isError && <li className="px-3.5 py-3 text-sm text-danger">{options.error.message}</li>}
        {options.data?.length === 0 && <li className="px-3.5 py-3 text-sm text-muted-foreground">No product matches. Add it on the Products page first.</li>}
        {options.data?.map((p) => (
          <li key={p.id} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => onChange(p)}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <span className="truncate text-sm font-medium">{p.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{p.sku}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One form for Receive, Ship and Adjust. It shows the stock now and after, and the server's own message if it refuses. */
export function MovementSheet({
  open,
  onOpenChange,
  preset,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset?: MovementPreset;
  onDone: (done: MovementDone) => void;
}) {
  const [type, setType] = useState<MovementType>('INBOUND');
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [location, setLocation] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const locations = useLocations();
  const stock = useProductStock(product?.id ?? null);
  const record = useRecordMovement();

  // every time the sheet opens it starts from the preset (or empty): nothing is kept from the last movement
  useEffect(() => {
    if (!open) return;
    setType(preset?.type ?? 'INBOUND');
    setProduct(preset?.product ?? null);
    setLocation(preset?.location ?? '');
    setQuantity('');
    setNotes('');
    record.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);

  // a single location needs no choice
  useEffect(() => {
    if (open && !location && locations.data?.length === 1) setLocation(locations.data[0].name);
  }, [open, location, locations.data]);

  const current = useMemo(() => stock.data?.find((r) => r.location === location)?.quantity ?? 0, [stock.data, location]);
  const typed = quantity.trim() === '' ? null : Number(quantity);
  const check = checkMovement(type, current, typed);
  const label = MOVEMENT_LABELS[type];
  const ready = product !== null && location !== '' && typed !== null && !check.error && !record.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || typed === null) return;
    record.mutate(
      { type, product_id: product.id, location, quantity: typed, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          onDone({ type, quantity: typed, product: product.name, location });
          onOpenChange(false);
        },
      }
    );
  };

  const submitLabel = record.isPending ? 'Saving...' : type === 'ADJUST' ? 'Set stock' : `${label.action}${typed ? ` ${formatNumber(typed)}` : ''}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Record a movement" description="Receive, ship or correct stock at one location.">
      <form id="movement-form" onSubmit={submit} className="space-y-5">
        <SegmentedControl<MovementType> label="Movement" value={type} onChange={setType} options={TYPES.map((t) => ({ value: t, label: MOVEMENT_LABELS[t].action }))} />

        <ProductPicker value={product} onChange={setProduct} disabled={record.isPending} />

        <div className="space-y-1.5">
          <label htmlFor="movement-location" className="text-sm font-medium">
            Location
          </label>
          <select
            id="movement-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
            disabled={record.isPending}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              Choose a location
            </option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {product && location && (
          <p className="text-sm text-muted-foreground" data-testid="stock-now">
            In stock here now: <strong className="font-semibold text-foreground">{stock.isPending ? '...' : formatNumber(current)}</strong>
          </p>
        )}

        <TextField
          id="movement-quantity"
          label={label.quantityLabel}
          type="number"
          inputMode="numeric"
          min={type === 'ADJUST' ? 0 : 1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={check.error}
          disabled={record.isPending}
          required
        />

        {check.after !== null && (
          <p className="rounded-[10px] bg-accent px-3.5 py-2.5 text-sm text-accent-foreground" data-testid="stock-after">
            Stock will be <strong className="font-semibold">{formatNumber(check.after)}</strong> after this.
          </p>
        )}

        <TextField id="movement-notes" label="Note (optional)" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={record.isPending} />

        {record.error && <FormNotice tone="error">{record.error.message}</FormNotice>}
      </form>
      <div className="mt-6">
        <Button type="submit" form="movement-form" size="lg" className="h-11 w-full text-[15px] font-semibold" disabled={!ready}>
          {submitLabel}
        </Button>
      </div>
    </Sheet>
  );
}
