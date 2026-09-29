import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { supabaseRest, verifyPasswordResetToken, passwordFingerprint, clearAuthCache } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const INVALID_LINK = { detail: 'Invalid or expired reset link' };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const limited = await rateLimit(req, { name: 'reset', limit: 10, windowSeconds: 60 });
    if (limited) return limited;
    const token = typeof body.token === 'string' ? body.token : '';
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';

    if (newPassword.length < 6) {
      return NextResponse.json(
        { detail: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }
    // bcrypt only uses the first 72 bytes.
    if (Buffer.byteLength(newPassword, 'utf8') > 72) {
      return NextResponse.json(
        { detail: 'Password must be at most 72 bytes long.' },
        { status: 400 }
      );
    }

    const payload = await verifyPasswordResetToken(token);
    if (!payload) return NextResponse.json(INVALID_LINK, { status: 400 });

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json(INVALID_LINK, { status: 400 });
    }

    const userRes = await supabaseRest(`users?id=eq.${userId}&select=id,password_hash,is_active,token_version`);
    if (!userRes.ok) {
      return NextResponse.json({ detail: 'Could not reset password. Please try again.' }, { status: 500 });
    }
    const users = await userRes.json();
    const user = Array.isArray(users) ? users[0] : null;
    if (!user || !user.is_active) return NextResponse.json(INVALID_LINK, { status: 400 });

    // Single use: the fingerprint changes as soon as the password does.
    const expected = Buffer.from(passwordFingerprint(user.password_hash));
    const given = Buffer.from(payload.pwd);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return NextResponse.json(INVALID_LINK, { status: 400 });
    }

    const password_hash = bcrypt.hashSync(newPassword, 10);
    // Guard on the old hash so two concurrent uses of one link cannot both win.
    const patch = await supabaseRest(
      `users?id=eq.${userId}&password_hash=eq.${encodeURIComponent(user.password_hash)}`,
      {
        method: 'PATCH',
        // A new password ends every existing session.
        body: JSON.stringify({ password_hash, token_version: (Number(user.token_version) || 0) + 1 }),
      }
    );
    if (!patch.ok) {
      console.error('[Reset Password DB Error]:', await patch.text());
      return NextResponse.json({ detail: 'Could not reset password. Please try again.' }, { status: 500 });
    }
    const updated = await patch.json();
    if (!Array.isArray(updated) || updated.length === 0) {
      return NextResponse.json(INVALID_LINK, { status: 400 });
    }

    clearAuthCache(userId);
    return NextResponse.json({ message: 'Password has been reset. You can now sign in.' });
  } catch (err: any) {
    console.error('[Reset Password Error]:', err);
    return NextResponse.json({ detail: 'Could not reset password. Please try again.' }, { status: 500 });
  }
}
