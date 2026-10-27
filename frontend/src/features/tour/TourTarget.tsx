'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { stepNumber, type StepId } from './steps';
import { useTour } from './TourProvider';

/**
 * Puts a "Step N" tag on a button for a reviewer demo account. Clicking the tag explains the step. For anyone
 * else, or when the step is done, it renders the button untouched. `steps` lists the steps this button can
 * serve; the tag shows the first one still to do.
 */
export function TourTarget({ steps, children, className }: { steps: StepId[]; children: ReactNode; className?: string }) {
  const tour = useTour();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const step = tour?.pendingAmong(steps) ?? null;
  if (!tour || !step) return <>{children}</>;

  const isCurrent = tour.current?.id === step.id;
  return (
    <span className={cn('relative inline-flex', className)}>
      {children}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'absolute -right-2 -top-2.5 z-20 rounded-full px-2 py-0.5 text-[11px] font-bold leading-none shadow-sm ring-2 ring-background focus-visible:outline-none focus-visible:ring-primary',
          isCurrent ? 'animate-pulse bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
        )}
      >
        <span className="sr-only">Guide: </span>Step {stepNumber(step.id)}
      </button>
      {open && (
        <div id={panelId} role="note" className="absolute right-0 top-full z-40 mt-2.5 w-72 rounded-[12px] border border-border bg-card p-3.5 text-left text-card-foreground shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {stepNumber(step.id)} of {tour.steps.length}</p>
          <p className="mt-1 text-sm font-bold">{step.title}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
          <button type="button" onClick={() => setOpen(false)} className="mt-2.5 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Close
          </button>
        </div>
      )}
    </span>
  );
}
