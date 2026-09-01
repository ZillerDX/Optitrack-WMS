import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json([]);
    }

    const { searchParams } = new URL(req.url);
    const location = searchParams.get('location');
    let path = `inventory?select=*,product:products!inner(*)&product.owner_id=eq.${user.id}&order=id.desc`;
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
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Verify product belongs to user
    const prodRes = await supabaseRest(`products?id=eq.${body.product_id}&owner_id=eq.${user.id}`);
    if (!prodRes.ok) {
      return NextResponse.json({ detail: 'Product not found or access denied' }, { status: 403 });
    }
    const prodList = await prodRes.json();
    if (!Array.isArray(prodList) || prodList.length === 0) {
      return NextResponse.json({ detail: 'Product not found or access denied' }, { status: 403 });
    }

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