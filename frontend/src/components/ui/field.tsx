'use client';

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Shown to the right of the label (for example "Forgot password?"). */
  labelAction?: ReactNode;
}

/** Label + input + hint or error, wired together for screen readers. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { id, label, hint, error, labelAction, className, type, ...props },
  ref
) {
  const describedBy = useId();
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          type={isPassword && shown ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? describedBy : undefined}
          className={cn('h-11 text-[15px]', isPassword && 'pr-16', error && 'border-danger', className)}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-pressed={shown}
            className="absolute inset-y-0 right-1 my-1 rounded-md px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {error ? (
        <p id={describedBy} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={describedBy} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/** A message above a form: an error from the server, or a confirmation. */
export function FormNotice({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-[10px] border px-3.5 py-2.5 text-sm',
        tone === 'error' ? 'border-danger/30 bg-danger-bg text-danger' : 'border-success/30 bg-success-bg text-success'
      )}
    >
      {children}
    </div>
  );
}
