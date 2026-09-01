import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseRest } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, first_name, last_name, role } = body;

    if (!email || !password || !first_name || !last_name) {
      return NextResponse.json(
        { detail: 'First name, last name, email, and password are required.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { detail: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    // 1. Check if email already registered in Supabase
    const checkRes = await supabaseRest(`users?email=eq.${encodeURIComponent(email)}&select=id`);
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
        role: role || 'ADMIN',
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
    return NextResponse.json(
      { detail: error.message || 'Internal server error during registration.' },
      { status: 500 }
    );
  }
}