import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

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
      // Concurrent first loads all reach this point; ignore-duplicates keeps the
      // seeding idempotent (unique owner_id + name) instead of creating copies.
      const seedPromises = DEFAULT_CATEGORIES.map(name =>
        supabaseRest('categories?on_conflict=owner_id,name', {
          method: 'POST',
          headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
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

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 100) {
      return NextResponse.json({ detail: 'name is required (max 100 characters)' }, { status: 422 });
    }

    const res = await supabaseRest('categories', {
      method: 'POST',
      body: JSON.stringify({ owner_id: user.id, name }),
    });
    if (res.status === 409) {
      // uq_categories_owner_name
      return NextResponse.json({ detail: `Category '${name}' already exists` }, { status: 409 });
    }
    if (!res.ok) {
      console.error('[Create Category Error]:', await res.text());
      return NextResponse.json({ detail: 'Failed to create category' }, { status: 400 });
    }
    const created = await res.json();
    return NextResponse.json(created[0]);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}