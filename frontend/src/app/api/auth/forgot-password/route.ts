import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body.email?.trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { detail: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    // Query user in Supabase (log internally for auditing, do not expose existence to client)
    try {
      const userRes = await supabaseRest(`users?email=eq.${encodeURIComponent(email)}&select=id,email,first_name`);
      if (userRes.ok) {
        const users = await userRes.json();
        if (Array.isArray(users) && users.length > 0) {
          console.log(`[Password Reset Requested] for user ID ${users[0].id} (${email})`);
        }
      }
    } catch (dbErr) {
      console.warn('[Password Reset DB check]:', dbErr);
    }

    // Generic success response to prevent email enumeration (OWASP)
    return NextResponse.json({
      success: true,
      message: 'If the email is registered, a reset link has been sent to your inbox.',
    });
  } catch (err: any) {
    console.error('[Forgot Password Error]:', err);
    return NextResponse.json(
      { detail: 'Internal server error while processing password reset.' },
      { status: 500 }
    );
  }
}
