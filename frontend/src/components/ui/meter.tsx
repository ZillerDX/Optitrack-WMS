import { cn } from '@/lib/utils';

/** How full a location is. Over 100 % is shown full and in the danger colour. */
export function Meter({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const ratio = max > 0 ? value / max : 0;
  const tone = ratio > 1 ? 'bg-danger' : ratio >= 0.9 ? 'bg-warning' : 'bg-primary';
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className={cn('h-full rounded-full transition-[width]', tone)} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
    </div>
  );
}
