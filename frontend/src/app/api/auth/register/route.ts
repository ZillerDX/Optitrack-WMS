import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import bcrypt from 'bcryptjs';
import { supabaseRest } from '@/lib/supabase';
import { isSignupAllowed, SIGNUP_RESTRICTED_MESSAGE } from '@/lib/signup';
import { isValidEmail, PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const limited = await rateLimit(req, { name: 'register', limit: 5, windowSeconds: 60 });
    if (limited) return limited;
    const { email, password, first_name, last_name } = body;

    const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
    if (typeof email !== 'string' || typeof password !== 'string' || !isText(first_name, 100) || !isText(last_name, 100) || !email.trim() || !password) {
      return NextResponse.json(
        { detail: 'First name, last name (max 100 characters each), email, and password are required.' },
        { status: 400 }
      );
    }
    if (!isValidEmail(email.trim())) {
      return NextResponse.json({ detail: 'Enter a valid email address.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isSignupAllowed(normalizedEmail)) {
      return NextResponse.json({ detail: SIGNUP_RESTRICTED_MESSAGE }, { status: 403 });
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      return NextResponse.json(
        { detail: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.` },
        { status: 400 }
      );
    }
    // bcrypt ignores everything after 72 bytes, so a longer password would not really be checked in full
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
      return NextResponse.json(
        { detail: `Password must be at most ${PASSWORD_MAX_BYTES} bytes long.` },
        { status: 400 }
      );
    }

    // 1. Check if email already registered in Supabase
    const checkRes = await supabaseRest(`users?email=eq.${encodeURIComponent(normalizedEmail)}&select=id`);
    if (checkRes.ok) {
      const existing = await checkRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        return NextResponse.json(
          { detail: 'Email already registered' },
          { status: 400 }
        );
      }
    }

    // 2. Hash password
    const password_hash = bcrypt.hashSync(password, 10);

    // 3. Insert user into Supabase
    const insertRes = await supabaseRest('users', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password_hash,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        role: 'ADMIN', // single-role system; never trust a client-supplied role
        is_active: true,
      }),
    });

    if (!insertRes.ok) {
      const errorText = await insertRes.text();
      console.error('[Supabase Register Error]:', errorText);
      return NextResponse.json(
        { detail: 'Failed to create user account in database.' },
        { status: 500 }
      );
    }

    const createdUsers = await insertRes.json();
    const newUser = createdUsers[0];

    return NextResponse.json({
      id: newUser.id,
      email: newUser.email,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      role: newUser.role,
      image_url: newUser.image_url,
      is_active: newUser.is_active,
    });
  } catch (error: any) {
    console.error('[Register API Error]:', error);
    let detail = 'Internal server error during registration.';
    const raw = String(error?.message ?? '');
    if (raw === 'fetch failed' || raw.includes('ENOTFOUND') || raw.includes('ECONNREFUSED')) {
      detail = 'Database connection error: Service temporarily unreachable. Please try again shortly.';
    }
    return NextResponse.json(
      { detail },
      { status: 500 }
    );
  }
}