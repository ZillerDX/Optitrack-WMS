import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

const POINTS = [
  { title: 'Know what is in stock', text: 'Every location, every product, always current.' },
  { title: 'Record a movement in seconds', text: 'Receive, ship or adjust with one short form.' },
  { title: 'See problems early', text: 'Low and empty stock is flagged on the dashboard.' },
];

/** Frame of the sign-in pages: a short brand panel on wide screens, a centred card everywhere. */
export function AuthShell({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-accent px-12 py-12 text-accent-foreground lg:flex">
        <Logo />
        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-[-0.01em]">Warehouse stock, without the spreadsheet.</h2>
          <ul className="mt-8 space-y-5">
            {POINTS.map((p) => (
              <li key={p.title}>
                <p className="font-semibold">{p.title}</p>
                <p className="mt-0.5 text-sm opacity-80">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-70">OptiTrack Warehouse</p>
      </aside>

      <main id="content" className="flex min-h-screen flex-col px-5 py-8 sm:px-8">
        <Link href="/login" aria-label="OptiTrack WMS" className="mb-8 w-fit rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center pb-10">
          <h1 className="text-2xl font-bold tracking-[-0.01em]">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export const authLinkClass = 'font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm';
