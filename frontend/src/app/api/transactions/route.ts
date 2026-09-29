import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseRest, getAuthUser } from '@/lib/supabase';
import { applyStockMovement, MOVEMENT_TYPES, MovementType } from '@/lib/stock';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const location = searchParams.get('location');
    let path = `transactions?user_id=eq.${user.id}&select=*,product:products(*),user:users(id,first_name,last_name,email)&order=created_at.desc`;
    if (location && location !== 'ALL') {
      path += `&location=eq.${encodeURIComponent(location)}`;
    }

    const res = await supabaseRest(path);
    if (!res.ok) {
      console.error('[Supabase Transactions Error]:', await res.text());
      return NextResponse.json({ detail: 'Failed to load data' }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (err: any) {
    console.error('[GET Transactions Error]:', err);
    return NextResponse.json({ detail: 'Failed to load data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    // Validate everything the client controls. Price, status, ref_code and
    // ownership are decided server-side.
    const type = body.type as MovementType;
    const quantity = Number(body.quantity);
    const productId = Number(body.product_id);
    const location = typeof body.location === 'string' ? body.location.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes : null;

    if (!MOVEMENT_TYPES.includes(type)) {
      return NextResponse.json({ detail: 'type must be INBOUND, OUTBOUND or ADJUST' }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ detail: 'quantity must be a positive integer' }, { status: 400 });
    }
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ detail: 'product_id must be a positive integer' }, { status: 400 });
    }
    if (!location || location.length > 50) {
      return NextResponse.json({ detail: 'location is required (max 50 characters)' }, { status: 400 });
    }
    if (notes !== null && notes.length > 500) {
      return NextResponse.json({ detail: 'notes must be at most 500 characters' }, { status: 400 });
    }
    let createdAt: string | undefined;
    if (body.created_at) {
      const parsed = new Date(body.created_at);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ detail: 'created_at is not a valid date' }, { status: 400 });
      }
      createdAt = parsed.toISOString();
    }

    // Ownership, capacity and stock rules; also applies the inventory change.
    const movement = await applyStockMovement({ userId: user.id, productId, location, type, quantity });
    if (!movement.ok) {
      return NextResponse.json({ detail: movement.detail }, { status: movement.status });
    }

    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const txPayload: Record<string, unknown> = {
      ref_code: `TXN-${day}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      type,
      quantity,
      unit_price: movement.unitPrice,
      total_price: movement.unitPrice * quantity,
      status: 'COMPLETED',
      location,
      notes,
      user_id: user.id,
      product_id: productId,
    };
    if (createdAt) txPayload.created_at = createdAt;

    const res = await supabaseRest('transactions', {
      method: 'POST',
      body: JSON.stringify(txPayload),
    });

    if (!res.ok) {
      // Keep stock and history consistent: undo the inventory change.
      await movement.revert();
      console.error('[Create Transaction Error]:', await res.text());
      return NextResponse.json({ detail: 'Failed to record transaction' }, { status: 500 });
    }
    const created = await res.json();
    return NextResponse.json(created[0], { status: 201 });
  } catch (err: any) {
    console.error('[POST Transactions Error]:', err);
    return NextResponse.json({ detail: 'Failed to create transaction' }, { status: 500 });
  }
}
