'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormNotice } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/segmented';
import { EMPTY_FILTERS, HISTORY_PAGE_SIZE, fetchAllMatching, useHistory, type HistoryFilters, type Movement } from '@/features/history/api';
import { TourTarget } from '@/features/tour/TourTarget';
import { ProductPicker } from '@/features/stock/MovementSheet';
import { useLocations, type ProductOption } from '@/features/stock/api';
import { toCsv } from '@/lib/csv';
import { formatDateTime, formatNumber } from '@/lib/format';
import { MOVEMENT_LABELS, describeMovement, type MovementType } from '@/lib/labels';
import { cn } from '@/lib/utils';

type TypeFilter = MovementType | 'ALL';

const TYPE_TONE: Record<MovementType, string> = {
  INBOUND: 'bg-success-bg text-success',
  OUTBOUND: 'bg-muted text-foreground',
  ADJUST: 'bg-warning-bg text-warning',
};

function userName(m: Movement): string {
  return `${m.user?.first_name ?? ''} ${m.user?.last_name ?? ''}`.trim();
}

function csvRows(rows: Movement[]) {
  return rows.map((m) => [
    formatDateTime(m.created_at),
    m.created_at,
    MOVEMENT_LABELS[m.type]?.done ?? m.type,
    m.product?.name,
    m.product?.sku,
    m.location,
    describeMovement(m).text,
    m.stock_after,
    m.ref_code,
    m.notes,
    userName(m),
  ]);
}

const CSV_HEADER = ['Date (local)', 'Date (UTC)', 'Movement', 'Product', 'SKU', 'Location', 'Change', 'Stock after', 'Reference', 'Note', 'By'];

export default function HistoryPage() {
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_FILTERS);
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [choosingProduct, setChoosingProduct] = useState(false);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const history = useHistory(filters, page);
  const locations = useLocations();
  const rows = history.data?.data ?? [];
  const total = history.data?.total ?? rows.length;
  const from = total === 0 ? 0 : page * HISTORY_PAGE_SIZE + 1;
  const to = page * HISTORY_PAGE_SIZE + rows.length;
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const change = (patch: Partial<HistoryFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };

  const exportCsv = async () => {
    setExporting(true);
    setExportMessage(null);
    try {
      const { rows: all, complete } = await fetchAllMatching(filters);
      const blob = new Blob([toCsv(CSV_HEADER, csvRows(all))], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `history-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportMessage({ tone: 'success', text: complete ? `Exported ${formatNumber(all.length)} rows.` : `Exported the newest ${formatNumber(all.length)} rows. Narrow the dates to get the rest.` });
    } catch (error) {
      setExportMessage({ tone: 'error', text: error instanceof Error ? error.message : 'The export failed.' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="History"
        description="Every movement of stock, newest first."
        actions={
          <TourTarget steps={['history']}>
            <Button type="button" variant="outline" onClick={exportCsv} disabled={exporting || total === 0}>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </TourTarget>
        }
      />

      {exportMessage && (
        <div className="mb-4">
          <FormNotice tone={exportMessage.tone}>{exportMessage.text}</FormNotice>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex flex-wrap items-end gap-3">
            <SegmentedControl<TypeFilter>
              label="Movement"
              value={filters.type || 'ALL'}
              onChange={(v) => change({ type: v === 'ALL' ? '' : v })}
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'INBOUND', label: 'Received' },
                { value: 'OUTBOUND', label: 'Shipped' },
                { value: 'ADJUST', label: 'Adjusted' },
              ]}
            />
            <div>
              <label htmlFor="history-from" className="mb-1 block text-xs font-medium text-muted-foreground">
                From
              </label>
              <input id="history-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => change({ from: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label htmlFor="history-to" className="mb-1 block text-xs font-medium text-muted-foreground">
                To
              </label>
              <input id="history-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => change({ to: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div>
              <label htmlFor="history-location" className="mb-1 block text-xs font-medium text-muted-foreground">
                Location
              </label>
              <select id="history-location" value={filters.location} onChange={(e) => change({ location: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">All locations</option>
                {locations.data?.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            {!choosingProduct && !product && (
              <Button type="button" variant="outline" onClick={() => setChoosingProduct(true)}>
                Filter by product
              </Button>
            )}
            {filtered && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setProduct(null);
                  setChoosingProduct(false);
                  setPage(0);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
          {(choosingProduct || product) && (
            <div className="max-w-md">
              <ProductPicker
                value={product}
                onChange={(p) => {
                  setProduct(p);
                  if (!p) setChoosingProduct(false);
                  change({ productId: p?.id ?? null });
                }}
              />
            </div>
          )}
        </div>

        {history.isPending ? (
          <div role="status" className="space-y-2 p-4">
            <span className="sr-only">Loading history</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : history.isError ? (
          <div role="alert" className="p-6">
            <p className="font-semibold">History could not be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">{history.error.message}</p>
            <Button type="button" className="mt-4" onClick={() => history.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold">{filtered ? 'No movement matches' : 'No movements yet'}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{filtered ? 'Widen the dates or clear the filters.' : 'Receive stock on the Stock page and it appears here.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Stock movements</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    When
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Movement
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Product
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Location
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Change
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Stock after
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const d = describeMovement(m);
                  return (
                    <tr key={m.id} className="border-b border-border last:border-b-0 hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-3">
                        <div>{formatDateTime(m.created_at)}</div>
                        <div className="text-xs text-muted-foreground">{m.ref_code}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TYPE_TONE[m.type] ?? 'bg-muted')}>{d.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{m.product?.name ?? 'Deleted product'}</div>
                        {m.product && <div className="text-xs text-muted-foreground">SKU {m.product.sku}</div>}
                      </td>
                      <td className="px-4 py-3">{m.location ?? '-'}</td>
                      <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', d.delta !== null && d.delta > 0 && 'text-success')}>{d.text}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{m.stock_after === null ? '-' : formatNumber(m.stock_after)}</td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-muted-foreground" title={m.notes ?? undefined}>
                        {m.notes ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {formatNumber(from)}-{formatNumber(to)} of {formatNumber(total)}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={to >= total} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </nav>
        )}
      </Card>
    </>
  );
}
