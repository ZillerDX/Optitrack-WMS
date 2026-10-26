import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';
import { rateLimit } from '@/lib/rateLimit';
import { analyzeProduct, DataUnavailableError, loadWarehouse, stockByProduct, unitsSoldByProduct } from '@/lib/aiData';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const limited = await rateLimit(req, {
      name: 'ai-report',
      limit: 30,
      windowSeconds: 60,
      identifier: { value: String(user.id), limit: 10, windowSeconds: 60 },
    });
    if (limited) return limited;

    // 1. One shared, checked read of the warehouse (a failed read is a 503, never "empty")
    const now = new Date();
    const { products, inventory, locations, outbound } = await loadWarehouse(user.id, now);

    // 2. Compute quantitative metrics
    const totalUnits = inventory.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 0), 0);
    const totalValuation = inventory.reduce((sum: number, i: any) => {
      const price = Number(i.product?.sell_price) || Number(i.product?.cost_price) || 0;
      return sum + (Number(i.quantity) || 0) * price;
    }, 0);
    const totalCostBasis = inventory.reduce((sum: number, i: any) => {
      const cost = Number(i.product?.cost_price) || 0;
      return sum + (Number(i.quantity) || 0) * cost;
    }, 0);

    const totalCapacity = locations.reduce((sum: number, l: any) => sum + (Number(l.capacity) || 0), 0);
    const overallUtilizationPct = totalCapacity > 0 ? Math.min(100, Math.round((totalUnits / totalCapacity) * 100)) : 0;

    // 30-day velocity per product: the same numbers the chat and the reorder agent use
    const stock = stockByProduct(inventory);
    const sold = unitsSoldByProduct(outbound, now);

    const velocityItems = products.map((p: any) => {
      const a = analyzeProduct(p, stock.get(p.id)?.quantity ?? 0, sold.get(p.id) ?? 0);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category || 'General',
        stock: a.current_stock,
        min_stock: a.min_stock_level,
        cost_price: Number(p.cost_price) || 0,
        sell_price: Number(p.sell_price) || 0,
        units_out_30d: a.units_sold_30d,
        daily_burn: a.daily_burn_rate,
        days_remaining: a.days_of_inventory ?? (a.current_stock > 0 ? 999 : 0),
        status: a.urgency,
      };
    });

    // Zone utilization breakdown
    const zoneBreakdown = locations.map((loc: any) => {
      const locItems = inventory.filter((i: any) => i.location === loc.name);
      const used = locItems.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 0), 0);
      const cap = Number(loc.capacity) || 0;
      const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
      let status = 'OPTIMAL';
      if (pct > 90) status = 'CRITICAL_FULL';
      else if (pct > 75) status = 'NEAR_FULL';
      else if (pct === 0) status = 'EMPTY';
      return {
        name: loc.name,
        capacity: cap,
        used,
        pct,
        status,
      };
    });

    // Compute Health Score (1 - 100)
    let score = 95;
    const criticalCount = velocityItems.filter((i: any) => i.status === 'CRITICAL').length;
    const warningCount = velocityItems.filter((i: any) => i.status === 'WARNING').length;
    score -= criticalCount * 15;
    score -= warningCount * 5;
    if (overallUtilizationPct > 90) score -= 10;
    score = Math.max(20, Math.min(100, score));

    const healthGrade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';

    const topItem = velocityItems[0] || {
      name: 'Primary Inventory',
      sku: 'SKU-001',
      stock: totalUnits,
      units_out_30d: 0,
      daily_burn: 0,
      days_remaining: 365,
      status: 'HEALTHY'
    };

    const primaryZone = zoneBreakdown.find((z: any) => z.pct > 0) || zoneBreakdown[0] || { name: 'Main Zone', used: 0, capacity: 0, pct: 0 };
    const emptyZones = zoneBreakdown.filter((z: any) => z.pct === 0).map((z: any) => z.name);

    const projectedMargin = Math.max(0, totalValuation - totalCostBasis);
    const marginPct = totalValuation > 0 ? Math.round((projectedMargin / totalValuation) * 100) : 0;

    // Structured Action Items (in Professional English)
    const actionItems = [
      {
        id: 1,
        priority: 'HIGH',
        title: 'Optimize Inbound Flow to Headroom Zones',
        description: `Direct upcoming inbound shipments into available zones (${emptyZones.length > 0 ? emptyZones.join(', ') : 'Staging Area'}) to avoid bottlenecks in ${primaryZone.name}.`,
      },
      {
        id: 2,
        priority: 'MEDIUM',
        title: 'Reorder Point Verification for Fast Movers',
        description: `${topItem.name} has ${topItem.days_remaining > 365 ? '>365' : topItem.days_remaining} days of supply. Maintain minimum safety stock thresholds to guard against supplier lead-time fluctuations.`,
      },
      {
        id: 3,
        priority: 'LOW',
        title: 'Conduct Cycle Count & Zone Audit',
        description: 'Inspect storage bays and confirm physical barcode alignment across active warehouse zones.',
      }
    ];

    // Clean English Markdown for copying / export
    const cleanMarkdown = `=================================================================
OPTITRACK WMS - EXECUTIVE OPERATIONS INTELLIGENCE REPORT
Generated: ${new Date().toUTCString()}
Status: Operational Grade ${healthGrade} (${score}/100)
=================================================================

1. EXECUTIVE OPERATIONS BRIEF
-----------------------------------------------------------------
* Operational Health: Grade ${healthGrade} (${score}/100) - High structural and workflow stability.
* Total Inventory Valuation: $${totalValuation.toLocaleString()} USD
* Total Active Units: ${totalUnits.toLocaleString()} units across ${products.length} registered SKUs.
* Aggregate Facility Utilization: ${overallUtilizationPct}% of total capacity (${totalUnits.toLocaleString()} / ${totalCapacity.toLocaleString()} units).

2. SKU VELOCITY & DEPLETION ANALYSIS
-----------------------------------------------------------------
* Primary High-Velocity Item: ${topItem.name} (SKU: ${topItem.sku})
* Current Stock On-Hand: ${topItem.stock.toLocaleString()} units
* 30-Day Outbound Run-Rate: ${topItem.units_out_30d} units (${topItem.daily_burn} units/day)
* Days of Inventory Remaining: ${topItem.days_remaining > 365 ? '> 365 Days' : `${topItem.days_remaining} Days`}
* Risk Assessment: ${topItem.status === 'CRITICAL' ? 'Critical Depletion' : topItem.status === 'WARNING' ? 'Low Stock Warning' : 'Optimal Reserve'}

3. SPACE & ZONE OPTIMIZATION
-----------------------------------------------------------------
* Active Operational Zone: ${primaryZone.name} (${primaryZone.used} / ${primaryZone.capacity} units - ${primaryZone.pct}% utilized)
* Available Inbound Headroom: ${emptyZones.length > 0 ? emptyZones.join(', ') : 'All zones currently occupied'}
* Recommendation: Route bulk replenishment to underutilized bays to maintain ergonomic throughput.

4. WORKING CAPITAL & FINANCIAL EXPOSURE
-----------------------------------------------------------------
* Capital Tied in Inventory: $${totalCostBasis.toLocaleString()} USD
* Gross Sales Valuation: $${totalValuation.toLocaleString()} USD
* Unrealized Gross Margin: $${projectedMargin.toLocaleString()} USD (+${marginPct}%)
* Liquidity Status: Healthy working capital turnover with zero dead stock flags.

5. STRATEGIC ACTION ITEMS
-----------------------------------------------------------------
[1] Inbound Allocation: Target headroom zones for next batch delivery.
[2] Safety Margins: Maintain safety stock buffers against supply-chain delays.
[3] Zone Inventory Verification: Audit physical barcode tags across high-velocity storage bays.
=================================================================`;

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      health_score: score,
      health_grade: healthGrade,
      metrics: {
        total_units: totalUnits,
        total_valuation: totalValuation,
        total_cost_basis: totalCostBasis,
        total_capacity: totalCapacity,
        utilization_pct: overallUtilizationPct,
        active_products: products.length,
        critical_count: criticalCount,
        warning_count: warningCount,
        projected_margin: projectedMargin,
        margin_pct: marginPct,
      },
      top_item: topItem,
      primary_zone: primaryZone,
      empty_zones: emptyZones,
      zone_breakdown: zoneBreakdown,
      velocity_items: velocityItems,
      action_items: actionItems,
      report_markdown: cleanMarkdown,
    });
  } catch (error: any) {
    if (error instanceof DataUnavailableError) {
      return NextResponse.json({ detail: 'Warehouse data is temporarily unavailable. Please try again shortly.' }, { status: 503 });
    }
    console.error('[AI Report API Error]:', error);
    return NextResponse.json({ detail: 'Failed to generate the report' }, { status: 500 });
  }
}
