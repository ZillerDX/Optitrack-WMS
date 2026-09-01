import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const location = searchParams.get('location');
    let path = 'transactions?select=*,product:products(*),user:users(id,first_name,last_name,email)&order=created_at.desc';
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
    const body = await req.json();
    const ref_code = body.ref_code || `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const res = await supabaseRest('transactions', {
      method: 'POST',
      body: JSON.stringify({
        ref_code,
        type: body.type,
        quantity: Number(body.quantity) || 1,
        unit_price: Number(body.unit_price) || 0,
        total_price: Number(body.total_price) || 0,
        status: body.status || 'COMPLETED',
        location: body.location || null,
        notes: body.notes || null,
        user_id: body.user_id || 1,
        product_id: body.product_id,
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ detail: await res.text() }, { status: 400 });
    }
    const created = await res.json();
    return NextResponse.json(created[0]);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}