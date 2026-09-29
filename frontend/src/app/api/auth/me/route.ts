import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, verifySessionToken } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

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

export async function PUT(req: NextRequest) {
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
      const url = body.image_url;
      // https URL, /uploads path, or an image data URL (what upload-image stores).
      const safe =
        url === null ||
        url === '' ||
        (typeof url === 'string' &&
          /^(https:\/\/\S+|\/uploads\/[\w./-]+|data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+)$/.test(url));
      if (!safe || (typeof url === 'string' && url.length > 3_000_000)) {
        return NextResponse.json({ detail: 'image_url is not an allowed image URL' }, { status: 422 });
      }
      updateData.image_url = url || null;
    }
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ detail: 'No editable fields provided' }, { status: 422 });
    }

    const userRes = await supabaseRest(`users?id=eq.${payload.sub}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    });

    if (!userRes.ok) {
      return NextResponse.json({ detail: await userRes.text() }, { status: 400 });
    }

    const updatedUsers = await userRes.json();
    const updated = updatedUsers[0] || updateData;

    return NextResponse.json({
      id: updated.id || Number(payload.sub),
      email: updated.email || payload.email,
      first_name: updated.first_name,
      last_name: updated.last_name,
      role: updated.role || payload.role,
      image_url: updated.image_url,
      is_active: updated.is_active ?? true,
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || 'Failed to update profile' }, { status: 500 });
  }
}