import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/apiFetch';
import { endOfLocalDay, startOfLocalDay } from '@/lib/dateRange';
import type { MovementType } from '@/lib/labels';

export interface Movement {
  id: number;
  ref_code: string;
  type: MovementType;
  quantity: number;
  stock_after: number | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  product: { id: number; name: string; sku: string } | null;
  user: { first_name: string | null; last_name: string | null } | null;
}

export interface HistoryFilters {
  type: MovementType | '';
  location: string;
  productId: number | null;
  /** 'YYYY-MM-DD' in the viewer's time zone, or '' */
  from: string;
  to: string;
}

export const EMPTY_FILTERS: HistoryFilters = { type: '', location: '', productId: null, from: '', to: '' };
export const HISTORY_PAGE_SIZE = 50;

/** The query string for GET /api/transactions (without paging). */
export function filterParams(f: HistoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.type) params.set('type', f.type);
  if (f.location) params.set('location', f.location);
  if (f.productId !== null) params.set('product_id', String(f.productId));
  const from = f.from ? startOfLocalDay(f.from) : null;
  const to = f.to ? endOfLocalDay(f.to) : null;
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return params;
}

export function useHistory(filters: HistoryFilters, page: number) {
  return useQuery({
    queryKey: ['history', 'list', { ...filters, page }] as const,
    queryFn: ({ signal }) => {
      const params = filterParams(filters);
      params.set('limit', String(HISTORY_PAGE_SIZE));
      params.set('offset', String(page * HISTORY_PAGE_SIZE));
      return apiFetch<Movement[]>(`/api/transactions?${params}`, { signal });
    },
    placeholderData: keepPreviousData,
  });
}

/** Every row that matches, fetched 1000 at a time (the API's maximum), for the CSV. Stops at `cap`. */
export async function fetchAllMatching(filters: HistoryFilters, cap = 20_000): Promise<{ rows: Movement[]; complete: boolean }> {
  const rows: Movement[] = [];
  let total = Infinity;
  while (rows.length < Math.min(total, cap)) {
    const params = filterParams(filters);
    params.set('limit', '1000');
    params.set('offset', String(rows.length));
    const page = await apiFetch<Movement[]>(`/api/transactions?${params}`);
    total = page.total ?? rows.length + page.data.length;
    if (page.data.length === 0) break;
    rows.push(...page.data);
  }
  return { rows: rows.slice(0, cap), complete: rows.length >= total };
}
