'use client';

import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiGet } from '@/lib/apiFetch';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/Logo';
import { Avatar } from '@/components/app/Avatar';
import { DashboardIcon, HistoryIcon, LogoutIcon, PlusIcon, ProductsIcon, SearchIcon, SettingsIcon, SparkIcon, StockIcon } from '@/components/app/icons';
import { useShellOverlays } from '@/components/app/useShellOverlays';

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
}

/**
 * The five places of the app. Routes are the ones the app has always had; Stock lives at /inventory and
 * History at /transactions until those pages are rebuilt.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { href: '/inventory', label: 'Stock', Icon: StockIcon },
  { href: '/products', label: 'Products', Icon: ProductsIcon },
  { href: '/transactions', label: 'History', Icon: HistoryIcon },
  { href: '/settings', label: 'Settings', Icon: SettingsIcon },
];

export interface CurrentUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  image_url?: string | null;
}

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export function useCurrentUser() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: ({ signal }) => apiGet<CurrentUser>('/api/auth/me', signal), staleTime: 5 * 60 * 1000 });
}

export function initials(user: Pick<CurrentUser, 'first_name' | 'last_name' | 'email'> | undefined): string {
  if (!user) return '';
  const letters = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.trim();
  return (letters || user.email?.[0] || '?').toUpperCase();
}

function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}

/** Signs out on the server (it revokes the session), forgets everything cached in the browser, goes to /login. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.clear();
      try {
        window.localStorage.removeItem('user'); // a hint the pages not yet redesigned keep
      } catch {
        // storage blocked: nothing to remove
      }
      window.location.assign('/login');
    },
  });
}

function UserChip({ compact = false }: { compact?: boolean }) {
  const me = useCurrentUser();
  const signOut = useSignOut();
  const name = me.data ? `${me.data.first_name} ${me.data.last_name}`.trim() : '';

  return (
    <div className={cn('flex items-center gap-3', compact ? '' : 'border-t border-border px-2.5 pt-3')}>
      <Link href="/profile" aria-label="Your profile" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar user={me.data} />
      </Link>
      {!compact && (
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{name || (me.isPending ? ' ' : 'Signed in')}</div>
          <div className="truncate text-xs text-muted-foreground">{me.data?.email ?? ' '}</div>
        </div>
      )}
      <button
        type="button"
        onClick={() => signOut.mutate()}
        disabled={signOut.isPending}
        aria-label="Sign out"
        title="Sign out"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <LogoutIcon size={18} />
      </button>
    </div>
  );
}

/**
 * The frame of every signed-in page: a sidebar on desktop, a bottom bar on phones, one place for the
 * user. The page content is shown only once the session is confirmed, so nothing flashes for someone who is
 * not signed in (a 401 sends the browser to /login, see apiFetch).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const me = useCurrentUser();
  const shell = useShellOverlays();

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-border bg-card px-3.5 py-5 lg:flex">
        <Link href="/dashboard" aria-label="OptiTrack WMS home" className="mb-4 rounded-lg px-2.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>
        <div className="mb-4 space-y-2">
          <button
            type="button"
            onClick={shell.openPalette}
            className="flex h-10 w-full items-center gap-2.5 rounded-[10px] border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SearchIcon size={16} />
            <span className="flex-1 text-left">Search</span>
            <kbd className="rounded border border-border px-1.5 text-[11px] font-medium">Ctrl K</kbd>
          </button>
          <button
            type="button"
            onClick={() => shell.recordMovement()}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <PlusIcon size={16} />
            Record movement
          </button>
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1.5">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'bg-accent font-semibold text-accent-foreground' : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={shell.openAssistant}
          className="mb-3 flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SparkIcon size={18} />
          Assistant
        </button>
        <UserChip />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* phone top bar */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
          <Link href="/dashboard" aria-label="OptiTrack WMS home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <button type="button" onClick={shell.openPalette} aria-label="Search" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <SearchIcon size={18} />
            </button>
            <button type="button" onClick={shell.openAssistant} aria-label="Assistant" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <SparkIcon size={18} />
            </button>
            <button type="button" onClick={() => shell.recordMovement()} aria-label="Record movement" className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <PlusIcon size={18} />
            </button>
            <UserChip compact />
          </div>
        </div>

        <main id="content" tabIndex={-1} className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {me.isPending ? (
            <div role="status" aria-live="polite" className="space-y-4" data-testid="shell-loading">
              <span className="sr-only">Loading</span>
              <div className="h-7 w-48 animate-pulse rounded-lg bg-muted" />
              <div className="h-40 animate-pulse rounded-[14px] bg-muted" />
            </div>
          ) : me.isError ? (
            <div role="alert" className="rounded-[14px] border border-border bg-card p-6">
              <p className="font-semibold">We could not load your account.</p>
              <p className="mt-1 text-sm text-muted-foreground">{me.error.message}</p>
              <button
                type="button"
                onClick={() => me.refetch()}
                className="mt-4 h-10 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {shell.notice && (
                <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-success/30 bg-success-bg px-4 py-2.5 text-sm text-success">
                  <span>{shell.notice}</span>
                  <button type="button" onClick={shell.dismissNotice} className="rounded-md px-2 py-0.5 font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Dismiss
                  </button>
                </div>
              )}
              {children}
            </>
          )}
        </main>
      </div>

      {shell.overlays}

      {/* phone bottom navigation */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                active ? 'font-bold text-accent-foreground' : 'font-medium text-muted-foreground'
              )}
            >
              <Icon size={22} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
