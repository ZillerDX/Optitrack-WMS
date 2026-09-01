import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const location = searchParams.get('location');
    let path = 'inventory?select=*,product:products(*)&order=id.desc';
    if (location && location !== 'ALL') {
      path += `&location=eq.${encodeURIComponent(location)}`;
    }

    const res = await supabaseRest(path);
    if (!res.ok) {
      console.error('[Supabase Inventory Error]:', await res.text());
      return NextResponse.json([]);
    }
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (err: any) {
    console.error('[GET Inventory Error]:', err);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await supabaseRest('inventory', {
      method: 'POST',
      body: JSON.stringify({
        product_id: body.product_id,
        location: body.location,
        quantity: Number(body.quantity) || 0,
        status: body.status || 'IN_STOCK',
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