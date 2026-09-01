import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseRest, createSessionToken } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { detail: 'Email and password are required.' },
        { status: 400 }
      );
    }

    // 1. Query user from Supabase
    const userRes = await supabaseRest(`users?email=eq.${encodeURIComponent(email.trim().toLowerCase())}&select=*`);
    if (!userRes.ok) {
      console.error('[Supabase Login Query Error]:', await userRes.text());
      return NextResponse.json(
        { detail: 'Database error while checking credentials.' },
        { status: 500 }
      );
    }

    const users = await userRes.json();
    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json(
        { detail: 'Incorrect email or password' },
        { status: 401 }
      );
    }

    const user = users[0];

    // 2. Verify password with bcrypt
    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { detail: 'Incorrect email or password' },
        { status: 401 }
      );
    }

    if (!user.is_active) {
      return NextResponse.json(
        { detail: 'User account is inactive' },
        { status: 403 }
      );
    }

    // 3. Generate JWT access token
    const access_token = await createSessionToken({
      sub: String(user.id),
      email: user.email,
      role: user.role,
    });

    const userResponse = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      image_url: user.image_url,
      is_active: user.is_active,
    };

    return NextResponse.json({
      access_token,
      token_type: 'bearer',
      user: userResponse,
    });
  } catch (error: any) {
    console.error('[Login API Error]:', error);
    return NextResponse.json(
      { detail: error.message || 'Internal server error during login.' },
      { status: 500 }
    );
  }
}