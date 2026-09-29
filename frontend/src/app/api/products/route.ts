import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';
import { parseProductInput } from '@/lib/productInput';

export const dynamic = 'force-dynamic';

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
    const parsed = parseProductInput(body, { partial: false });
    if (!parsed.ok) {
      return NextResponse.json({ detail: parsed.detail }, { status: 422 });
    }
    const payload = { owner_id: user.id, ...parsed.data };

    // The initial stock row may only be created at one of the caller's own locations.
    const chosenLocation = body.location && body.location !== 'ALL' ? String(body.location).trim() : null;
    if (chosenLocation) {
      const locRes = await supabaseRest(
        `locations?owner_id=eq.${user.id}&name=eq.${encodeURIComponent(chosenLocation)}&select=id`
      );
      const locs = locRes.ok ? await locRes.json() : [];
      if (!Array.isArray(locs) || locs.length === 0) {
        return NextResponse.json({ detail: `Location '${chosenLocation}' not found. Please create it first.` }, { status: 400 });
      }
    }

    // Checked here as well as by the unique index (uq_products_owner_sku) so it also
    // answers cleanly before that migration has been applied.
    const dupRes = await supabaseRest(
      `products?owner_id=eq.${user.id}&sku=eq.${encodeURIComponent(payload.sku as string)}&select=id`
    );
    const dups = dupRes.ok ? await dupRes.json() : [];
    if (Array.isArray(dups) && dups.length > 0) {
      return NextResponse.json({ detail: `Product with SKU '${payload.sku}' already exists` }, { status: 409 });
    }

    const res = await supabaseRest('products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      return NextResponse.json({ detail: `Product with SKU '${payload.sku}' already exists` }, { status: 409 });
    }
    if (!res.ok) {
      console.error('[Create Product Error]:', await res.text());
      return NextResponse.json({ detail: 'Failed to create product' }, { status: 400 });
    }

    const created = await res.json();
    const newProduct = created[0] || payload;

    // Create the initial 0-quantity inventory record at the chosen (validated) location.
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
    console.error('[POST Products Error]:', err);
    return NextResponse.json({ detail: 'Failed to create product' }, { status: 500 });
  }
}
