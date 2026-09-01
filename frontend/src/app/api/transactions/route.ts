import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json([]);

    const { searchParams } = new URL(req.url);
    const location = searchParams.get('location');
    let path = `transactions?user_id=eq.${user.id}&select=*,product:products(*),user:users(id,first_name,last_name,email)&order=created_at.desc`;
    if (location && location !== 'ALL') {
      path += `&location=eq.${encodeURIComponent(location)}`;
    }

    const res = await supabaseRest(path);
    if (!res.ok) {
      console.error('[Supabase Transactions Error]:', await res.text());
      return NextResponse.json([]);
    }
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (err: any) {
    console.error('[GET Transactions Error]:', err);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const ref_code = body.ref_code || `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const qty = Number(body.quantity) || 1;
    const prodId = Number(body.product_id);
    const loc = body.location || 'Zone A-01';

    const res = await supabaseRest('transactions', {
      method: 'POST',
      body: JSON.stringify({
        ref_code,
        type: body.type,
        quantity: qty,
        unit_price: Number(body.unit_price) || 0,
        total_price: Number(body.total_price) || 0,
        status: body.status || 'COMPLETED',
        location: loc,
        notes: body.notes || null,
        user_id: user.id,
        product_id: prodId,
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ detail: await res.text() }, { status: 400 });
    }
    const created = await res.json();

    // Synchronize inventory in target location
    try {
      const invRes = await supabaseRest(`inventory?product_id=eq.${prodId}&location=eq.${encodeURIComponent(loc)}`);
      if (invRes.ok) {
        const invList = await invRes.json();
        if (Array.isArray(invList) && invList.length > 0) {
          const invItem = invList[0];
          const newQty = body.type === 'INBOUND' ? invItem.quantity + qty : Math.max(0, invItem.quantity - qty);
          const newStatus = newQty <= 0 ? 'OUT_OF_STOCK' : newQty <= 5 ? 'LOW_STOCK' : 'IN_STOCK';
          await supabaseRest(`inventory?id=eq.${invItem.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ quantity: newQty, status: newStatus }),
          });
        } else if (body.type === 'INBOUND') {
          const newStatus = qty <= 5 ? 'LOW_STOCK' : 'IN_STOCK';
          await supabaseRest('inventory', {
            method: 'POST',
            body: JSON.stringify({
              product_id: prodId,
              location: loc,
              quantity: qty,
              status: newStatus,
            }),
          });
        }
      }
    } catch (invErr) {
      console.warn('[Sync Inventory Error]:', invErr);
    }

    return NextResponse.json(created[0]);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}