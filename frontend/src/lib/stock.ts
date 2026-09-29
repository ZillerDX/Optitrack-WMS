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
async function callRpc<T>(
  name: string,
  args: Record<string, unknown>,
  conflictDetail = 'This reference number is already in use'
): Promise<RpcResult<T>> {
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
    // unique violation (transactions.ref_code, purchase_orders.po_number, locations (owner_id, name))
    return { ok: false, status: 409, detail: conflictDetail };
  }
  if (res.status === 404 && body.code === 'PGRST202') {
    console.error(`[Stock] function ${name} is missing: apply the supabase/migrations (0008 stock movements, 0009 update_location)`);
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

/**
 * Soft-delete a product in one database transaction (0010_soft_delete_products.sql): its stock is
 * taken to zero through ADJUST movements, the product is marked deleted (history stays) and its SKU
 * is freed.
 */
export function deleteProduct(params: { userId: number; productId: number }): Promise<RpcResult<{ id: number; deleted_at: string }>> {
  return callRpc<{ id: number; deleted_at: string }>('delete_product', {
    p_user_id: params.userId,
    p_product_id: params.productId,
  });
}

/**
 * Update a location, including a rename, in one database transaction (0009_update_location.sql).
 * Inventory and transactions reference a location by name, so a rename moves them with it.
 * `patch` may hold name, capacity and description only.
 */
export function updateLocation(params: {
  userId: number;
  locationId: number;
  patch: { name?: string; capacity?: number; description?: string | null };
}): Promise<RpcResult<Record<string, any>>> {
  return callRpc<Record<string, any>>(
    'update_location',
    { p_user_id: params.userId, p_location_id: params.locationId, p_patch: params.patch },
    'A location with this name already exists'
  );
}
