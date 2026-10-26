import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase';
import { getDashboardSummary } from '@/lib/stock';

export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;
/** An IANA zone name such as Asia/Bangkok or America/Argentina/Buenos_Aires; the database checks that it exists. */
const TIME_ZONE = /^[A-Za-z0-9_+\-]+(\/[A-Za-z0-9_+\-]+){0,2}$/;

/**
 * Dashboard figures for the session user, computed in the database over all rows (never over a cut list).
 * Query: location (a name, or ALL), days (1-366, default 30), tz (default UTC; the days are cut in this zone).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get('days');
    const days = daysParam === null || daysParam === '' ? DEFAULT_DAYS : Number(daysParam);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS || !/^\d+$/.test(daysParam ?? '1')) {
      return NextResponse.json({ detail: `days must be an integer from 1 to ${MAX_DAYS}` }, { status: 400 });
    }
    const tz = (searchParams.get('tz') ?? '').trim() || 'UTC';
    if (tz.length > 64 || !TIME_ZONE.test(tz)) {
      return NextResponse.json({ detail: 'tz must be a time zone name such as Asia/Bangkok' }, { status: 400 });
    }
    const location = (searchParams.get('location') ?? '').trim();
    if (location.length > 50) {
      return NextResponse.json({ detail: 'location must be at most 50 characters' }, { status: 400 });
    }

    const result = await getDashboardSummary({ userId: user.id, location: location || null, days, tz });
    if (!result.ok) {
      return NextResponse.json({ detail: result.detail }, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (err: any) {
    console.error('[GET Dashboard Summary Error]:', err);
    return NextResponse.json({ detail: 'Failed to load data' }, { status: 500 });
  }
}
