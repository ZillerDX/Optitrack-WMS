import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase';
import { getDashboardSummary } from '@/lib/stock';

export const dynamic = 'force-dynamic';

/**
 * Storage usage of the warehouse (or one location). Computed by the database over every stock row
 * (it used to add up a list cut at 1000 rows). The new dashboard reads /api/dashboard/summary instead.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const location = (searchParams.get('location') ?? '').trim();
    if (location.length > 50) {
      return NextResponse.json({ detail: 'location must be at most 50 characters' }, { status: 400 });
    }

    const result = await getDashboardSummary({ userId: user.id, location: location || null, days: 1, tz: 'UTC' });
    if (!result.ok) {
      // an unknown location used to read as an empty one; keep that for old callers
      if (result.status === 404) {
        return NextResponse.json({ warehouse_capacity_pct: 0, warehouse_capacity_label: '0 items (no capacity set)' });
      }
      return NextResponse.json({ detail: result.detail }, { status: result.status === 503 ? 503 : 500 });
    }

    const locations: Array<{ capacity: number; used: number }> = result.data.locations ?? [];
    const totalQty = locations.reduce((sum, l) => sum + (Number(l.used) || 0), 0);
    const totalCap = locations.reduce((sum, l) => sum + (Number(l.capacity) || 0), 0);
    const pct = totalCap > 0 ? Math.min(100, Math.round((totalQty / totalCap) * 100)) : 0;
    // A location with capacity 0 accepts no stock at all (it is not "unlimited"): say that there is no capacity.
    const label = totalCap > 0 ? `${totalQty} / ${totalCap} items (${pct}%)` : `${totalQty} items (no capacity set)`;

    return NextResponse.json({ warehouse_capacity_pct: pct, warehouse_capacity_label: label });
  } catch {
    return NextResponse.json({ detail: 'Failed to load data' }, { status: 500 });
  }
}
