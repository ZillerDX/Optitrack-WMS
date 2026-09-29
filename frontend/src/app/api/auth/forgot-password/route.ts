import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, createPasswordResetToken } from '@/lib/supabase';
import { sendPasswordResetEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

const GENERIC_RESPONSE = {
  success: true,
  message: 'If the email is registered, a reset link has been sent to your inbox.',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email || !email.includes('@') || email.length > 255) {
      return NextResponse.json(
        { detail: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    // The link base comes from configuration, never from request headers: a
    // spoofed Host/Origin would otherwise point the emailed link (and token) at an attacker.
    const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
    if (!appUrl) {
      console.error('[Forgot Password] APP_URL is not configured; cannot build a reset link');
      return NextResponse.json(GENERIC_RESPONSE);
    }

    try {
      const userRes = await supabaseRest(
        `users?email=eq.${encodeURIComponent(email)}&select=id,email,password_hash,is_active`
      );
      if (userRes.ok) {
        const users = await userRes.json();
        const user = Array.isArray(users) ? users[0] : null;
        if (user && user.is_active) {
          const token = await createPasswordResetToken(user.id, user.password_hash);
          const sent = await sendPasswordResetEmail(
            user.email,
            `${appUrl}/reset-password?token=${encodeURIComponent(token)}`
          );
          if (!sent) console.warn(`[Forgot Password] email not delivered for user ${user.id}`);
        }
      } else {
        console.error('[Forgot Password] user lookup failed:', await userRes.text());
      }
    } catch (innerErr) {
      console.error('[Forgot Password] processing error:', innerErr);
    }

    // Identical response whether or not the account exists (no enumeration).
    return NextResponse.json(GENERIC_RESPONSE);
  } catch (err: any) {
    console.error('[Forgot Password Error]:', err);
    return NextResponse.json(
      { detail: 'Internal server error while processing password reset.' },
      { status: 500 }
    );
  }
}
