import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await supabaseRest(`categories?id=eq.${params.id}`, { method: 'DELETE' });
    if (!res.ok) return NextResponse.json({ detail: await res.text() }, { status: 400 });
    return NextResponse.json({ message: 'Category deleted' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}