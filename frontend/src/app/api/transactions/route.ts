import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';
import { recordStockMovement, MOVEMENT_TYPES, MovementType } from '@/lib/stock';
import { parseMovementDate } from '@/lib/validation';
import { COUNT_HEADERS, listResponse, pagingPath, parsePaging, transactionFilters } from '@/lib/listQuery';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    // Optional: location, type, product_id, from, to, limit, offset. The body is an array;
    // X-Total-Count has the number of matching rows and X-Truncated says the default cap cut the answer.
    const { searchParams } = new URL(req.url);
    const paging = parsePaging(searchParams);
    if (!paging.ok) return NextResponse.json({ detail: paging.detail }, { status: 400 });
    const filters = transactionFilters(searchParams);
    if (!filters.ok) return NextResponse.json({ detail: filters.detail }, { status: 400 });
    const location = searchParams.get('location');
    let path = `transactions?user_id=eq.${user.id}&select=*,product:products(*),user:users(id,first_name,last_name,email)&order=created_at.desc,id.desc${filters.value}`;
    if (location && location !== 'ALL') {
      path += `&location=eq.${encodeURIComponent(location)}`;
    }
    path += pagingPath(paging.value);

    const res = await supabaseRest(path, { headers: COUNT_HEADERS });
    if (!res.ok) {
      console.error('[Supabase Transactions Error]:', await res.text());
      return NextResponse.json({ detail: 'Failed to load data' }, { status: 500 });
    }
    return listResponse(res, await res.json(), paging.value);
  } catch (err: any) {
    console.error('[GET Transactions Error]:', err);
    return NextResponse.json({ detail: 'Failed to load data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    // Validate everything the client controls. Price, status, ref_code and
    // ownership are decided server-side.
    const type = body.type as MovementType;
    const quantity = Number(body.quantity);
    const productId = Number(body.product_id);
    const location = typeof body.location === 'string' ? body.location.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes : null;

    if (!MOVEMENT_TYPES.includes(type)) {
      return NextResponse.json({ detail: 'type must be INBOUND, OUTBOUND or ADJUST' }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ detail: 'quantity must be a positive integer' }, { status: 400 });
    }
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ detail: 'product_id must be a positive integer' }, { status: 400 });
    }
    if (!location || location.length > 50) {
      return NextResponse.json({ detail: 'location is required (max 50 characters)' }, { status: 400 });
    }
    if (notes !== null && notes.length > 500) {
      return NextResponse.json({ detail: 'notes must be at most 500 characters' }, { status: 400 });
    }
    let createdAt: string | undefined;
    if (body.created_at) {
      const date = parseMovementDate(body.created_at);
      if (!date.ok) return NextResponse.json({ detail: date.detail }, { status: 400 });
      createdAt = date.iso;
    }

    // One database transaction: ownership, capacity and stock rules, the stock change and the
    // transaction row. The user comes from the session; price, status and reference from the DB.
    const result = await recordStockMovement({
      userId: user.id,
      productId,
      location,
      type,
      quantity,
      notes,
      createdAt,
    });
    if (!result.ok) {
      return NextResponse.json({ detail: result.detail }, { status: result.status });
    }
    return NextResponse.json(result.data.transaction, { status: 201 });
  } catch (err: any) {
    console.error('[POST Transactions Error]:', err);
    return NextResponse.json({ detail: 'Failed to create transaction' }, { status: 500 });
  }
}
