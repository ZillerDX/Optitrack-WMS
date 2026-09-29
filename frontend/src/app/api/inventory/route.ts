import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';
import { inventoryStatus } from '@/lib/stock';

export const dynamic = 'force-dynamic';

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
    const productId = Number(body.product_id);
    const location = typeof body.location === 'string' ? body.location.trim() : '';
    const quantity = Number(body.quantity ?? 0);
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ detail: 'product_id must be a positive integer' }, { status: 422 });
    }
    if (!location || location.length > 50) {
      return NextResponse.json({ detail: 'location is required (max 50 characters)' }, { status: 422 });
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      return NextResponse.json({ detail: 'quantity must be a non-negative integer' }, { status: 422 });
    }

    // The product and the location must both belong to the caller.
    const prodRes = await supabaseRest(`products?id=eq.${productId}&owner_id=eq.${user.id}&select=id,min_stock_level`);
    const prods = prodRes.ok ? await prodRes.json() : [];
    if (!Array.isArray(prods) || prods.length === 0) {
      return NextResponse.json({ detail: 'Product not found or access denied' }, { status: 404 });
    }
    const locRes = await supabaseRest(`locations?owner_id=eq.${user.id}&name=eq.${encodeURIComponent(location)}&select=capacity`);
    const locs = locRes.ok ? await locRes.json() : [];
    if (!Array.isArray(locs) || locs.length === 0) {
      return NextResponse.json({ detail: `Location '${location}' not found. Please create it first.` }, { status: 400 });
    }

    const existRes = await supabaseRest(`inventory?product_id=eq.${productId}&location=eq.${encodeURIComponent(location)}&select=id`);
    const existing = existRes.ok ? await existRes.json() : [];
    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json({ detail: `Inventory for this product at '${location}' already exists` }, { status: 409 });
    }

    // Same capacity rule as stock movements: the location total must not exceed its capacity.
    const stockRes = await supabaseRest(
      `inventory?location=eq.${encodeURIComponent(location)}&select=quantity,product:products!inner(owner_id)&product.owner_id=eq.${user.id}`
    );
    const stock = stockRes.ok ? await stockRes.json() : [];
    const current = (Array.isArray(stock) ? stock : []).reduce((sum: number, r: any) => sum + (Number(r.quantity) || 0), 0);
    const capacity = Number(locs[0].capacity) || 0;
    if (current + quantity > capacity) {
      return NextResponse.json(
        { detail: `Location '${location}' capacity exceeded. Capacity: ${capacity}, Current stock: ${current}, Projected stock: ${current + quantity}` },
        { status: 400 }
      );
    }

    // The status is derived from the quantity, never taken from the client.
    const res = await supabaseRest('inventory', {
      method: 'POST',
      body: JSON.stringify({
        product_id: productId,
        location,
        quantity,
        status: inventoryStatus(quantity, Number(prods[0].min_stock_level) || 0),
      }),
    });
    if (res.status === 409) {
      return NextResponse.json({ detail: `Inventory for this product at '${location}' already exists` }, { status: 409 });
    }
    if (!res.ok) {
      console.error('[Create Inventory Error]:', await res.text());
      return NextResponse.json({ detail: 'Failed to create inventory' }, { status: 400 });
    }
    const created = await res.json();
    return NextResponse.json(created[0], { status: 201 });
  } catch (err: any) {
    console.error('[POST Inventory Error]:', err);
    return NextResponse.json({ detail: 'Failed to create inventory' }, { status: 500 });
  }
}
