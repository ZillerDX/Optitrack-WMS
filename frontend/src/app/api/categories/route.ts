import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

const DEFAULT_CATEGORIES = ['Electronics', 'Machinery', 'Raw Materials', 'Apparel', 'Food & Beverage'];

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json([]);

    const res = await supabaseRest(`categories?owner_id=eq.${user.id}&select=*&order=name.asc`);
    if (!res.ok) return NextResponse.json([]);
    let data = await res.json();

    // Auto-seed standard categories for user if none exist
    if (Array.isArray(data) && data.length === 0) {
      const seedPromises = DEFAULT_CATEGORIES.map(name =>
        supabaseRest('categories', {
          method: 'POST',
          body: JSON.stringify({ owner_id: user.id, name }),
        })
      );
      await Promise.all(seedPromises);
      const reRes = await supabaseRest(`categories?owner_id=eq.${user.id}&select=*&order=name.asc`);
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
    const res = await supabaseRest('categories', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: user.id,
        name: body.name,
      }),
    });
    if (!res.ok) return NextResponse.json({ detail: await res.text() }, { status: 400 });
    const created = await res.json();
    return NextResponse.json(created[0]);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}