'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormNotice } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useCurrency } from '@/components/providers/CurrencyProvider';
import { PAGE_SIZE, useCategories, useDeleteProduct, useProducts, type Product } from '@/features/products/api';
import { ProductSheet } from '@/features/products/ProductSheet';
import { useStock } from '@/features/stock/api';
import { formatNumber } from '@/lib/format';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function DeleteSheet({ product, onClose, onDeleted, onHand }: { product: Product | null; onClose: () => void; onDeleted: (message: string) => void; onHand: number }) {
  const remove = useDeleteProduct();
  return (
    <Sheet open={product !== null} onOpenChange={(open) => !open && onClose()} title="Delete product" description={product ? `${product.name} (SKU ${product.sku})` : undefined}>
      {product && (
        <div className="space-y-4">
          <p className="text-sm">
            {onHand > 0
              ? `${formatNumber(onHand)} units are still in stock. Deleting writes them off: the history records an adjustment to 0 for each location.`
              : 'There is no stock of this product. It disappears from the lists; its history stays.'}
          </p>
          <p className="text-sm text-muted-foreground">The SKU becomes free to use again.</p>
          {remove.error && <FormNotice tone="error">{remove.error.message}</FormNotice>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(product.id, {
                  onSuccess: () => {
                    onDeleted(`Deleted ${product.name}.`);
                    onClose();
                  },
                })
              }
            >
              {remove.isPending ? 'Deleting...' : 'Delete product'}
            </Button>
            <Button type="button" variant="outline" disabled={remove.isPending} onClick={onClose}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default function ProductsPage() {
  const { format } = useCurrency();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const q = useDebounced(search.trim(), 300);

  // a new search or category starts from the first page
  useEffect(() => setPage(0), [q, category]);

  const products = useProducts({ q, category, page });
  const categories = useCategories();
  const stock = useStock('ALL');

  const [editing, setEditing] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null });
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onHand = useMemo(() => {
    const totals = new Map<number, number>();
    for (const r of stock.data?.data ?? []) totals.set(r.product_id, (totals.get(r.product_id) ?? 0) + r.quantity);
    return totals;
  }, [stock.data]);

  const rows = products.data?.data ?? [];
  const total = products.data?.total ?? rows.length;
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = page * PAGE_SIZE + rows.length;
  const filtered = q !== '' || category !== '';

  return (
    <>
      <PageHeader
        title="Products"
        description="What you sell or keep, with its prices and minimum stock."
        actions={
          <Button type="button" onClick={() => setEditing({ open: true, product: null })}>
            Add product
          </Button>
        }
      />

      {notice && (
        <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-success/30 bg-success-bg px-4 py-2.5 text-sm text-success">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="rounded-md px-2 py-0.5 font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Dismiss
          </button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="product-search" className="sr-only">
              Search products
            </label>
            <Input id="product-search" type="search" placeholder="Search name, SKU or barcode" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10" />
          </div>
          <div>
            <label htmlFor="product-category-filter" className="sr-only">
              Category
            </label>
            <select
              id="product-category-filter"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All categories</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {products.isPending ? (
          <div role="status" className="space-y-2 p-4">
            <span className="sr-only">Loading products</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : products.isError ? (
          <div role="alert" className="p-6">
            <p className="font-semibold">Products could not be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">{products.error.message}</p>
            <Button type="button" className="mt-4" onClick={() => products.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold">{filtered ? 'No product matches' : 'No products yet'}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{filtered ? 'Clear the search or the category.' : 'Add your first product, then receive stock for it.'}</p>
            {!filtered && (
              <Button type="button" className="mt-4" onClick={() => setEditing({ open: true, product: null })}>
                Add product
              </Button>
            )}
          </div>
        ) : (
          <>
          <ul className="divide-y divide-border sm:hidden" aria-label="Products">
            {rows.map((p) => (
              <li key={p.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      SKU {p.sku}
                      {p.category ? ` · ${p.category}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="block text-xl font-bold tabular-nums">{stock.isPending ? '...' : formatNumber(onHand.get(p.id) ?? 0)}</span>
                    <span className="text-xs text-muted-foreground">in stock</span>
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Cost {format(Number(p.cost_price))} · Price {format(Number(p.sell_price))} · Minimum {formatNumber(p.min_stock_level)}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing({ open: true, product: p })} aria-label={`Edit ${p.name}`}>
                    Edit
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Products</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Product
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Category
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Cost
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Price
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    In stock
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Minimum
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        SKU {p.sku}
                        {p.barcode ? ` · ${p.barcode}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category ?? '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{format(Number(p.cost_price))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{format(Number(p.sell_price))}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{stock.isPending ? '...' : formatNumber(onHand.get(p.id) ?? 0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatNumber(p.min_stock_level)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing({ open: true, product: p })} aria-label={`Edit ${p.name}`}>
                          Edit
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
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

      <ProductSheet open={editing.open} onOpenChange={(open) => setEditing((s) => ({ ...s, open }))} product={editing.product} onSaved={setNotice} />
      <DeleteSheet product={deleting} onClose={() => setDeleting(null)} onDeleted={setNotice} onHand={deleting ? onHand.get(deleting.id) ?? 0 : 0} />
    </>
  );
}
