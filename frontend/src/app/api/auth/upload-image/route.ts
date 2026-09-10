import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ detail: 'No image file uploaded' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { detail: 'Invalid file format. Please upload JPG, PNG, WEBP, or GIF.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { detail: 'File size exceeds 2MB limit. Please choose a smaller image.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`;

    // Update user image_url in Supabase
    const updateRes = await supabaseRest(`users?id=eq.${authUser.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ image_url: dataUrl }),
    });

    if (!updateRes.ok) {
      console.error('[Upload Image DB Error]:', await updateRes.text());
      return NextResponse.json(
        { detail: 'Failed to save uploaded image to database.' },
        { status: 500 }
      );
    }

    // Fetch refreshed user record
    const userRes = await supabaseRest(`users?id=eq.${authUser.id}&select=*`);
    if (!userRes.ok) {
      return NextResponse.json(
        { detail: 'Failed to retrieve updated user profile.' },
        { status: 500 }
      );
    }

    const users = await userRes.json();
    const updated = users[0];

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      first_name: updated.first_name,
      last_name: updated.last_name,
      role: updated.role,
      image_url: updated.image_url,
      is_active: updated.is_active,
    });
  } catch (err: any) {
    console.error('[Upload Image Error]:', err);
    return NextResponse.json(
      { detail: err.message || 'Internal server error while uploading image.' },
      { status: 500 }
    );
  }
}
