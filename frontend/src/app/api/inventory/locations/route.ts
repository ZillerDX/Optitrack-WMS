import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, getAuthUser } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json([]);

    const res = await supabaseRest(`locations?owner_id=eq.${user.id}&select=name&order=name.asc`);
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    if (!Array.isArray(data)) return NextResponse.json([]);
    return NextResponse.json(data.map((l: any) => l.name));
  } catch {
    return NextResponse.json([]);
  }
}