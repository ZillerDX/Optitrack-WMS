import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Title row of a page: the h1, an optional line under it, and the page's actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-end gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
