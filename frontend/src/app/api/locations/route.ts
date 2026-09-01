import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

const DEFAULT_ZONES = [
  { name: 'Zone A-01', description: 'Main Storage - High Velocity Racks', capacity: 500 },
  { name: 'Zone B-02', description: 'Secondary Storage - Heavy Equipment', capacity: 300 },
  { name: 'Cold Storage C-01', description: 'Temperature Controlled Zone', capacity: 100 },
];

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json([]);

    const res = await supabaseRest(`locations?owner_id=eq.${user.id}&select=*&order=name.asc`);
    if (!res.ok) return NextResponse.json([]);
    let data = await res.json();

    // Auto-seed standard warehouse zones for this user if they don't have any yet
    if (Array.isArray(data) && data.length === 0) {
      const seedPromises = DEFAULT_ZONES.map(z => 
        supabaseRest('locations', {
          method: 'POST',
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
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const res = await supabaseRest('locations', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: user.id,
        name: body.name,
        description: body.description || null,
        capacity: Number(body.capacity) || 0,
      }),
    });
    if (!res.ok) return NextResponse.json({ detail: await res.text() }, { status: 400 });
    const created = await res.json();
    return NextResponse.json(created[0]);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}