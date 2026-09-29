import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';
import { updateLocation } from '@/lib/stock';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeId } = await params;
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const id = Number(routeId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ detail: 'Invalid location id' }, { status: 400 });
    }

    const body = await req.json();

    // Whitelist editable fields: owner_id / id must never be client-controlled
    // (they would move the location to another tenant).
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 50) {
        return NextResponse.json({ detail: 'name must be 1-50 characters' }, { status: 422 });
      }
      update.name = name;
    }
    if (body.capacity !== undefined) {
      const capacity = Number(body.capacity);
      if (!Number.isInteger(capacity) || capacity < 0) {
        return NextResponse.json({ detail: 'capacity must be a non-negative integer' }, { status: 422 });
      }
      update.capacity = capacity;
    }
    if (body.description !== undefined) {
      const d = body.description;
      if (d !== null && (typeof d !== 'string' || d.length > 255)) {
        return NextResponse.json({ detail: 'description must be at most 255 characters' }, { status: 422 });
      }
      update.description = d ? d.trim() || null : null;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ detail: 'No editable fields provided' }, { status: 422 });
    }

    // One database transaction: a rename also moves the stock and history that reference the name.
    const result = await updateLocation({
      userId: user.id,
      locationId: id,
      patch: update as { name?: string; capacity?: number; description?: string | null },
    });
    if (!result.ok) {
      return NextResponse.json({ detail: result.detail }, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (err: any) {
    console.error('[PUT Location Error]:', err);
    return NextResponse.json({ detail: 'Failed to update location' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeId } = await params;
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const res = await supabaseRest(`locations?id=eq.${routeId}&owner_id=eq.${user.id}`, { method: 'DELETE' });
    if (!res.ok) return NextResponse.json({ detail: await res.text() }, { status: 400 });
    return NextResponse.json({ message: 'Location deleted' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}