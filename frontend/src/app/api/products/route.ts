import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const res = await supabaseRest('products?select=*&order=id.desc');
    if (!res.ok) {
      console.error('[Supabase Products Error]:', await res.text());
      return NextResponse.json([]);
    }
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (err: any) {
    console.error('[GET Products Error]:', err);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = {
      owner_id: body.owner_id || 1,
      sku: body.sku,
      name: body.name,
      category: body.category,
      barcode: body.barcode || null,
      supplier: body.supplier || null,
      cost_price: Number(body.cost_price) || 0,
      sell_price: Number(body.sell_price) || 0,
      min_stock_level: Number(body.min_stock_level) || 0,
      unit: body.unit || 'pcs',
      image_url: body.image_url || null,
    };

    const res = await supabaseRest('products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return NextResponse.json({ detail: await res.text() }, { status: 400 });
    }

    const created = await res.json();
    return NextResponse.json(created[0] || payload);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}