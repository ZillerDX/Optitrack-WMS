import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json([]);
    }

    const res = await supabaseRest(`products?owner_id=eq.${user.id}&select=*&order=id.desc`);
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
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const payload = {
      owner_id: user.id,
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
    const newProduct = created[0] || payload;

    // Create initial 0-quantity inventory record ONLY at the user-specified location from the Create Product form
    const chosenLocation = body.location && body.location !== 'ALL' ? String(body.location).trim() : null;
    if (newProduct.id && chosenLocation) {
      const checkRes = await supabaseRest(`inventory?product_id=eq.${newProduct.id}&location=eq.${encodeURIComponent(chosenLocation)}`);
      if (checkRes.ok) {
        const existing = await checkRes.json();
        if (!Array.isArray(existing) || existing.length === 0) {
          await supabaseRest('inventory', {
            method: 'POST',
            body: JSON.stringify({
              product_id: newProduct.id,
              location: chosenLocation,
              quantity: 0,
              status: 'OUT_OF_STOCK',
            }),
          });
        }
      }
    }

    return NextResponse.json(newProduct);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}