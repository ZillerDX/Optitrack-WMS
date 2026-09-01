import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';

export async function GET() {
  try {
    const res = await supabaseRest('categories?select=*&order=name.asc');
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await supabaseRest('categories', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: 1,
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