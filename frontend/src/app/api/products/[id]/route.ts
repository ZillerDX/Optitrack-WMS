import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';
import { parseProductInput } from '@/lib/productInput';
import { deleteProduct } from '@/lib/stock';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeId } = await params;
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const parsed = parseProductInput(await req.json(), { partial: true });
    if (!parsed.ok) {
      return NextResponse.json({ detail: parsed.detail }, { status: 422 });
    }
    const update = parsed.data;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ detail: 'No editable fields provided' }, { status: 422 });
    }
    const id = Number(routeId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ detail: 'Invalid product id' }, { status: 400 });
    }

    // sell_price >= cost_price must hold for the values that will be stored, so an update
    // of only one of the two is compared with the stored other one.
    if ((update.cost_price !== undefined) !== (update.sell_price !== undefined)) {
      const curRes = await supabaseRest(`products?id=eq.${id}&owner_id=eq.${user.id}&deleted_at=is.null&select=cost_price,sell_price`);
      const cur = curRes.ok ? (await curRes.json())[0] : null;
      if (!cur) return NextResponse.json({ detail: 'Product not found' }, { status: 404 });
      const cost = update.cost_price ?? Number(cur.cost_price);
      const sell = update.sell_price ?? Number(cur.sell_price);
      if (sell < cost) {
        return NextResponse.json({ detail: `sell_price (${sell}) must be >= cost_price (${cost})` }, { status: 422 });
      }
    }

    if (update.sku !== undefined) {
      const dupRes = await supabaseRest(
        `products?owner_id=eq.${user.id}&sku=eq.${encodeURIComponent(update.sku)}&id=neq.${id}&select=id`
      );
      const dups = dupRes.ok ? await dupRes.json() : [];
      if (Array.isArray(dups) && dups.length > 0) {
        return NextResponse.json({ detail: `Product with SKU '${update.sku}' already exists` }, { status: 409 });
      }
    }

    const res = await supabaseRest(`products?id=eq.${id}&owner_id=eq.${user.id}&deleted_at=is.null`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
    if (res.status === 409) {
      return NextResponse.json({ detail: `Product with SKU '${update.sku}' already exists` }, { status: 409 });
    }
    if (!res.ok) {
      console.error('[Update Product Error]:', await res.text());
      return NextResponse.json({ detail: 'Failed to update product' }, { status: 400 });
    }
    const updated = await res.json();
    if (!Array.isArray(updated) || updated.length === 0) {
      return NextResponse.json({ detail: 'Product not found' }, { status: 404 });
    }
    return NextResponse.json(updated[0]);
  } catch (err: any) {
    console.error('[Product Route Error]:', err);
    return NextResponse.json({ detail: 'Request failed' }, { status: 500 });
  }
}

/**
 * Soft delete (one database transaction): the product is marked deleted and its stock is taken to
 * zero through ADJUST movements, so its transaction history stays. Its SKU is freed for reuse.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeId } = await params;
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const id = Number(routeId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ detail: 'Invalid product id' }, { status: 400 });
    }

    const result = await deleteProduct({ userId: user.id, productId: id });
    if (!result.ok) {
      return NextResponse.json({ detail: result.detail }, { status: result.status });
    }
    return NextResponse.json({ message: 'Deleted successfully' });
  } catch (err: any) {
    console.error('[Product Route Error]:', err);
    return NextResponse.json({ detail: 'Request failed' }, { status: 500 });
  }
}
