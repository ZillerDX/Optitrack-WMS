import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/apiFetch';
import type { MovementType } from '@/lib/labels';

/** Rows of GET /api/inventory (the product comes along, see the route). */
export interface StockRow {
  id: number;
  product_id: number;
  location: string;
  quantity: number;
  status: string;
  product: { id: number; name: string; sku: string; category: string | null; min_stock_level: number; unit_price: number | string };
}

export interface LocationRow {
  id: number;
  name: string;
  description: string | null;
  capacity: number;
}

export interface ProductOption {
  id: number;
  name: string;
  sku: string;
  min_stock_level: number;
}

/** Keys are [feature, resource, params]; a stock movement changes all of these (see invalidateStock). */
export const stockKeys = {
  list: (location: string) => ['stock', 'list', { location }] as const,
  locations: ['stock', 'locations'] as const,
  products: (q: string) => ['products', 'options', { q }] as const,
};

/** Everything a stock change can make stale: stock, history, dashboard figures and the product list. */
export function useInvalidateStock() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(['stock', 'history', 'dashboard', 'products'].map((feature) => queryClient.invalidateQueries({ queryKey: [feature] })));
}

const STOCK_LIMIT = 1000;

export function useStock(location: string) {
  return useQuery({
    queryKey: stockKeys.list(location),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: String(STOCK_LIMIT) });
      if (location !== 'ALL') params.set('location', location);
      return apiFetch<StockRow[]>(`/api/inventory?${params}`, { signal });
    },
  });
}

/** The stock of one product on every location (small: one row per location). */
export function useProductStock(productId: number | null) {
  return useQuery({
    queryKey: ['stock', 'product', { productId }] as const,
    enabled: productId !== null,
    queryFn: ({ signal }) => apiFetch<StockRow[]>(`/api/inventory?product_id=${productId}&limit=${STOCK_LIMIT}`, { signal }).then((r) => r.data),
  });
}

export function useLocations() {
  return useQuery({
    queryKey: stockKeys.locations,
    queryFn: ({ signal }) => apiFetch<LocationRow[]>('/api/locations', { signal }).then((r) => r.data),
  });
}

export function useProductOptions(q: string) {
  return useQuery({
    queryKey: stockKeys.products(q),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: '8' });
      if (q) params.set('q', q);
      return apiFetch<ProductOption[]>(`/api/products?${params}`, { signal }).then((r) => r.data);
    },
    placeholderData: (previous) => previous,
  });
}

export interface MovementInput {
  type: MovementType;
  product_id: number;
  location: string;
  quantity: number;
  notes?: string;
}

export function useRecordMovement() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (input: MovementInput) => apiFetch('/api/transactions', { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export interface LocationInput {
  name: string;
  capacity: number;
  description: string;
}

export function useSaveLocation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: ({ id, ...input }: LocationInput & { id?: number }) =>
      apiFetch(id ? `/api/locations/${id}` : '/api/locations', { method: id ? 'PUT' : 'POST', json: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: stockKeys.locations });
      await invalidate(); // a rename moves the stock rows to the new name
    },
  });
}

export function useDeleteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/api/locations/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockKeys.locations }),
  });
}
