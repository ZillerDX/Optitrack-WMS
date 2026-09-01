import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const id = params.id;
    const res = await supabaseRest(`products?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json({ detail: await res.text() }, { status: 400 });
    }
    const updated = await res.json();
    return NextResponse.json(updated[0] || body);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const res = await supabaseRest(`products?id=eq.${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      return NextResponse.json({ detail: await res.text() }, { status: 400 });
    }
    return NextResponse.json({ message: 'Deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}