import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const res = await supabaseRest(`locations?id=eq.${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (!res.ok) return NextResponse.json({ detail: await res.text() }, { status: 400 });
    const updated = await res.json();
    return NextResponse.json(updated[0]);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await supabaseRest(`locations?id=eq.${params.id}`, { method: 'DELETE' });
    if (!res.ok) return NextResponse.json({ detail: await res.text() }, { status: 400 });
    return NextResponse.json({ message: 'Location deleted' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}