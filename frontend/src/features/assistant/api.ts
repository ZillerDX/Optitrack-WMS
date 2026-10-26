import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch, apiGet } from '@/lib/apiFetch';
import { useInvalidateStock } from '@/features/stock/api';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function useChat() {
  return useMutation({
    mutationFn: ({ message, history }: { message: string; history: ChatTurn[] }) =>
      apiFetch<{ response: string }>('/api/ai/chat', { method: 'POST', json: { message, history: history.slice(-10) } }).then((r) => r.data.response),
  });
}

export interface DraftOrder {
  id: string;
  product_id: number;
  product_name: string;
  sku: string;
  supplier: string;
  target_location: string;
  current_stock: number;
  reorder_qty: number;
  unit_cost: number;
  total_amount: number;
  urgency: 'CRITICAL' | 'WARNING' | string;
  days_remaining: number | null;
}

export interface Predictive {
  summary: { total_tracked_products: number; critical_count: number; warning_count: number; healthy_count: number; draft_po_count: number; total_restock_budget: number };
  draft_purchase_orders: DraftOrder[];
}

export function useReorderSuggestions(enabled: boolean) {
  return useQuery({
    queryKey: ['assistant', 'reorder'] as const,
    enabled,
    queryFn: ({ signal }) => apiGet<Predictive>('/api/ai/predictive', signal),
  });
}

export function useApproveReorder() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (order: DraftOrder) =>
      apiFetch<{ message: string }>('/api/ai/reorder/approve', {
        method: 'POST',
        json: { product_id: order.product_id, reorder_qty: order.reorder_qty, target_location: order.target_location, supplier: order.supplier, product_name: order.product_name, sku: order.sku },
      }).then((r) => r.data.message),
    onSuccess: invalidate,
  });
}

export interface Report {
  generated_at: string;
  health_score: number;
  health_grade: string;
  metrics: { total_units: number; total_valuation: number; utilization_pct: number; active_products: number; critical_count: number; warning_count: number; margin_pct: number };
  action_items: Array<{ id: number; priority: 'HIGH' | 'MEDIUM' | 'LOW' | string; title: string; description: string }>;
  report_markdown: string;
}

export function useReport() {
  // the route is a POST: it does work (it can call a model) and is rate limited
  return useMutation({ mutationFn: () => apiFetch<Report>('/api/ai/report', { method: 'POST' }).then((r) => r.data) });
}
