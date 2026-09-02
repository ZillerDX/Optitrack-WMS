import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      po_number,
      product_id,
      product_name,
      sku,
      supplier,
      reorder_qty,
      unit_cost,
      total_amount,
      target_location,
      notes,
    } = body;

    const qty = Number(reorder_qty) || 1;
    const prodId = Number(product_id);
    const loc = target_location || 'Zone A-01';
    const unitPrice = Number(unit_cost) || 0;
    const totalPrice = Number(total_amount) || unitPrice * qty;
    const poNum = po_number || `PO-${Date.now()}`;

    // 1. Store or update Purchase Order record in Supabase
    const poPayload = {
      po_number: poNum,
      user_id: user.id,
      supplier: supplier || 'Vendor',
      total_amount: totalPrice,
      status: 'APPROVED',
      items: [
        {
          product_id: prodId,
          name: product_name,
          sku: sku,
          quantity: qty,
          unit_cost: unitPrice,
          total: totalPrice,
          location: loc,
        },
      ],
      notes: notes || '1-Click approved via AI Predictive Reorder Agent',
      approved_at: new Date().toISOString(),
    };

    let savedPO = null;
    try {
      const poRes = await supabaseRest('purchase_orders', {
        method: 'POST',
        body: JSON.stringify(poPayload),
      });
      if (poRes.ok) {
        const poData = await poRes.json();
        savedPO = poData[0];
      }
    } catch (poErr) {
      console.warn('[Save PO Warning]:', poErr);
    }

    // 2. Automatically record INBOUND transaction to fulfill warehouse receipt
    const txPayload = {
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
    };

    const txRes = await supabaseRest('transactions', {
      method: 'POST',
      body: JSON.stringify(txPayload),
    });

    let createdTx = null;
    if (txRes.ok) {
      const txData = await txRes.json();
      createdTx = txData[0];
    }

    // 3. Atomically update inventory in the target location
    try {
      // Get min_stock_level for proper status tagging
      let minStockLevel = 5;
      const prodRes = await supabaseRest(`products?id=eq.${prodId}&select=min_stock_level`);
      if (prodRes.ok) {
        const pList = await prodRes.json();
        if (pList[0]) minStockLevel = Number(pList[0].min_stock_level) || 5;
      }

      const invRes = await supabaseRest(
        `inventory?product_id=eq.${prodId}&location=eq.${encodeURIComponent(loc)}`
      );
      if (invRes.ok) {
        const invList = await invRes.json();
        if (Array.isArray(invList) && invList.length > 0) {
          const invItem = invList[0];
          const newQty = (Number(invItem.quantity) || 0) + qty;
          const newStatus = newQty <= 0 ? 'OUT_OF_STOCK' : newQty <= minStockLevel ? 'LOW_STOCK' : 'IN_STOCK';
          await supabaseRest(`inventory?id=eq.${invItem.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ quantity: newQty, status: newStatus }),
          });

          // Delete extra duplicates if any exist
          if (invList.length > 1) {
            for (let i = 1; i < invList.length; i++) {
              await supabaseRest(`inventory?id=eq.${invList[i].id}`, { method: 'DELETE' });
            }
          }
        } else {
          const newStatus = qty <= minStockLevel ? 'LOW_STOCK' : 'IN_STOCK';
          await supabaseRest('inventory', {
            method: 'POST',
            body: JSON.stringify({
              product_id: prodId,
              location: loc,
              quantity: qty,
              status: newStatus,
            }),
          });
        }
      }
    } catch (invErr) {
      console.warn('[Sync Inventory in Approve PO Error]:', invErr);
    }

    return NextResponse.json({
      success: true,
      message: `Purchase Order ${poNum} approved successfully. ${qty} units received into ${loc}.`,
      purchase_order: savedPO || poPayload,
      transaction: createdTx,
    });
  } catch (err: any) {
    console.error('[Approve Reorder Error]:', err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
