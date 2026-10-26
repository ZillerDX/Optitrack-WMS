import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';
import { inventoryStatus, recordStockMovement } from '@/lib/stock';
import { COUNT_HEADERS, inventoryFilters, listResponse, pagingPath, parsePaging } from '@/lib/listQuery';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    // Optional: location, product_id, limit, offset. The body is an array; X-Total-Count has the
    // number of matching rows and X-Truncated says the default cap cut the answer.
    const { searchParams } = new URL(req.url);
    const paging = parsePaging(searchParams);
    if (!paging.ok) return NextResponse.json({ detail: paging.detail }, { status: 400 });
    const filters = inventoryFilters(searchParams);
    if (!filters.ok) return NextResponse.json({ detail: filters.detail }, { status: 400 });
    const location = searchParams.get('location');
    let path = `inventory?select=*,product:products!inner(*)&product.owner_id=eq.${user.id}&order=id.desc${filters.value}`;
    if (location && location !== 'ALL') {
      path += `&location=eq.${encodeURIComponent(location)}`;
    }
    path += pagingPath(paging.value);

    const res = await supabaseRest(path, { headers: COUNT_HEADERS });
    if (!res.ok) {
      console.error('[Supabase Inventory Error]:', await res.text());
      return NextResponse.json({ detail: 'Failed to load data' }, { status: 500 });
    }
    return listResponse(res, await res.json(), paging.value);
  } catch (err: any) {
    console.error('[GET Inventory Error]:', err);
    return NextResponse.json({ detail: 'Failed to load data' }, { status: 500 });
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
    const prodRes = await supabaseRest(`products?id=eq.${productId}&owner_id=eq.${user.id}&deleted_at=is.null&select=id,min_stock_level`);
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

    // Stock that is created with units on it is an INBOUND movement like any other: one database
    // transaction takes the location lock, checks the capacity, creates the stock row and writes the
    // transaction, so the units are in the history and two requests cannot both fill the last space.
    if (quantity > 0) {
      const moved = await recordStockMovement({
        userId: user.id,
        productId,
        location,
        type: 'INBOUND',
        quantity,
        notes: 'Initial stock',
      });
      if (!moved.ok) {
        return NextResponse.json({ detail: moved.detail }, { status: moved.status });
      }
      return NextResponse.json(moved.data.inventory, { status: 201 });
    }

    // An empty stock row has no units to record and cannot affect the capacity.
    const res = await supabaseRest('inventory', {
      method: 'POST',
      body: JSON.stringify({
        product_id: productId,
        location,
        quantity: 0,
        status: inventoryStatus(0, Number(prods[0].min_stock_level) || 0),
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
