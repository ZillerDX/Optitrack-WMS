import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// High-availability fallback chain for Gemini
const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
];

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function containsThai(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const userMessage: string = body.message || '';
    const history: ChatMessage[] = Array.isArray(body.history) ? body.history : [];
    const isThaiQuery = containsThai(userMessage);

    if (!userMessage.trim()) {
      return NextResponse.json({
        response: isThaiQuery ? 'กรุณากรอกข้อความหรือคำถามครับ' : 'Please enter a message or question.',
      });
    }

    // 1. Fetch real-time warehouse data snapshot for authenticated user in parallel
    const [productsRes, inventoryRes, txRes, locRes, catRes] = await Promise.all([
      supabaseRest(`products?owner_id=eq.${user.id}&select=*&order=id.desc`),
      supabaseRest(`inventory?select=*,product:products!inner(*)&product.owner_id=eq.${user.id}&order=id.desc`),
      supabaseRest(`transactions?user_id=eq.${user.id}&select=*,product:products(*)&order=created_at.desc&limit=25`),
      supabaseRest(`locations?owner_id=eq.${user.id}&select=*`),
      supabaseRest(`categories?owner_id=eq.${user.id}&select=*`),
    ]);

    const products = productsRes.ok ? await productsRes.json() : [];
    const inventory = inventoryRes.ok ? await inventoryRes.json() : [];
    const transactions = txRes.ok ? await txRes.json() : [];
    const locations = locRes.ok ? await locRes.json() : [];
    const categories = catRes.ok ? await catRes.json() : [];

    // 2. Compute live operational and financial metrics
    let totalUnits = 0;
    let totalCostBasis = 0;
    let totalMarketValue = 0;

    const lowStockItems: any[] = [];
    const locationMap: Record<string, number> = {};
    const categoryMap: Record<string, { count: number; units: number; value: number }> = {};

    if (Array.isArray(inventory)) {
      for (const item of inventory) {
        const qty = Number(item.quantity) || 0;
        const sellPrice = Number(item.product?.sell_price) || 0;
        const costPrice = Number(item.product?.cost_price) || 0;
        const minStock = Number(item.product?.min_stock_level) || 5;

        totalUnits += qty;
        totalCostBasis += qty * costPrice;
        totalMarketValue += qty * sellPrice;

        const loc = item.location || 'Unassigned';
        locationMap[loc] = (locationMap[loc] || 0) + qty;

        const cat = item.product?.category || 'General';
        if (!categoryMap[cat]) {
          categoryMap[cat] = { count: 0, units: 0, value: 0 };
        }
        categoryMap[cat].units += qty;
        categoryMap[cat].value += qty * sellPrice;

        if (item.status === 'LOW_STOCK' || qty <= minStock) {
          lowStockItems.push({
            product_id: item.product_id,
            name: item.product?.name || 'Unknown Product',
            sku: item.product?.sku || 'N/A',
            category: cat,
            current_stock: qty,
            min_stock_level: minStock,
            shortage: Math.max(0, minStock - qty),
            suggested_reorder: Math.max(1, minStock * 2 - qty),
            location: loc,
            supplier: item.product?.supplier || 'Not specified',
            cost_price: costPrice,
            sell_price: sellPrice,
            urgency: qty === 0 ? 'CRITICAL (Out of Stock)' : 'HIGH (Below Safety)',
          });
        }
      }
    }

    if (Array.isArray(products)) {
      for (const prod of products) {
        const cat = prod.category || 'General';
        if (categoryMap[cat]) {
          categoryMap[cat].count += 1;
        }
      }
    }

    const potentialProfit = totalMarketValue - totalCostBasis;
    const profitMarginPct = totalCostBasis > 0 ? ((potentialProfit / totalCostBasis) * 100).toFixed(1) : '0.0';

    // Compute 30-day velocity & burn rate from outbound transactions
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const velocityMap: Record<number, number> = {};

    if (Array.isArray(transactions)) {
      for (const t of transactions) {
        if (t.type === 'OUTBOUND') {
          const tDate = t.created_at ? new Date(t.created_at) : now;
          if (tDate >= thirtyDaysAgo) {
            const pId = t.product_id;
            velocityMap[pId] = (velocityMap[pId] || 0) + Math.abs(Number(t.quantity) || 0);
          }
        }
      }
    }

    const velocityAndForecasting = Array.isArray(products)
      ? products.map((p: any) => {
          const pId = p.id;
          const invItem = Array.isArray(inventory) ? inventory.find((i: any) => i.product_id === pId) : null;
          const currentStock = invItem ? Number(invItem.quantity) || 0 : 0;
          const unitsSold30d = velocityMap[pId] || 0;
          const dailyVelocity = Number((unitsSold30d / 30).toFixed(2));
          const minStock = Number(p.min_stock_level) || 5;
          const daysLeft = currentStock <= 0 ? 0 : dailyVelocity > 0 ? Math.round(currentStock / dailyVelocity) : 999;
          const suggestedReorder = Math.max(1, Math.max(minStock * 2 - currentStock, Math.ceil(dailyVelocity * 14)));

          return {
            sku: p.sku,
            name: p.name,
            current_stock: currentStock,
            min_stock_level: minStock,
            supplier: p.supplier || 'Primary Vendor',
            cost_price: Number(p.cost_price) || 0,
            units_sold_30d: unitsSold30d,
            daily_burn_rate: `${dailyVelocity} units/day`,
            days_of_inventory_left: daysLeft === 999 ? 'Stable (No recent sales)' : `${daysLeft} days`,
            status: currentStock <= 0 ? 'CRITICAL_DEPLETED' : daysLeft <= 7 ? 'URGENT_REORDER' : 'HEALTHY',
            suggested_reorder_qty: suggestedReorder,
            draft_po_estimate: Number((suggestedReorder * (Number(p.cost_price) || 0)).toFixed(2)),
          };
        })
      : [];

    // Recent transactions summary
    const recentTxSummary = Array.isArray(transactions)
      ? transactions.slice(0, 10).map((t: any) => ({
          ref_code: t.ref_code,
          type: t.type,
          product_name: t.product?.name || 'Item',
          sku: t.product?.sku || 'N/A',
          quantity: t.quantity,
          location: t.location,
          total_price: t.total_price,
          date: t.created_at ? new Date(t.created_at).toISOString().split('T')[0] : 'N/A',
        }))
      : [];

    // 3. Assemble structured context snapshot
    const warehouseSnapshot = {
      user: { id: user.id, email: user.email },
      summary: {
        total_skus: Array.isArray(products) ? products.length : 0,
        total_units: totalUnits,
        total_cost_basis: Number(totalCostBasis.toFixed(2)),
        total_market_valuation: Number(totalMarketValue.toFixed(2)),
        potential_profit: Number(potentialProfit.toFixed(2)),
        profit_margin_percent: `${profitMarginPct}%`,
        total_zones: Array.isArray(locations) ? locations.length : 0,
        total_categories: Array.isArray(categories) ? categories.length : 0,
      },
      predictive_velocity_and_forecasting: velocityAndForecasting,
      low_stock_shortages: lowStockItems,
      zones: locationMap,
      categories: categoryMap,
      recent_movements: recentTxSummary,
    };

    // 4. Construct System Prompt (Strictly 100% English)
    const systemPrompt = `You are OptiTrack Autonomous AI, the advanced Predictive Inventory & Reorder Agent for OptiTrack WMS.
You have real-time access to the user's live warehouse data, Stock Velocity (burn rate), and Demand Forecasting snapshot below:

=== LIVE WAREHOUSE & PREDICTIVE SNAPSHOT ===
${JSON.stringify(warehouseSnapshot, null, 2)}
============================================

STRICT LANGUAGE REQUIREMENT (CRITICAL):
- You MUST ALWAYS respond 100% in English.
- Never output Thai or any other non-English language under any circumstances.
- All executive summaries, stock tables, bullet points, numbers, and recommendations must be strictly in English.

AUTONOMOUS AGENT CAPABILITIES:
1. STOCK VELOCITY & DEMAND FORECASTING:
   - When asked about stock rate, consumption, or upcoming shortages, analyze 'predictive_velocity_and_forecasting'.
   - Report Daily Burn Rate, Days of Inventory Left (DOI), and Run-out dates clearly in Markdown tables.
2. DRAFT PURCHASE ORDER (PO) RECOMMENDATIONS:
   - When items need replenishment, format a clear Draft PO box containing: PO Number, Supplier, SKU, Name, Suggested Reorder Qty, Unit Cost, and Total Budget.
   - Remind the manager that they can approve the Draft PO with 1 click in the Predictive Agent Tab!
3. FORMATTING:
   - Always format inventory, velocity, and PO summaries as clean Markdown tables with bold column headers.
   - Highlight urgent items with clear risk levels: [CRITICAL], [WARNING], [HEALTHY].`;

    // 5. Multi-Engine Failover Execution
    let aiResponseText = '';
    const clientGeminiKey = req.headers.get('x-gemini-key')?.trim();
    const clientGroqKey = req.headers.get('x-groq-key')?.trim();
    const geminiKey = process.env.GEMINI_API_KEY || clientGeminiKey;
    const groqKey = process.env.GROQ_API_KEY || clientGroqKey;

    // Step A: Primary Engine - Google Gemini (Fast & Reliable Flash-Lite / Flash)
    if (geminiKey) {
      for (const modelName of GEMINI_MODELS) {
        try {
          const geminiContents = [
            ...history.slice(-6).map((h) => ({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: h.content }],
            })),
            { role: 'user', parts: [{ text: userMessage }] },
          ];

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: geminiContents,
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 1500,
                },
              }),
            }
          );

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text && text.trim()) {
              aiResponseText = text.trim();
              break; // Success!
            }
          } else {
            console.warn(`[OptiTrack AI] Gemini model ${modelName} returned status ${geminiRes.status}. Trying next fallback...`);
          }
        } catch (geminiErr) {
          console.warn(`[OptiTrack AI] Gemini model ${modelName} error:`, geminiErr);
        }
      }
    }

    // Step B: Secondary Failover - Groq
    if (!aiResponseText && groqKey && groqKey.startsWith('gsk_')) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
              { role: 'user', content: userMessage },
            ],
            max_tokens: 1500,
            temperature: 0.2,
          }),
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          aiResponseText = groqData.choices?.[0]?.message?.content || '';
        }
      } catch (groqErr) {
        console.warn('[OptiTrack AI] Groq fallback error:', groqErr);
      }
    }

    // Step C: High-Intelligence Autonomous Telemetry Fallback (Zero-Config)
    if (!aiResponseText || !aiResponseText.trim()) {
      aiResponseText = generateAutonomousWarehouseResponse(
        userMessage,
        warehouseSnapshot,
        products,
        inventory,
        transactions,
        locations,
        categories
      );
    }

    return NextResponse.json({ response: aiResponseText });
  } catch (err: any) {
    console.error('[AI Chat Route Error]:', err);
    return NextResponse.json(
      { response: 'Temporary connection error. Please try again.' },
      { status: 500 }
    );
  }
}

function generateAutonomousWarehouseResponse(
  query: string,
  snapshot: any,
  products: any[],
  inventory: any[],
  transactions: any[],
  locations: any[],
  categories: any[]
): string {
  const q = query.toLowerCase();

  // 1. Stock Velocity / Burn Rate / Draft POs / Reorder
  if (
    q.includes('velocity') ||
    q.includes('burn') ||
    q.includes('rate') ||
    q.includes('po') ||
    q.includes('order') ||
    q.includes('reorder') ||
    q.includes('replenish') ||
    q.includes('suggest')
  ) {
    const items = snapshot.predictive_velocity_and_forecasting || [];
    const urgentItems = items.filter((i: any) => i.status !== 'HEALTHY');
    const displayList = urgentItems.length > 0 ? urgentItems : items.slice(0, 6);

    let markdown = `### 📊 Stock Velocity & Demand Analysis\n\n`;
    markdown += `Based on live transaction telemetry across the past 30 days, here is the current consumption velocity and replenishment forecast:\n\n`;
    markdown += `| SKU | Product Name | Stock | Daily Burn | Days of Inv. | Status |\n`;
    markdown += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    displayList.forEach((item: any) => {
      const badge =
        item.status === 'CRITICAL_DEPLETED'
          ? '**[CRITICAL]**'
          : item.status === 'URGENT_REORDER'
          ? '**[URGENT]**'
          : '[HEALTHY]';
      markdown += `| \`${item.sku}\` | ${item.name} | ${item.current_stock} units | ${item.daily_burn_rate} | ${item.days_of_inventory_left} | ${badge} |\n`;
    });

    const reorderCandidate = displayList.find((i: any) => i.suggested_reorder_qty > 0) || items[0];
    if (reorderCandidate) {
      const poNum = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      markdown += `\n\n---\n\n### 📦 Recommended Draft Purchase Order (${poNum})\n\n`;
      markdown += `| Field | Details |\n`;
      markdown += `| :--- | :--- |\n`;
      markdown += `| **Vendor / Supplier** | ${reorderCandidate.supplier || 'Primary Logistics Partner'} |\n`;
      markdown += `| **Target SKU** | \`${reorderCandidate.sku}\` — ${reorderCandidate.name} |\n`;
      markdown += `| **Suggested Order Qty** | **${reorderCandidate.suggested_reorder_qty} units** |\n`;
      markdown += `| **Estimated Unit Cost** | $${reorderCandidate.cost_price.toFixed(2)} USD |\n`;
      markdown += `| **Total Budget Allocation** | **$${reorderCandidate.draft_po_estimate.toFixed(2)} USD** |\n\n`;
      markdown += `> 💡 **One-Click Action**: You can approve or adjust this Purchase Order directly via the **Reorder Agent** modal with 1 click.`;
    }

    return markdown;
  }

  // 2. 7-Day Stockout Risk
  if (
    q.includes('stockout') ||
    q.includes('risk') ||
    q.includes('7-day') ||
    q.includes('7 day') ||
    q.includes('deplet') ||
    q.includes('run out') ||
    q.includes('runout')
  ) {
    const items = snapshot.predictive_velocity_and_forecasting || [];
    const atRisk = items.filter((i: any) => i.status === 'CRITICAL_DEPLETED' || i.status === 'URGENT_REORDER');

    let markdown = `### ⚠️ 7-Day Stockout Risk Assessment\n\n`;
    if (atRisk.length === 0) {
      markdown += `✅ **All registered SKUs are currently operating safely.** No items are forecasted to stock out within the next 7 days based on current outbound consumption velocity.\n\n`;
      markdown += `* Monitored products: **${items.length} SKUs**\n`;
      markdown += `* Facility stock health: **Optimal**\n`;
    } else {
      markdown += `🚨 **Attention Needed**: **${atRisk.length} items** are approaching depletion within the next 7 business days:\n\n`;
      markdown += `| SKU | Product | Stock On-Hand | Daily Burn | Run-Out Window | Action |\n`;
      markdown += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      atRisk.forEach((i: any) => {
        markdown += `| \`${i.sku}\` | ${i.name} | ${i.current_stock} | ${i.daily_burn_rate} | **${i.days_of_inventory_left}** | Expedite PO (+${i.suggested_reorder_qty} units) |\n`;
      });
      markdown += `\n\n**Recommended Next Steps**:\n`;
      markdown += `1. Create an expedited inbound purchase order for flagged items.\n`;
      markdown += `2. Rebalance inventory across storage zones if reserve units exist in other bays.\n`;
    }
    return markdown;
  }

  // 3. Low Stock Levels & Shortages
  if (
    q.includes('low stock') ||
    q.includes('shortage') ||
    q.includes('stock level') ||
    q.includes('safety')
  ) {
    const shortages = snapshot.low_stock_shortages || [];
    let markdown = `### 📉 Warehouse Low Stock & Shortage Status\n\n`;
    if (shortages.length === 0) {
      markdown += `✅ **No low-stock shortages detected.** All inventory items are stocked at or above minimum safety thresholds.\n`;
    } else {
      markdown += `Identified **${shortages.length} SKUs** below safety stock levels:\n\n`;
      markdown += `| SKU | Product Name | Location | Current Qty | Min Safety | Shortage | Replenishment |\n`;
      markdown += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      shortages.forEach((s: any) => {
        markdown += `| \`${s.sku}\` | ${s.name} | ${s.location} | **${s.current_stock}** | ${s.min_stock_level} | -${s.shortage} | **+${s.suggested_reorder}** units |\n`;
      });
    }
    return markdown;
  }

  // 4. Valuation, Margins & Financial Breakdown
  if (
    q.includes('valuation') ||
    q.includes('value') ||
    q.includes('profit') ||
    q.includes('margin') ||
    q.includes('financial') ||
    q.includes('cost') ||
    q.includes('worth') ||
    q.includes('price')
  ) {
    const sum = snapshot.summary || {};
    const catMap = snapshot.categories || {};
    let markdown = `### 💰 Working Capital & Financial Valuation Breakdown\n\n`;
    markdown += `| Financial Metric | Value (USD) | Summary Notes |\n`;
    markdown += `| :--- | :--- | :--- |\n`;
    markdown += `| **Gross Market Valuation** | **$${Number(sum.total_market_valuation || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}** | Potential revenue at current retail pricing |\n`;
    markdown += `| **Total Cost Basis** | **$${Number(sum.total_cost_basis || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}** | Capital invested in on-hand inventory |\n`;
    markdown += `| **Unrealized Gross Margin** | **+$${Number(sum.potential_profit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}** | Projected operational gross return |\n`;
    markdown += `| **Margin Percentage** | **+${sum.profit_margin_percent || '0%'}** | Aggregate margin yield |\n\n`;

    const catKeys = Object.keys(catMap);
    if (catKeys.length > 0) {
      markdown += `#### Category Value Distribution\n\n`;
      markdown += `| Category | SKUs | Total Units | Inventory Valuation |\n`;
      markdown += `| :--- | :--- | :--- | :--- |\n`;
      catKeys.forEach((cat) => {
        const c = catMap[cat];
        markdown += `| **${cat}** | ${c.count} SKUs | ${c.units} units | $${Number(c.value).toLocaleString(undefined, { minimumFractionDigits: 2 })} |\n`;
      });
    }
    return markdown;
  }

  // 5. Zones & Facility Capacity
  if (
    q.includes('zone') ||
    q.includes('location') ||
    q.includes('capacity') ||
    q.includes('space') ||
    q.includes('storage') ||
    q.includes('headroom') ||
    q.includes('utilization')
  ) {
    let markdown = `### 🏢 Warehouse Zones & Space Utilization\n\n`;
    if (locations.length === 0) {
      markdown += `No custom storage zones have been configured yet. You can create zones under the **Inventory** page.\n`;
    } else {
      markdown += `| Zone Name | Stored Units | Max Capacity | Utilization | Allocation Status |\n`;
      markdown += `| :--- | :--- | :--- | :--- | :--- |\n`;
      locations.forEach((loc: any) => {
        const stored = (inventory || [])
          .filter((i: any) => i.location === loc.name)
          .reduce((acc: number, i: any) => acc + (Number(i.quantity) || 0), 0);
        const cap = Number(loc.capacity) || 0;
        const pct = cap > 0 ? Math.min(100, Math.round((stored / cap) * 100)) : 0;
        const status = pct > 90 ? '🔴 High Density' : pct > 75 ? '🟡 Moderate' : '🟢 Optimal Headroom';
        markdown += `| **${loc.name}** | ${stored.toLocaleString()} units | ${cap.toLocaleString()} units | ${pct}% | ${status} |\n`;
      });
    }
    return markdown;
  }

  // 6. Recent Movements / Transactions
  if (
    q.includes('movement') ||
    q.includes('transaction') ||
    q.includes('history') ||
    q.includes('inbound') ||
    q.includes('outbound') ||
    q.includes('audit') ||
    q.includes('recent')
  ) {
    const txs = snapshot.recent_movements || [];
    let markdown = `### 📋 Recent Warehouse Transaction Movements\n\n`;
    if (txs.length === 0) {
      markdown += `No transaction movements recorded yet.\n`;
    } else {
      markdown += `| Ref Code | Type | SKU / Product | Quantity | Date |\n`;
      markdown += `| :--- | :--- | :--- | :--- | :--- |\n`;
      txs.slice(0, 8).forEach((t: any) => {
        const badge = t.type === 'INBOUND' ? '🟢 INBOUND' : '🔵 OUTBOUND';
        markdown += `| \`${t.ref_code}\` | ${badge} | \`${t.sku}\` — ${t.product_name} | ${t.quantity} | ${t.date} |\n`;
      });
    }
    return markdown;
  }

  // 7. Default Overview Briefing
  const sum = snapshot.summary || {};
  const shortages = snapshot.low_stock_shortages || [];
  return `### 🤖 OptiTrack Warehouse Operations Briefing

Welcome! I am your real-time **OptiTrack Operations Copilot**. Here is your current facility status:

* **Active SKUs**: **${sum.total_skus || 0} items** across **${sum.total_categories || 0} categories**
* **Total Physical Stock**: **${Number(sum.total_units || 0).toLocaleString()} units** on-hand
* **Total Inventory Valuation**: **$${Number(sum.total_market_valuation || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD** (Margin: **+${sum.profit_margin_percent || '0%'}**)
* **Active Storage Zones**: **${sum.total_zones || 0} zones** monitored
* **Safety Stock Alerts**: ${shortages.length > 0 ? `🚨 **${shortages.length} item(s) below safety threshold**` : '✅ **All stock levels healthy**'}

---

#### 💡 Suggested Quick Actions:
1. **"Analyze stock velocity and draft POs"** — calculate burn rate and generate one-click reorder suggestions.
2. **"Forecast 7-day stockout risk"** — identify products needing urgent supply-chain attention.
3. **"Show inventory valuation by category"** — breakdown of cost basis, selling price, and profit margins.
4. **"Check zone capacity and space allocation"** — view density across warehouse bays.`;
}
