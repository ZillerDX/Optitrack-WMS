import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch real-time products, inventory, transactions, and existing POs in parallel
    const [prodRes, invRes, txRes, poRes] = await Promise.all([
      supabaseRest(`products?owner_id=eq.${user.id}&select=*&order=name.asc`),
      supabaseRest(`inventory?select=*,product:products!inner(*)&product.owner_id=eq.${user.id}`),
      supabaseRest(`transactions?user_id=eq.${user.id}&type=eq.OUTBOUND&order=created_at.desc&limit=200`),
      supabaseRest(`purchase_orders?user_id=eq.${user.id}&order=created_at.desc&limit=50`),
    ]);

    const products = prodRes.ok ? await prodRes.json() : [];
    const inventory = invRes.ok ? await invRes.json() : [];
    const outboundTransactions = txRes.ok ? await txRes.json() : [];
    const existingPOs = poRes.ok ? await poRes.json() : [];

    // 2. Map current stock per product
    const stockMap: Record<number, { quantity: number; locations: string[] }> = {};
    if (Array.isArray(inventory)) {
      for (const item of inventory) {
        const pId = item.product_id;
        if (!stockMap[pId]) {
          stockMap[pId] = { quantity: 0, locations: [] };
        }
        stockMap[pId].quantity += Number(item.quantity) || 0;
        if (item.location && !stockMap[pId].locations.includes(item.location)) {
          stockMap[pId].locations.push(item.location);
        }
      }
    }

    // 3. Compute 30-day velocity from outbound transactions
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const velocityMap: Record<number, number> = {};

    if (Array.isArray(outboundTransactions)) {
      for (const tx of outboundTransactions) {
        const txDate = tx.created_at ? new Date(tx.created_at) : now;
        if (txDate >= thirtyDaysAgo) {
          const pId = tx.product_id;
          const qty = Math.abs(Number(tx.quantity) || 0);
          velocityMap[pId] = (velocityMap[pId] || 0) + qty;
        }
      }
    }

    // 4. Build predictive models for each product
    const items: any[] = [];
    const draftPOs: any[] = [];

    if (Array.isArray(products)) {
      for (const prod of products) {
        const pId = prod.id;
        const currentStock = stockMap[pId]?.quantity ?? 0;
        const locations = stockMap[pId]?.locations ?? ['Zone A-01'];
        const targetLocation = locations[0] || 'Zone A-01';
        const minStock = Number(prod.min_stock_level) || 5;
        const costPrice = Number(prod.cost_price) || 0;
        const sellPrice = Number(prod.sell_price) || 0;
        const supplier = prod.supplier || 'Primary Supplier';

        const unitsSold30d = velocityMap[pId] || 0;
        // Daily burn rate
        const dailyBurnRate = Number((unitsSold30d / 30).toFixed(2));

        // Days of Inventory Remaining (DOI)
        let daysOfInventory = 999;
        let estimatedRunoutDate: string | null = null;

        if (currentStock <= 0) {
          daysOfInventory = 0;
          estimatedRunoutDate = 'Depleted';
        } else if (dailyBurnRate > 0) {
          daysOfInventory = Math.max(0, Math.round(currentStock / dailyBurnRate));
          const runoutTime = new Date(now.getTime() + daysOfInventory * 24 * 60 * 60 * 1000);
          estimatedRunoutDate = runoutTime.toISOString().split('T')[0];
        } else {
          daysOfInventory = currentStock <= minStock ? 7 : 999;
          estimatedRunoutDate = currentStock <= minStock ? 'Low Movement' : 'Stable (>90 days)';
        }

        // Urgency Classification
        let urgency: 'CRITICAL' | 'WARNING' | 'HEALTHY' = 'HEALTHY';
        if (currentStock <= 0 || daysOfInventory <= 3) {
          urgency = 'CRITICAL';
        } else if (currentStock <= minStock || daysOfInventory <= 10) {
          urgency = 'WARNING';
        }

        // Suggested Reorder Quantity
        const recommendedQty = Math.max(
          1,
          Math.max(minStock * 2 - currentStock, Math.ceil(dailyBurnRate * 14))
        );

        const itemAnalysis = {
          product_id: pId,
          sku: prod.sku,
          name: prod.name,
          category: prod.category || 'General',
          supplier,
          target_location: targetLocation,
          current_stock: currentStock,
          min_stock_level: minStock,
          cost_price: costPrice,
          sell_price: sellPrice,
          units_sold_30d: unitsSold30d,
          daily_burn_rate: dailyBurnRate,
          days_of_inventory: daysOfInventory,
          estimated_runout_date: estimatedRunoutDate,
          suggested_reorder_qty: recommendedQty,
          urgency,
        };

        items.push(itemAnalysis);

        // Generate a Draft Purchase Order if item needs restocking
        if (urgency === 'CRITICAL' || urgency === 'WARNING') {
          const totalCost = Number((recommendedQty * costPrice).toFixed(2));
          draftPOs.push({
            id: `DRAFT-${pId}-${Date.now().toString().slice(-4)}`,
            po_number: `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${prod.sku.replace(/[^a-zA-Z0-9]/g, '')}`,
            product_id: pId,
            product_name: prod.name,
            sku: prod.sku,
            supplier,
            target_location: targetLocation,
            current_stock: currentStock,
            reorder_qty: recommendedQty,
            unit_cost: costPrice,
            total_amount: totalCost,
            urgency,
            days_remaining: daysOfInventory,
            estimated_lead_days: 3,
            notes: `Auto-generated by AI Agent: ${urgency === 'CRITICAL' ? 'Stockout impending' : 'Below safety threshold'} (${currentStock}/${minStock} pcs, ${dailyBurnRate} pcs/day velocity).`,
          });
        }
      }
    }

    // 5. Aggregate Macro Metrics
    const totalCritical = items.filter((i) => i.urgency === 'CRITICAL').length;
    const totalWarning = items.filter((i) => i.urgency === 'WARNING').length;
    const totalHealthy = items.filter((i) => i.urgency === 'HEALTHY').length;
    const totalEstRestockBudget = draftPOs.reduce((sum, po) => sum + po.total_amount, 0);

    return NextResponse.json({
      summary: {
        total_tracked_products: items.length,
        critical_count: totalCritical,
        warning_count: totalWarning,
        healthy_count: totalHealthy,
        draft_po_count: draftPOs.length,
        total_restock_budget: Number(totalEstRestockBudget.toFixed(2)),
      },
      predictive_items: items,
      draft_purchase_orders: draftPOs,
      approved_purchase_orders: Array.isArray(existingPOs) ? existingPOs : [],
    });
  } catch (err: any) {
    console.error('[Predictive API Error]:', err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
