import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';
import { deleteInventory, recordStockMovement } from '@/lib/stock';

export const dynamic = 'force-dynamic';

/** Parse a positive integer route id; returns null when invalid. */
function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

interface OwnedInventory {
  id: number;
  product_id: number;
  location: string;
}

/** The inventory row, but only when it belongs to a product owned by the user. */
async function findOwnedInventory(inventoryId: number, userId: number): Promise<OwnedInventory | null> {
  const res = await supabaseRest(
    `inventory?id=eq.${inventoryId}&select=id,product_id,location,product:products!inner(owner_id)&product.owner_id=eq.${userId}`
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * Manual stock correction: sets the quantity. It is recorded as an ADJUST movement, so the
 * transaction history always explains the stock. The status is derived from the quantity and
 * the location cannot be changed here (moving stock is an OUTBOUND plus an INBOUND).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeId } = await params;
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const id = parseId(routeId);
    if (id === null) return NextResponse.json({ detail: 'Invalid inventory id' }, { status: 400 });

    // Same response for "missing" and "not yours" so ids cannot be probed.
    const row = await findOwnedInventory(id, user.id);
    if (!row) {
      return NextResponse.json({ detail: 'Inventory record not found' }, { status: 404 });
    }

    const body = await req.json();

    if (body.status !== undefined || body.location !== undefined) {
      return NextResponse.json(
        { detail: 'Only quantity can be edited: the status follows the quantity, and stock is moved with transactions' },
        { status: 400 }
      );
    }
    if (body.quantity === undefined) {
      return NextResponse.json({ detail: 'No editable fields provided' }, { status: 400 });
    }
    const qty = Number(body.quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      return NextResponse.json({ detail: 'quantity must be a non-negative integer' }, { status: 400 });
    }

    const result = await recordStockMovement({
      userId: user.id,
      productId: row.product_id,
      location: row.location,
      type: 'ADJUST',
      quantity: qty,
      notes: 'Manual stock correction',
    });
    if (!result.ok) {
      return NextResponse.json({ detail: result.detail }, { status: result.status });
    }
    return NextResponse.json(result.data.inventory);
  } catch (err: any) {
    console.error('[PUT Inventory Error]:', err);
    return NextResponse.json({ detail: 'Failed to update inventory' }, { status: 500 });
  }
}

/** Removes the stock row. Stock still on it is first taken to zero with an ADJUST movement (one transaction). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeId } = await params;
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const id = parseId(routeId);
    if (id === null) return NextResponse.json({ detail: 'Invalid inventory id' }, { status: 400 });

    // Same answer for "missing" and "not yours" (the database function checks ownership).
    const result = await deleteInventory({ userId: user.id, inventoryId: id });
    if (!result.ok) {
      return NextResponse.json({ detail: result.detail }, { status: result.status });
    }
    return NextResponse.json({ message: 'Inventory record deleted' });
  } catch (err: any) {
    console.error('[DELETE Inventory Error]:', err);
    return NextResponse.json({ detail: 'Failed to delete inventory' }, { status: 500 });
  }
}
