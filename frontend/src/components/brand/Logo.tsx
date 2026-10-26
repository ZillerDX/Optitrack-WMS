import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * The OptiTrack mark: an isometric box in three tones of the accent colour with a tracking point on the lid,
 * plus the wordmark. Colours come from the design tokens, so the logo follows the theme.
 */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const accent = 'hsl(var(--primary))';
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 40 40" className={cn('shrink-0 overflow-visible', className)}>
      <defs>
        <linearGradient id={`${id}-left`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.62" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.28" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.4" style={{ floodColor: accent, floodOpacity: 0.38 }} />
        </filter>
      </defs>
      <g filter={`url(#${id}-shadow)`}>
        <polygon points="6,12 20,20 20,36 6,28" fill={accent} />
        <polygon points="6,12 20,20 20,36 6,28" fill={`url(#${id}-left)`} />
        <polygon points="20,20 34,12 34,28 20,36" fill={accent} />
        <polygon points="20,20 34,12 34,28 20,36" fill="#000000" fillOpacity="0.24" />
        <polygon points="20,4 34,12 20,20 6,12" fill={accent} />
        <polygon points="20,4 34,12 20,20 6,12" fill={`url(#${id}-top)`} />
      </g>
      <path d="M6 12 L20 20 L34 12 M20 20 L20 36" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M20 4 L34 12 L34 28 L20 36 L6 28 L6 12 Z" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.8" strokeLinejoin="round" />
      <circle cx="20" cy="12" r="2.4" fill="#ffffff" />
      <circle cx="20" cy="12" r="4.6" fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="0.9" />
    </svg>
  );
}

export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn('flex items-center gap-[11px]', className)}>
      <LogoMark />
      {showWordmark && (
        <span className="flex flex-col leading-[1.05]">
          <span className="text-[18px] font-bold tracking-[-0.02em] text-foreground">
            Opti<span className="text-primary">Track</span>
          </span>
          <span className="mt-[3px] text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">WAREHOUSE</span>
        </span>
      )}
    </span>
  );
}
