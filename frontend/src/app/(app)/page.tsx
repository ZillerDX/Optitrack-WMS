import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** The address of the app itself: signed-in visitors go to the dashboard, everyone else to sign in. */
export default async function RootPage() {
  const jar = await cookies();
  redirect(jar.has(SESSION_COOKIE) ? '/dashboard' : '/login');
}
