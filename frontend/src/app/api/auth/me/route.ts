import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';
import { isAllowedAvatarUrl } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
    }

    const userRes = await supabaseRest(`users?id=eq.${authUser.id}&select=*`);
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
    console.error('[Get Me Error]:', error);
    return NextResponse.json({ detail: 'Error fetching user' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();

    // Self-service profile edit: only display fields. email / role / is_active /
    // password_hash are never taken from the client, and unknown fields are rejected.
    const EDITABLE = ['first_name', 'last_name', 'image_url'];
    const unknown = Object.keys(body).filter((k) => !EDITABLE.includes(k));
    if (unknown.length > 0) {
      return NextResponse.json(
        { detail: `Field(s) not editable: ${unknown.join(', ')}` },
        { status: 422 }
      );
    }

    const updateData: Record<string, string | null> = {};
    for (const key of ['first_name', 'last_name'] as const) {
      if (body[key] === undefined) continue;
      const value = typeof body[key] === 'string' ? body[key].trim() : '';
      if (!value || value.length > 100) {
        return NextResponse.json({ detail: `${key} must be 1-100 characters` }, { status: 422 });
      }
      updateData[key] = value;
    }
    if (body.image_url !== undefined) {
      if (!isAllowedAvatarUrl(body.image_url)) {
        return NextResponse.json({ detail: 'image_url is not an allowed image URL' }, { status: 422 });
      }
      updateData.image_url = body.image_url || null;
    }
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ detail: 'No editable fields provided' }, { status: 422 });
    }

    const userRes = await supabaseRest(`users?id=eq.${authUser.id}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    });

    if (!userRes.ok) {
      console.error('[Update Me Error]:', await userRes.text());
      return NextResponse.json({ detail: 'Failed to update profile' }, { status: 400 });
    }

    const updatedUsers = await userRes.json();
    const updated = updatedUsers[0] || updateData;

    return NextResponse.json({
      id: updated.id || authUser.id,
      email: updated.email || authUser.email,
      first_name: updated.first_name,
      last_name: updated.last_name,
      role: updated.role || authUser.role,
      image_url: updated.image_url,
      is_active: updated.is_active ?? true,
    });
  } catch (error: any) {
    console.error('[Update Me Error]:', error);
    return NextResponse.json({ detail: 'Failed to update profile' }, { status: 500 });
  }
}