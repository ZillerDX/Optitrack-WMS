import { NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';

export async function GET() {
  try {
    const [invRes, locRes] = await Promise.all([
      supabaseRest('inventory?select=quantity'),
      supabaseRest('locations?select=capacity'),
    ]);

    let totalQty = 0;
    let totalCap = 0;

    if (invRes.ok) {
      const items = await invRes.json();
      if (Array.isArray(items)) {
        totalQty = items.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 0), 0);
      }
    }

    if (locRes.ok) {
      const locs = await locRes.json();
      if (Array.isArray(locs)) {
        totalCap = locs.reduce((acc: number, loc: any) => acc + (Number(loc.capacity) || 0), 0);
      }
    }

    const pct = totalCap > 0 ? Math.min(100, Math.round((totalQty / totalCap) * 100)) : 0;
    const label = `${totalQty} / ${totalCap > 0 ? totalCap : 'Unlimited'} items (${pct}%)`;

    return NextResponse.json({
      warehouse_capacity_pct: pct,
      warehouse_capacity_label: label,
    });
  } catch (err: any) {
    return NextResponse.json({
      warehouse_capacity_pct: 0,
      warehouse_capacity_label: '0 / 0 (0%)',
    });
  }
}