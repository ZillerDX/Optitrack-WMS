'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/app/PageHeader';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Meter } from '@/components/ui/meter';
import { SegmentedControl } from '@/components/ui/segmented';
import { CategoryChart, MovementChart } from '@/features/dashboard/Charts';
import { useDashboard } from '@/features/dashboard/api';
import { useAllProducts } from '@/features/products/api';
import { useLocations, useStock } from '@/features/stock/api';
import { formatNumber } from '@/lib/format';
import { reorderList } from '@/lib/reorder';
import { cn } from '@/lib/utils';

type Range = '7' | '30' | '90';

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'warning' | 'danger' }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-[28px] font-bold leading-tight tabular-nums tracking-[-0.01em]', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-danger')}>{value}</p>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
    </Card>
  );
}

function StatusBar({ healthy, low, out }: { healthy: number; low: number; out: number }) {
  const total = healthy + low + out;
  if (total === 0) return null;
  const part = (n: number) => `${(n / total) * 100}%`;
  return (
    <div>
      <div role="img" aria-label={`${healthy} in stock, ${low} below minimum, ${out} out of stock`} className="flex h-3 overflow-hidden rounded-full bg-muted">
        <div className="bg-success" style={{ width: part(healthy) }} />
        <div className="bg-warning" style={{ width: part(low) }} />
        <div className="bg-danger" style={{ width: part(out) }} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
        {[
          ['In stock', healthy, 'bg-success'],
          ['Below minimum', low, 'bg-warning'],
          ['Out of stock', out, 'bg-danger'],
        ].map(([label, n, dot]) => (
          <div key={label as string}>
            <dt className="flex items-start gap-1.5 text-muted-foreground">
              <span aria-hidden="true" className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dot as string)} />
              {label}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{formatNumber(n as number)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function DashboardPage() {
  const { format, formatCompact } = useCurrency();
  const [range, setRange] = useState<Range>('30');
  const [location, setLocation] = useState('');
  const dash = useDashboard(Number(range), location);
  const locations = useLocations();
  const stock = useStock('ALL');
  const products = useAllProducts();
  const reorder = useMemo(() => reorderList(stock.data?.data ?? [], products.data ?? []), [stock.data, products.data]);
  const d = dash.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="How your warehouse is doing."
        actions={
          <>
            <div>
              <label htmlFor="dash-location" className="sr-only">
                Location
              </label>
              <select id="dash-location" value={location} onChange={(e) => setLocation(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">All locations</option>
                {locations.data?.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <SegmentedControl<Range>
              label="Period"
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
              ]}
            />
          </>
        }
      />

      {dash.isPending ? (
        <div role="status" className="space-y-4">
          <span className="sr-only">Loading the dashboard</span>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-[14px] bg-muted" />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-[14px] bg-muted" />
        </div>
      ) : dash.isError ? (
        <Card role="alert" className="p-6">
          <p className="font-semibold">The dashboard could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">{dash.error.message}</p>
          <Button type="button" className="mt-4" onClick={() => dash.refetch()}>
            Try again
          </Button>
        </Card>
      ) : d && d.totals.products === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-lg font-semibold">Nothing to show yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Add your products, then receive some stock. The figures and charts fill in as you work.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button asChild>
              <Link href="/products">Add products</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/inventory">Go to Stock</Link>
            </Button>
          </div>
        </Card>
      ) : (
        d && (
          <div className="space-y-4">
            <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile label="Units in stock" value={formatNumber(d.totals.units)} note={`${formatNumber(d.totals.products_with_stock)} of ${formatNumber(d.totals.products)} products have stock`} />
              <Tile label="Stock value" value={format(Number(d.totals.market_value))} note={`${format(Number(d.totals.cost_basis))} at cost`} />
              <Tile label="Below minimum" value={formatNumber(d.stock_status.low_stock)} tone={d.stock_status.low_stock > 0 ? 'warning' : undefined} note="Products to order soon" />
              <Tile label="Out of stock" value={formatNumber(d.stock_status.out_of_stock)} tone={d.stock_status.out_of_stock > 0 ? 'danger' : undefined} note="Products with none left" />
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Received and shipped</CardTitle>
                  <CardDescription>Units per day, last {d.window.days} days.</CardDescription>
                </CardHeader>
                <CardContent>
                  <MovementChart data={d.movement} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Needs ordering</CardTitle>
                  <CardDescription>Total stock of the product is below its minimum.</CardDescription>
                </CardHeader>
                <CardContent>
                  {stock.isPending || products.isPending ? (
                    <div className="h-24 animate-pulse rounded-lg bg-muted" role="status">
                      <span className="sr-only">Loading</span>
                    </div>
                  ) : reorder.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Every product is at or above its minimum.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {reorder.map((r) => (
                        <li key={r.productId} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{r.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(r.quantity)} of {formatNumber(r.minimum)} minimum
                            </p>
                          </div>
                          <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', r.out ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning')}>{r.out ? 'Out of stock' : `Short by ${formatNumber(r.shortage)}`}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Stock health</CardTitle>
                  <CardDescription>Products by status.</CardDescription>
                </CardHeader>
                <CardContent>
                  <StatusBar healthy={d.stock_status.healthy} low={d.stock_status.low_stock} out={d.stock_status.out_of_stock} />
                  {d.adjustments.count > 0 && (
                    <p className="mt-4 text-sm text-muted-foreground">
                      {formatNumber(d.adjustments.count)} adjustment{d.adjustments.count === 1 ? '' : 's'} in this period, net {d.adjustments.net_units > 0 ? '+' : ''}
                      {formatNumber(d.adjustments.net_units)} units.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Value by category</CardTitle>
                  <CardDescription>At selling price.</CardDescription>
                </CardHeader>
                <CardContent>{d.by_category.length === 0 ? <p className="text-sm text-muted-foreground">No stock to value yet.</p> : <CategoryChart data={d.by_category} formatMoney={format} formatCompact={formatCompact} />}</CardContent>
              </Card>

              <Card className="lg:col-span-2 xl:col-span-1">
                <CardHeader>
                  <CardTitle>Locations</CardTitle>
                  <CardDescription>How full each one is.</CardDescription>
                </CardHeader>
                <CardContent>
                  {d.locations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No locations yet.</p>
                  ) : (
                    <ul className="space-y-4">
                      {d.locations.map((l) => (
                        <li key={l.name}>
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="truncate font-semibold">{l.name}</span>
                            <span className={cn('shrink-0 tabular-nums', l.over ? 'font-semibold text-danger' : 'text-muted-foreground')}>
                              {formatNumber(l.used)} of {formatNumber(l.capacity)}
                            </span>
                          </div>
                          <Meter className="mt-1.5" value={l.used} max={l.capacity} label={`${l.name} is ${formatNumber(l.used)} of ${formatNumber(l.capacity)} full`} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            {d.top_movers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Top shipped</CardTitle>
                  <CardDescription>Most units shipped in the last {d.window.days} days.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="divide-y divide-border">
                    {d.top_movers.map((m, i) => (
                      <li key={m.product_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="mr-3 inline-block w-4 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                          <span className="font-semibold">{m.name}</span> <span className="text-muted-foreground">SKU {m.sku}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{formatNumber(m.units)} {m.units === 1 ? 'unit' : 'units'}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}
          </div>
        )
      )}
    </>
  );
}
