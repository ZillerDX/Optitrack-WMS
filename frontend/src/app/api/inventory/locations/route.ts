import { NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';

export async function GET() {
  try {
    const res = await supabaseRest('locations?select=name&order=name.asc');
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    if (!Array.isArray(data)) return NextResponse.json([]);
    return NextResponse.json(data.map((l: any) => l.name));
  } catch {
    return NextResponse.json([]);
  }
}