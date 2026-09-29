import { supabaseRest } from '@/lib/supabase';

export type MovementType = 'INBOUND' | 'OUTBOUND' | 'ADJUST';

export const MOVEMENT_TYPES: readonly MovementType[] = ['INBOUND', 'OUTBOUND', 'ADJUST'];

export type StockResult =
  | {
      ok: true;
      unitPrice: number;
      /** Undo the inventory change if a later step (writing the transaction) fails. */
      revert: () => Promise<void>;
    }
  | { ok: false; status: number; detail: string };

const fail = (status: number, detail: string): StockResult => ({ ok: false, status, detail });

export function inventoryStatus(quantity: number, minStockLevel: number): string {
  if (quantity === 0) return 'OUT_OF_STOCK';
  if (quantity < minStockLevel) return 'LOW_STOCK';
  return 'IN_STOCK';
}

/**
 * Validate a stock movement for `userId` and apply it to inventory.
 *
 * Rules: the product and the location must
 * belong to the caller, OUTBOUND can never exceed available stock (no silent
 * clamping), INBOUND/ADJUST cannot exceed the location capacity, and the price
 * always comes from the product record, never from the client.
 *
 * PostgREST cannot run a multi-statement transaction, so the inventory write is
 * a compare-and-swap on the previous quantity: a concurrent writer makes it
 * fail with 409 instead of losing an update.
 */
export async function applyStockMovement(params: {
  userId: number;
  productId: number;
  location: string;
  type: MovementType;
  quantity: number;
}): Promise<StockResult> {
  const { userId, productId, location, type, quantity } = params;

  // 1. Product must belong to the caller.
  const prodRes = await supabaseRest(
    `products?id=eq.${productId}&owner_id=eq.${userId}&select=id,cost_price,sell_price,min_stock_level`
  );
  if (!prodRes.ok) return fail(500, 'Failed to load product');
  const prods = await prodRes.json();
  if (!Array.isArray(prods) || prods.length === 0) {
    return fail(404, `Product with ID ${productId} not found or access denied`);
  }
  const product = prods[0];
  const minStock = Number(product.min_stock_level) || 0;

  // 2. Location must exist and belong to the caller.
  const locRes = await supabaseRest(
    `locations?owner_id=eq.${userId}&name=eq.${encodeURIComponent(location)}&select=id,capacity`
  );
  if (!locRes.ok) return fail(500, 'Failed to load location');
  const locs = await locRes.json();
  if (!Array.isArray(locs) || locs.length === 0) {
    return fail(400, `Location '${location}' not found. Please create it first.`);
  }
  const capacity = Number(locs[0].capacity) || 0;

  // 3. Current stock of this product at this location.
  const invRes = await supabaseRest(
    `inventory?product_id=eq.${productId}&location=eq.${encodeURIComponent(location)}&select=id,quantity`
  );
  if (!invRes.ok) return fail(500, 'Failed to load inventory');
  const invRows = await invRes.json();
  const inventory = Array.isArray(invRows) && invRows.length > 0 ? invRows[0] : null;
  const currentQty = inventory ? Number(inventory.quantity) || 0 : 0;

  // 4. Compute the new quantity.
  let newQty: number;
  if (type === 'INBOUND') {
    newQty = currentQty + quantity;
  } else if (type === 'OUTBOUND') {
    if (!inventory) {
      return fail(400, `No inventory found at location '${location}' for this product`);
    }
    if (currentQty < quantity) {
      return fail(400, `Insufficient stock. Available: ${currentQty}, Requested: ${quantity}`);
    }
    newQty = currentQty - quantity;
  } else {
    newQty = quantity;
  }

  // 5. Capacity check (only movements that can add stock).
  if (type !== 'OUTBOUND') {
    const locStockRes = await supabaseRest(
      `inventory?location=eq.${encodeURIComponent(location)}&select=quantity,product:products!inner(owner_id)&product.owner_id=eq.${userId}`
    );
    if (!locStockRes.ok) return fail(500, 'Failed to load location stock');
    const locStock = await locStockRes.json();
    const locationTotal = (Array.isArray(locStock) ? locStock : []).reduce(
      (sum: number, row: any) => sum + (Number(row.quantity) || 0),
      0
    );
    const projected = locationTotal - currentQty + newQty;
    if (projected > capacity) {
      return fail(
        400,
        `Location '${location}' capacity exceeded. Capacity: ${capacity}, Current stock: ${locationTotal}, Projected stock: ${projected}`
      );
    }
  }

  const status = inventoryStatus(newQty, minStock);
  const unitPrice =
    type === 'OUTBOUND' ? Number(product.sell_price) || 0 : Number(product.cost_price) || 0;

  // 6. Apply. Compare-and-swap on the previous quantity so concurrent writers conflict.
  if (inventory) {
    const patch = await supabaseRest(
      `inventory?id=eq.${inventory.id}&quantity=eq.${currentQty}`,
      { method: 'PATCH', body: JSON.stringify({ quantity: newQty, status }) }
    );
    if (!patch.ok) return fail(500, 'Failed to update inventory');
    const updated = await patch.json();
    if (!Array.isArray(updated) || updated.length === 0) {
      return fail(409, 'Inventory changed concurrently. Please retry.');
    }
    return {
      ok: true,
      unitPrice,
      revert: async () => {
        await supabaseRest(`inventory?id=eq.${inventory.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ quantity: currentQty, status: inventoryStatus(currentQty, minStock) }),
        });
      },
    };
  }

  const created = await supabaseRest('inventory', {
    method: 'POST',
    body: JSON.stringify({ product_id: productId, location, quantity: newQty, status }),
  });
  if (!created.ok) {
    // Unique (product_id, location) violation => someone created it first.
    return fail(409, 'Inventory changed concurrently. Please retry.');
  }
  const createdRows = await created.json();
  const newId = Array.isArray(createdRows) ? createdRows[0]?.id : undefined;
  return {
    ok: true,
    unitPrice,
    revert: async () => {
      if (newId !== undefined) await supabaseRest(`inventory?id=eq.${newId}`, { method: 'DELETE' });
    },
  };
}
