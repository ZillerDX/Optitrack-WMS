import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase';
import { approveReorder } from '@/lib/stock';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const limited = await rateLimit(req, {
      name: 'ai-approve',
      limit: 60,
      windowSeconds: 60,
      identifier: { value: String(user.id), limit: 30, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await req.json();
    const qty = Number(body.reorder_qty);
    const prodId = Number(body.product_id);
    const loc = typeof body.target_location === 'string' ? body.target_location.trim() : '';
    const poNum =
      typeof body.po_number === 'string' && body.po_number.trim() && body.po_number.length <= 100
        ? body.po_number.trim()
        : `PO-${Date.now()}`;
    const text = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);

    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ detail: 'reorder_qty must be a positive integer' }, { status: 400 });
    }
    if (!Number.isInteger(prodId) || prodId <= 0) {
      return NextResponse.json({ detail: 'product_id must be a positive integer' }, { status: 400 });
    }
    if (!loc || loc.length > 50) {
      return NextResponse.json({ detail: 'target_location is required (max 50 characters)' }, { status: 400 });
    }

    // Stock receipt, transaction and purchase order are written together by the database
    // (all or nothing). The cost is the product's own; a client-supplied cost is ignored.
    const result = await approveReorder({
      userId: user.id,
      productId: prodId,
      location: loc,
      quantity: qty,
      poNumber: poNum,
      supplier: text(body.supplier, 255),
      productName: text(body.product_name, 255),
      sku: text(body.sku, 100),
      notes: text(body.notes, 500),
    });
    if (!result.ok) {
      return NextResponse.json({ detail: result.detail }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: `Purchase Order ${poNum} approved successfully. ${qty} units received into ${loc}.`,
      purchase_order: result.data.purchase_order,
      transaction: result.data.transaction,
    });
  } catch (err: any) {
    console.error('[Approve Reorder Error]:', err);
    return NextResponse.json({ detail: 'Failed to approve purchase order' }, { status: 500 });
  }
}
