import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/apiFetch';

/** The answer of GET /api/dashboard/summary (computed in the database over every row). */
export interface DashboardSummary {
  generated_at: string;
  window: { days: number; tz: string; from: string; to: string };
  location: string | null;
  totals: { units: number; cost_basis: number | string; market_value: number | string; products: number; products_with_stock: number };
  stock_status: { out_of_stock: number; low_stock: number; healthy: number };
  locations: Array<{ name: string; capacity: number; used: number; pct: number | null; over: boolean }>;
  movement: Array<{ day: string; inbound_units: number; outbound_units: number; inbound_value: number | string; outbound_value: number | string }>;
  adjustments: { count: number; net_units: number; legacy: number };
  by_category: Array<{ category: string; units: number; market_value: number | string; cost_basis: number | string }>;
  top_movers: Array<{ product_id: number; sku: string; name: string; units: number }>;
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function useDashboard(days: number, location: string) {
  const tz = browserTimeZone();
  return useQuery({
    queryKey: ['dashboard', 'summary', { days, location, tz }] as const,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ days: String(days), tz });
      if (location) params.set('location', location);
      return apiGet<DashboardSummary>(`/api/dashboard/summary?${params}`, signal);
    },
    placeholderData: keepPreviousData,
  });
}
