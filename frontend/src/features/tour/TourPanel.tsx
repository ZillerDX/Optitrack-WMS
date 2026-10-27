'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { stepNumber } from './steps';
import { useTour } from './TourProvider';

/** The reviewer guide: a pill in the corner that opens the checklist of the whole walk through the system. */
export function TourPanel() {
  const tour = useTour();
  const pathname = usePathname();
  if (!tour) return null;

  const total = tour.steps.length;
  const count = tour.done.size;
  const finished = count === total;

  if (!tour.open) {
    return (
      <button
        type="button"
        onClick={() => tour.setOpen(true)}
        className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:bottom-6"
      >
        Reviewer guide
        <span className="rounded-full bg-primary-foreground/20 px-2 text-xs">
          {count}/{total}
        </span>
      </button>
    );
  }

  return (
    <aside aria-label="Reviewer guide" className="fixed bottom-20 right-4 z-30 flex max-h-[72vh] w-[min(360px,calc(100vw-2rem))] flex-col rounded-[14px] border border-border bg-card text-card-foreground shadow-xl lg:bottom-6">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">Reviewer guide</h2>
          <p className="text-xs text-muted-foreground">
            {finished ? 'You have walked through everything. Thank you.' : `Step ${count + 1} of ${total}: try each one on this demo account.`}
          </p>
        </div>
        <button type="button" onClick={() => tour.setOpen(false)} aria-label="Hide the guide" className="rounded-md px-2 py-1 text-lg leading-none text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span aria-hidden="true">−</span>
        </button>
      </header>

      <div className="px-4 pt-3">
        <div role="progressbar" aria-label="Guide progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={count} className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(count / total) * 100}%` }} />
        </div>
      </div>

      <ol className="mt-2 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {tour.steps.map((step) => {
          const isDone = tour.done.has(step.id);
          const isCurrent = tour.current?.id === step.id;
          return (
            <li key={step.id}>
              <details open={isCurrent} className={cn('group rounded-[10px] px-2 py-1.5', isCurrent && 'bg-accent/60')}>
                <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span
                    aria-hidden="true"
                    className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold', isDone ? 'bg-success text-white' : isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}
                  >
                    {isDone ? '✓' : stepNumber(step.id)}
                  </span>
                  <span className={cn('text-sm', isDone ? 'text-muted-foreground line-through' : 'font-semibold')}>
                    {step.title}
                    <span className="sr-only">{isDone ? ' (done)' : isCurrent ? ' (current step)' : ''}</span>
                  </span>
                </summary>
                <div className="pb-1 pl-[34px] pr-1 pt-1">
                  <p className="text-xs font-semibold text-muted-foreground">On the screen: {step.where}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pathname !== step.href && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={step.href}>Open this page</Link>
                      </Button>
                    )}
                    {step.check.kind === 'manual' && !isDone && (
                      <Button type="button" size="sm" onClick={() => tour.markDone(step.id)}>
                        Mark as done
                      </Button>
                    )}
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ol>

      <footer className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span>Steps tick by themselves when you do them.</span>
        <button type="button" onClick={tour.restart} className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Restart
        </button>
      </footer>
    </aside>
  );
}
