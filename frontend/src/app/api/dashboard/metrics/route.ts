import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({
        warehouse_capacity_pct: 0,
        warehouse_capacity_label: '0 / 0 (0%)',
      });
    }

    const { searchParams } = new URL(req.url);
    const location = searchParams.get('location');

    let invPath = `inventory?select=quantity,product:products!inner(owner_id)&product.owner_id=eq.${user.id}`;
    let locPath = `locations?owner_id=eq.${user.id}&select=capacity`;

    if (location && location !== 'ALL') {
      invPath += `&location=eq.${encodeURIComponent(location)}`;
      locPath += `&name=eq.${encodeURIComponent(location)}`;
    }

    const [invRes, locRes] = await Promise.all([
      supabaseRest(invPath),
      supabaseRest(locPath),
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
  } catch {
    return NextResponse.json({
      warehouse_capacity_pct: 0,
      warehouse_capacity_label: '0 / 0 (0%)',
    });
  }
}