'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Meter } from '@/components/ui/meter';
import { SegmentedControl } from '@/components/ui/segmented';
import { StatusBadge } from '@/components/ui/status-badge';
import { LocationsSheet } from '@/features/stock/LocationsSheet';
import { MovementSheet, type MovementDone, type MovementPreset } from '@/features/stock/MovementSheet';
import { useLocations, useStock, type StockRow } from '@/features/stock/api';
import { formatNumber } from '@/lib/format';
import { describeDone } from '@/lib/movement';
import { inventoryStatus } from '@/lib/stockStatus';
import { cn } from '@/lib/utils';

type StatusFilter = 'ALL' | 'ATTENTION';

function rowPreset(row: StockRow, type: 'INBOUND' | 'OUTBOUND' | 'ADJUST'): MovementPreset {
  const { id, name, sku, min_stock_level } = row.product;
  return { type, location: row.location, product: { id, name, sku, min_stock_level } };
}

export default function StockPage() {
  const stock = useStock('ALL');
  const locations = useLocations();
  const [location, setLocation] = useState('ALL');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [movement, setMovement] = useState<{ open: boolean; preset?: MovementPreset }>({ open: false });
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [done, setDone] = useState<MovementDone | null>(null);

  const rows = useMemo(() => stock.data?.data ?? [], [stock.data]);

  const usage = useMemo(() => {
    const used: Record<string, number> = {};
    for (const r of rows) used[r.location] = (used[r.location] ?? 0) + r.quantity;
    return used;
  }, [rows]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (location !== 'ALL' && r.location !== location) return false;
      if (statusFilter === 'ATTENTION' && inventoryStatus(r.quantity, r.product.min_stock_level) === 'IN_STOCK') return false;
      return !term || r.product.name.toLowerCase().includes(term) || r.product.sku.toLowerCase().includes(term);
    });
  }, [rows, location, search, statusFilter]);

  const attention = rows.filter((r) => inventoryStatus(r.quantity, r.product.min_stock_level) !== 'IN_STOCK').length;
  const openMovement = (preset?: MovementPreset) => setMovement({ open: true, preset });

  return (
    <>
      <PageHeader
        title="Stock"
        description="What you have, where it is, and what needs attention."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setLocationsOpen(true)}>
              Locations
            </Button>
            <Button type="button" onClick={() => openMovement()}>
              Record movement
            </Button>
          </>
        }
      />

      {done && (
        <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-success/30 bg-success-bg px-4 py-2.5 text-sm text-success">
          <span>{describeDone(done)}</span>
          <button type="button" onClick={() => setDone(null)} className="rounded-md px-2 py-0.5 font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Dismiss
          </button>
        </div>
      )}

      {locations.data && locations.data.length > 0 && (
        <section aria-label="Locations" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {locations.data.map((l) => {
            const used = usage[l.name] ?? 0;
            const selected = location === l.name;
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setLocation(selected ? 'ALL' : l.name)}
                className={cn(
                  'rounded-[14px] border bg-card p-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'border-primary ring-1 ring-primary' : 'border-border'
                )}
              >
                <span className="block truncate text-sm font-semibold">{l.name}</span>
                <Meter className="mt-3" value={used} max={l.capacity} label={`${l.name} is ${formatNumber(used)} of ${formatNumber(l.capacity)} full`} />
                <span className="mt-2 block text-xs text-muted-foreground">
                  {formatNumber(used)} of {formatNumber(l.capacity)} units
                </span>
              </button>
            );
          })}
        </section>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="stock-search" className="sr-only">
              Search stock
            </label>
            <Input id="stock-search" type="search" placeholder="Search product or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10" />
          </div>
          <SegmentedControl<StatusFilter>
            label="Show"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'ATTENTION', label: `Needs attention${attention ? ` (${attention})` : ''}` },
            ]}
          />
        </div>

        {stock.isPending ? (
          <div role="status" className="space-y-2 p-4">
            <span className="sr-only">Loading stock</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : stock.isError ? (
          <div role="alert" className="p-6">
            <p className="font-semibold">Stock could not be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">{stock.error.message}</p>
            <Button type="button" className="mt-4" onClick={() => stock.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold">No stock yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Add a product on the Products page, then receive some of it here.</p>
            <Button type="button" className="mt-4" onClick={() => openMovement()}>
              Record movement
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Nothing matches. Clear the search or the filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Stock by product and location</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Product
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Location
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Quantity
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Minimum
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{r.product.name}</div>
                      <div className="text-xs text-muted-foreground">SKU {r.product.sku}</div>
                    </td>
                    <td className="px-4 py-3">{r.location}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatNumber(r.quantity)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatNumber(r.product.min_stock_level)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge quantity={r.quantity} minimum={r.product.min_stock_level} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => openMovement(rowPreset(r, 'INBOUND'))} aria-label={`Receive ${r.product.name} at ${r.location}`}>
                          Receive
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => openMovement(rowPreset(r, 'OUTBOUND'))} aria-label={`Ship ${r.product.name} from ${r.location}`}>
                          Ship
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => openMovement(rowPreset(r, 'ADJUST'))} aria-label={`Adjust ${r.product.name} at ${r.location}`}>
                          Adjust
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {stock.data?.truncated && (
          <p role="status" className="border-t border-border px-4 py-3 text-sm text-warning">
            Showing the first {formatNumber(rows.length)} of {formatNumber(stock.data.total ?? rows.length)} rows. Pick a location to see the rest.
          </p>
        )}
      </Card>

      <MovementSheet open={movement.open} onOpenChange={(open) => setMovement((m) => ({ ...m, open }))} preset={movement.preset} onDone={setDone} />
      <LocationsSheet open={locationsOpen} onOpenChange={setLocationsOpen} usage={usage} />
    </>
  );
}
