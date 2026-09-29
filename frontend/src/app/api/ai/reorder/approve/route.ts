import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';
import { applyStockMovement } from '@/lib/stock';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { po_number, product_name, sku, supplier, notes } = body;

    const qty = Number(body.reorder_qty);
    const prodId = Number(body.product_id);
    const loc = typeof body.target_location === 'string' ? body.target_location.trim() : '';
    const poNum =
      typeof po_number === 'string' && po_number.trim() && po_number.length <= 100
        ? po_number.trim()
        : `PO-${Date.now()}`;

    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ detail: 'reorder_qty must be a positive integer' }, { status: 400 });
    }
    if (!Number.isInteger(prodId) || prodId <= 0) {
      return NextResponse.json({ detail: 'product_id must be a positive integer' }, { status: 400 });
    }
    if (!loc || loc.length > 50) {
      return NextResponse.json({ detail: 'target_location is required (max 50 characters)' }, { status: 400 });
    }

    // Ownership of the product and location, capacity, and the price all come from
    // the server-side records; the client-supplied cost/total are ignored.
    const movement = await applyStockMovement({
      userId: user.id,
      productId: prodId,
      location: loc,
      type: 'INBOUND',
      quantity: qty,
    });
    if (!movement.ok) {
      return NextResponse.json({ detail: movement.detail }, { status: movement.status });
    }

    const unitPrice = movement.unitPrice;
    const totalPrice = unitPrice * qty;

    // Record the receipt; if that fails, undo the stock change so history and stock agree.
    const txRes = await supabaseRest('transactions', {
      method: 'POST',
      body: JSON.stringify({
        ref_code: poNum,
        type: 'INBOUND',
        quantity: qty,
        unit_price: unitPrice,
        total_price: totalPrice,
        status: 'COMPLETED',
        location: loc,
        notes: `Restock PO: ${poNum} (AI Reorder Agent)`,
        user_id: user.id,
        product_id: prodId,
      }),
    });
    if (!txRes.ok) {
      await movement.revert();
      console.error('[Approve Reorder Transaction Error]:', await txRes.text());
      return NextResponse.json(
        { detail: 'Failed to record the receipt (the PO number may already exist).' },
        { status: 409 }
      );
    }
    const createdTx = (await txRes.json())[0] ?? null;

    const poPayload = {
      po_number: poNum,
      user_id: user.id,
      supplier: typeof supplier === 'string' && supplier ? supplier : 'Vendor',
      total_amount: totalPrice,
      status: 'APPROVED',
      items: [
        {
          product_id: prodId,
          name: typeof product_name === 'string' ? product_name : null,
          sku: typeof sku === 'string' ? sku : null,
          quantity: qty,
          unit_cost: unitPrice,
          total: totalPrice,
          location: loc,
        },
      ],
      notes: typeof notes === 'string' && notes ? notes : '1-Click approved via AI Predictive Reorder Agent',
      approved_at: new Date().toISOString(),
    };

    let savedPO = null;
    try {
      const poRes = await supabaseRest('purchase_orders', {
        method: 'POST',
        body: JSON.stringify(poPayload),
      });
      if (poRes.ok) {
        savedPO = (await poRes.json())[0] ?? null;
      } else {
        console.warn('[Save PO Warning]:', await poRes.text());
      }
    } catch (poErr) {
      console.warn('[Save PO Warning]:', poErr);
    }

    return NextResponse.json({
      success: true,
      message: `Purchase Order ${poNum} approved successfully. ${qty} units received into ${loc}.`,
      purchase_order: savedPO || poPayload,
      transaction: createdTx,
    });
  } catch (err: any) {
    console.error('[Approve Reorder Error]:', err);
    return NextResponse.json({ detail: 'Failed to approve purchase order' }, { status: 500 });
  }
}
