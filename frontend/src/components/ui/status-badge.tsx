import { cn } from '@/lib/utils';
import { statusFor, type Tone } from '@/lib/labels';

const TONES: Record<Tone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  neutral: 'bg-muted text-muted-foreground',
};

/** A status as one short label on one line; the dot repeats the tone for people who do not see colour well. */
export function StatusBadge({ quantity, minimum }: { quantity: number; minimum: number }) {
  const { text, tone } = statusFor(quantity, minimum);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone])}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {text}
    </span>
  );
}
