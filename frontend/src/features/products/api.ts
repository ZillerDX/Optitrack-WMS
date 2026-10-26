import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/apiFetch';
import { useInvalidateStock } from '@/features/stock/api';

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  barcode: string | null;
  supplier: string | null;
  cost_price: number | string;
  sell_price: number | string;
  min_stock_level: number;
  unit: string | null;
}

export interface CategoryRow {
  id: number;
  name: string;
}

export const PAGE_SIZE = 25;

export const productKeys = {
  list: (params: { q: string; category: string; page: number }) => ['products', 'list', params] as const,
  categories: ['products', 'categories'] as const,
};

export function useProducts(params: { q: string; category: string; page: number }) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(params.page * PAGE_SIZE) });
      if (params.q) query.set('q', params.q);
      if (params.category) query.set('category', params.category);
      return apiFetch<Product[]>(`/api/products?${query}`, { signal });
    },
    placeholderData: keepPreviousData,
  });
}

/** Every product (up to the API's 1000), for figures that need the whole catalogue. */
export function useAllProducts() {
  return useQuery({
    queryKey: ['products', 'all'] as const,
    queryFn: ({ signal }) => apiFetch<Product[]>('/api/products?limit=1000', { signal }).then((r) => r.data),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: productKeys.categories,
    queryFn: ({ signal }) => apiFetch<CategoryRow[]>('/api/categories', { signal }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

/** Only the fields that changed are sent on an edit, so a rename can never touch a price. */
export type ProductChanges = Partial<{
  sku: string;
  name: string;
  category: string;
  barcode: string;
  supplier: string;
  cost_price: number;
  sell_price: number;
  min_stock_level: number;
  unit: string;
}>;

export function useSaveProduct() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: ({ id, changes }: { id?: number; changes: ProductChanges }) =>
      apiFetch<Product>(id ? `/api/products/${id}` : '/api/products', { method: id ? 'PUT' : 'POST', json: changes }),
    onSuccess: invalidate,
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/api/products/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
