import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, verifySessionToken } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
    }

    const payload = await verifySessionToken(token);
    if (!payload || !payload.sub) {
      return NextResponse.json({ detail: 'Invalid or expired token' }, { status: 401 });
    }

    const userRes = await supabaseRest(`users?id=eq.${payload.sub}&select=*`);
    if (!userRes.ok) {
      return NextResponse.json({ detail: 'User not found' }, { status: 404 });
    }

    const users = await userRes.json();
    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json({ detail: 'User not found' }, { status: 404 });
    }

    const user = users[0];
    return NextResponse.json({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      image_url: user.image_url,
      is_active: user.is_active,
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || 'Error fetching user' }, { status: 500 });
  }
}