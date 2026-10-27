import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { rateLimit } from '@/lib/rateLimit';
import { createSessionToken } from '@/lib/supabase';
import { setSessionCookie } from '@/lib/session';
import { createDemoAccount } from '@/lib/stock';

export const dynamic = 'force-dynamic';

/**
 * Reviewer demo: creates a throw-away account with mock data and signs it in. Public by design, so it is
 * limited per address and the database caps how many demo accounts can be alive (0014_reviewer_demo.sql).
 * The password is random and thrown away: the account can only be entered through this route.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { name: 'demo', limit: 6, windowSeconds: 3600 });
    if (limited) return limited;

    // cost 4 is enough for a password nobody will ever see, and keeps this call fast
    const passwordHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 4);
    const created = await createDemoAccount(passwordHash);
    if (!created.ok) {
      const detail = created.status === 503 ? 'The demo is not available right now. Please try again later.' : created.detail;
      return NextResponse.json({ detail }, { status: created.status });
    }

    const user = created.data;
    const token = await createSessionToken({ sub: String(user.id), email: user.email, role: user.role, tv: Number(user.token_version) || 0 });
    return setSessionCookie(
      NextResponse.json({
        token_type: 'cookie',
        user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role, image_url: user.image_url, is_active: user.is_active, is_demo: true },
      }),
      token
    );
  } catch (err) {
    console.error('[Demo Error]:', err);
    return NextResponse.json({ detail: 'Could not start the demo. Please try again.' }, { status: 500 });
  }
}
