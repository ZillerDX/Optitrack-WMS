import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const INVENTORY_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'];

/** Parse a positive integer route id; returns null when invalid. */
function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** True only when the inventory row belongs to a product owned by the user. */
async function ownsInventory(inventoryId: number, userId: number): Promise<boolean> {
  const res = await supabaseRest(
    `inventory?id=eq.${inventoryId}&select=id,product:products!inner(owner_id)&product.owner_id=eq.${userId}`
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeId } = await params;
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const id = parseId(routeId);
    if (id === null) return NextResponse.json({ detail: 'Invalid inventory id' }, { status: 400 });

    // Same response for "missing" and "not yours" so ids cannot be probed.
    if (!(await ownsInventory(id, user.id))) {
      return NextResponse.json({ detail: 'Inventory record not found' }, { status: 404 });
    }

    const body = await req.json();

    // Whitelist editable fields: product_id / id must never be client-controlled.
    const update: Record<string, unknown> = {};
    if (body.quantity !== undefined) {
      const qty = Number(body.quantity);
      if (!Number.isInteger(qty) || qty < 0) {
        return NextResponse.json({ detail: 'quantity must be a non-negative integer' }, { status: 400 });
      }
      update.quantity = qty;
    }
    if (body.status !== undefined) {
      if (!INVENTORY_STATUSES.includes(body.status)) {
        return NextResponse.json({ detail: 'Invalid status' }, { status: 400 });
      }
      update.status = body.status;
    }
    if (body.location !== undefined) {
      if (typeof body.location !== 'string' || !body.location.trim() || body.location.length > 50) {
        return NextResponse.json({ detail: 'Invalid location' }, { status: 400 });
      }
      update.location = body.location.trim();
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ detail: 'No editable fields provided' }, { status: 400 });
    }

    const res = await supabaseRest(`inventory?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
    if (!res.ok) return NextResponse.json({ detail: await res.text() }, { status: 400 });
    const updated = await res.json();
    return NextResponse.json(updated[0]);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeId } = await params;
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const id = parseId(routeId);
    if (id === null) return NextResponse.json({ detail: 'Invalid inventory id' }, { status: 400 });

    if (!(await ownsInventory(id, user.id))) {
      return NextResponse.json({ detail: 'Inventory record not found' }, { status: 404 });
    }

    const res = await supabaseRest(`inventory?id=eq.${id}`, { method: 'DELETE' });
    if (!res.ok) return NextResponse.json({ detail: await res.text() }, { status: 400 });
    return NextResponse.json({ message: 'Inventory record deleted' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
