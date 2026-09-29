import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser, clearAuthCache } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Log out and revoke every session of this user (all devices) by bumping
 * token_version; a stolen token stops working instead of living until it expires.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (user) {
      const res = await supabaseRest(`users?id=eq.${user.id}&select=token_version`);
      const rows = res.ok ? await res.json() : [];
      const current = Number(rows?.[0]?.token_version) || 0;
      await supabaseRest(`users?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ token_version: current + 1 }),
      });
      clearAuthCache(user.id);
    }
  } catch (err) {
    console.error('[Logout Error]:', err);
  }
  return NextResponse.json({ success: true, message: 'Logged out successfully' });
}
