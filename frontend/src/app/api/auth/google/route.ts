import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { supabaseRest, createSessionToken } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = body.credential?.trim();

    if (!token) {
      return NextResponse.json(
        { detail: 'Google credential token is required' },
        { status: 400 }
      );
    }

    // 1. Verify token with Google's tokeninfo API
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
    );

    if (!googleRes.ok) {
      const errDetail = await googleRes.text();
      console.warn('[Google Verification Failed]:', errDetail);
      return NextResponse.json(
        { detail: 'Invalid or expired Google token' },
        { status: 401 }
      );
    }

    const payload = await googleRes.json();
    const email = payload.email?.toLowerCase().trim();
    const email_verified = payload.email_verified === 'true' || payload.email_verified === true;

    if (!email || !email_verified) {
      return NextResponse.json(
        { detail: 'Google account must have a verified email address' },
        { status: 400 }
      );
    }

    const first_name = payload.given_name || (payload.name ? payload.name.split(' ')[0] : 'Google');
    const last_name =
      payload.family_name ||
      (payload.name && payload.name.split(' ').length > 1
        ? payload.name.split(' ').slice(1).join(' ')
        : 'User');
    const picture = payload.picture || null;

    // 2. Find user in Supabase or auto-create
    const userRes = await supabaseRest(`users?email=eq.${encodeURIComponent(email)}&select=*`);
    let user = null;

    if (userRes.ok) {
      const existing = await userRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        user = existing[0];
      }
    }

    if (user) {
      if (!user.is_active) {
        return NextResponse.json(
          { detail: 'User account is inactive' },
          { status: 403 }
        );
      }
      // Update image if missing
      if (!user.image_url && picture) {
        await supabaseRest(`users?id=eq.${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ image_url: picture }),
        });
        user.image_url = picture;
      }
    } else {
      // Auto-register new user
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const password_hash = bcrypt.hashSync(randomPassword, 10);

      const insertRes = await supabaseRest('users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password_hash,
          first_name,
          last_name,
          role: 'ADMIN',
          image_url: picture,
          is_active: true,
        }),
      });

      if (!insertRes.ok) {
        console.error('[Supabase Google User Create Error]:', await insertRes.text());
        return NextResponse.json(
          { detail: 'Failed to create user in database.' },
          { status: 500 }
        );
      }

      const created = await insertRes.json();
      user = created[0];
    }

    // 3. Create Session Token
    const access_token = await createSessionToken({
      sub: String(user.id),
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({
      access_token,
      token_type: 'bearer',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        image_url: user.image_url,
        is_active: user.is_active,
      },
    });
  } catch (error: any) {
    console.error('[Google API Error]:', error);
    return NextResponse.json(
      { detail: error.message || 'Internal server error during Google login.' },
      { status: 500 }
    );
  }
}