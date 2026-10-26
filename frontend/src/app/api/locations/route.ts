import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const DEFAULT_ZONES = [
  { name: 'Zone A-01', description: 'Main Storage - High Velocity Racks', capacity: 500 },
  { name: 'Zone B-02', description: 'Secondary Storage - Heavy Equipment', capacity: 300 },
  { name: 'Cold Storage C-01', description: 'Temperature Controlled Zone', capacity: 100 },
];

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const res = await supabaseRest(`locations?owner_id=eq.${user.id}&select=*&order=name.asc`);
    if (!res.ok) return NextResponse.json({ detail: 'Failed to load data' }, { status: 500 });
    let data = await res.json();

    // Auto-seed standard warehouse zones for this user if they don't have any yet
    if (Array.isArray(data) && data.length === 0) {
      // Concurrent first loads all reach this point; ignore-duplicates keeps the
      // seeding idempotent (unique owner_id + name) instead of creating copies.
      const seedPromises = DEFAULT_ZONES.map(z =>
        supabaseRest('locations?on_conflict=owner_id,name', {
          method: 'POST',
          headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
          body: JSON.stringify({
            owner_id: user.id,
            name: z.name,
            description: z.description,
            capacity: z.capacity,
          }),
        })
      );
      await Promise.all(seedPromises);
      const reRes = await supabaseRest(`locations?owner_id=eq.${user.id}&select=*&order=name.asc`);
      if (reRes.ok) {
        data = await reRes.json();
      }
    }

    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch {
    return NextResponse.json({ detail: 'Failed to load data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 50) {
      return NextResponse.json({ detail: 'name is required (max 50 characters)' }, { status: 422 });
    }
    const capacity = Number(body.capacity ?? 0);
    if (!Number.isInteger(capacity) || capacity < 0) {
      return NextResponse.json({ detail: 'capacity must be a non-negative integer' }, { status: 422 });
    }
    const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
    if (description && description.length > 255) {
      return NextResponse.json({ detail: 'description must be at most 255 characters' }, { status: 422 });
    }

    const res = await supabaseRest('locations', {
      method: 'POST',
      body: JSON.stringify({ owner_id: user.id, name, description, capacity }),
    });
    if (res.status === 409) {
      // uq_locations_owner_name
      return NextResponse.json({ detail: `Location '${name}' already exists` }, { status: 409 });
    }
    if (!res.ok) {
      console.error('[Create Location Error]:', await res.text());
      return NextResponse.json({ detail: 'Failed to create location' }, { status: 400 });
    }
    const created = await res.json();
    return NextResponse.json(created[0]);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}