import { supabaseRest } from '@/lib/supabase';

export type MovementType = 'INBOUND' | 'OUTBOUND' | 'ADJUST';

export const MOVEMENT_TYPES: readonly MovementType[] = ['INBOUND', 'OUTBOUND', 'ADJUST'];

export function inventoryStatus(quantity: number, minStockLevel: number): string {
  if (quantity === 0) return 'OUT_OF_STOCK';
  if (quantity < minStockLevel) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export type RpcResult<T> = { ok: true; data: T } | { ok: false; status: number; detail: string };

export interface StockMovementData {
  transaction: Record<string, any>;
  inventory: Record<string, any>;
}

export interface ReorderData extends StockMovementData {
  purchase_order: Record<string, any>;
}

/**
 * Stock changes are made by Postgres functions (supabase/migrations/0008_stock_movements.sql),
 * each running as ONE database transaction: ownership checks, row locks, the stock change,
 * the transaction row and (for reorders) the purchase order all happen or none do, and
 * concurrent movements at a location are serialised.
 *
 * The functions signal user-facing problems with SQLSTATE PT4xx, which PostgREST turns into
 * HTTP 4xx with `{code, message}`; their messages are written to be shown to the user.
 * Anything else is logged and reported generically.
 */
async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const res = await supabaseRest(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
  if (res.ok) return { ok: true, data: (await res.json()) as T };

  let body: { code?: string; message?: string } = {};
  try {
    body = await res.json();
  } catch {
    // not JSON: fall through to the generic error
  }

  if (body.code && /^PT4\d\d$/.test(body.code) && body.message) {
    return { ok: false, status: Number(body.code.slice(2)), detail: body.message };
  }
  if (res.status === 409) {
    // unique violation on transactions.ref_code / purchase_orders.po_number
    return { ok: false, status: 409, detail: 'This reference number is already in use' };
  }
  if (res.status === 404 && body.code === 'PGRST202') {
    console.error(`[Stock] function ${name} is missing: apply supabase/migrations/0008_stock_movements.sql`);
    return { ok: false, status: 503, detail: 'Stock service is unavailable. Please try again later.' };
  }
  console.error(`[Stock] ${name} failed:`, res.status, body.code, body.message);
  return { ok: false, status: 500, detail: 'Failed to record stock movement' };
}

/**
 * Apply one movement for `userId` (taken from the session, never from the request body).
 * Rules live in the database function: the product and location must belong to the caller,
 * OUTBOUND cannot exceed stock (never clamped), INBOUND/ADJUST cannot exceed the location
 * capacity, and the price comes from the product.
 */
export function recordStockMovement(params: {
  userId: number;
  productId: number;
  location: string;
  type: MovementType;
  quantity: number;
  notes?: string | null;
  createdAt?: string | null;
}): Promise<RpcResult<StockMovementData>> {
  return callRpc<StockMovementData>('apply_stock_movement', {
    p_user_id: params.userId,
    p_product_id: params.productId,
    p_location: params.location,
    p_type: params.type,
    p_quantity: params.quantity,
    p_notes: params.notes ?? null,
    p_created_at: params.createdAt ?? null,
  });
}

/** Receive stock against a purchase order: stock + transaction + PO row in one transaction. */
export function approveReorder(params: {
  userId: number;
  productId: number;
  location: string;
  quantity: number;
  poNumber: string;
  supplier?: string | null;
  productName?: string | null;
  sku?: string | null;
  notes?: string | null;
}): Promise<RpcResult<ReorderData>> {
  return callRpc<ReorderData>('approve_reorder', {
    p_user_id: params.userId,
    p_product_id: params.productId,
    p_location: params.location,
    p_quantity: params.quantity,
    p_po_number: params.poNumber,
    p_supplier: params.supplier ?? null,
    p_product_name: params.productName ?? null,
    p_sku: params.sku ?? null,
    p_notes: params.notes ?? null,
  });
}
