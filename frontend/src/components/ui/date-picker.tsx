'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { FloatingPanel } from '@/components/ui/floating-panel';
import { addDays, addMonths, clampDay, dayLabel, isOutOfRange, monthGrid, monthLabel, parseDay, weekday, WEEKDAY_LABELS } from '@/lib/calendar';
import { formatDayString, toDayString } from '@/lib/format';
import { cn } from '@/lib/utils';

const FULL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * A date field that replaces <input type="date">: the browser's own calendar cannot be styled and looks
 * different in every browser. The value is 'YYYY-MM-DD' or '' (no date), like the native input, so the
 * history filters and the API see no change. `min` and `max` grey out days that cannot be chosen.
 *
 * Keyboard in the calendar: Arrow keys move by a day or a week, Home/End to the start or end of the week,
 * PageUp/PageDown by a month (with Shift by a year), Enter to choose, Escape to close.
 */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = 'Any date',
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (day: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const reactId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState('');
  const today = toDayString(new Date()) ?? '';
  const selected = parseDay(value) ? value : '';

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openCalendar = () => {
    if (disabled) return;
    setFocused(clampDay(selected || today, min, max));
    setOpen(true);
  };

  const pick = (day: string) => {
    if (isOutOfRange(day, min, max)) return;
    onChange(day);
    close();
  };

  const grid = useMemo(() => (focused ? monthGrid(focused) : []), [focused]);

  // move the keyboard focus onto the day that is "current": when the calendar opens and whenever it moves
  const focusDay = useCallback(() => {
    const day = () => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`);
    // right after opening the panel is still being placed (hidden), and a hidden element cannot take the focus:
    // try again on the next frames until it works
    let frames = 0;
    const attempt = () => {
      const el = day();
      el?.focus({ preventScroll: true });
      if (el && document.activeElement !== el && frames++ < 30) requestAnimationFrame(attempt);
    };
    attempt();
  }, [focused]);
  useEffect(() => {
    if (open && focused) focusDay();
  }, [open, focused, focusDay]);

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, string> = {
      ArrowLeft: addDays(focused, -1),
      ArrowRight: addDays(focused, 1),
      ArrowUp: addDays(focused, -7),
      ArrowDown: addDays(focused, 7),
      Home: addDays(focused, -weekday(focused)),
      End: addDays(focused, 6 - weekday(focused)),
      PageUp: addMonths(focused, event.shiftKey ? -12 : -1),
      PageDown: addMonths(focused, event.shiftKey ? 12 : 1),
    };
    const next = steps[event.key];
    if (!next) return;
    event.preventDefault();
    setFocused(clampDay(next, min, max));
  }

  const monthId = `${reactId}-month`;
  const prevMonth = focused ? addMonths(focused, -1) : '';
  const nextMonth = focused ? addMonths(focused, 1) : '';
  const prevBlocked = Boolean(min && prevMonth && monthGrid(prevMonth).flat().every((c) => c.day < min || !c.inMonth));
  const nextBlocked = Boolean(max && nextMonth && monthGrid(nextMonth).flat().every((c) => c.day > max || !c.inMonth));

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        data-open={open}
        onClick={() => (open ? close(false) : openCalendar())}
        className={cn(
          'group flex h-10 items-center gap-2 rounded-[10px] border border-input bg-background px-3 text-left text-sm transition-[border-color,box-shadow,background-color]',
          'hover:border-ring/60 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'data-[open=true]:border-ring data-[open=true]:ring-2 data-[open=true]:ring-ring/25',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground group-data-[open=true]:text-primary" />
        <span className={cn('whitespace-nowrap tabular-nums', !selected && 'text-muted-foreground')}>{selected ? formatDayString(selected) : placeholder}</span>
      </button>

      <FloatingPanel anchorRef={triggerRef} open={open} onClose={() => close(true)} onPlaced={focusDay} width={300} role="group" aria-label="Calendar">
        <div className="p-1.5">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              disabled={prevBlocked}
              onClick={() => setFocused(clampDay(prevMonth, min, max))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <p id={monthId} aria-live="polite" className="text-sm font-bold">
              {focused ? monthLabel(focused) : ''}
            </p>
            <button
              type="button"
              aria-label="Next month"
              disabled={nextBlocked}
              onClick={() => setFocused(clampDay(nextMonth, min, max))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <div ref={gridRef} role="grid" aria-labelledby={monthId} onKeyDown={onGridKeyDown}>
            <div role="row" className="mb-1 grid grid-cols-7">
              {WEEKDAY_LABELS.map((label, i) => (
                <div key={label} role="columnheader" aria-label={FULL_WEEKDAYS[i]} className="py-1 text-center text-xs font-semibold text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>
            {grid.map((row, r) => (
              <div key={r} role="row" className="grid grid-cols-7">
                {row.map(({ day, inMonth }) => {
                  const isSelected = day === selected;
                  const isToday = day === today;
                  const blocked = isOutOfRange(day, min, max);
                  const number = Number(day.slice(8));
                  return (
                    <div key={day} role="gridcell" aria-selected={isSelected || undefined} className="flex items-center justify-center py-0.5">
                      <button
                        type="button"
                        data-day={day}
                        tabIndex={day === focused ? 0 : -1}
                        disabled={blocked}
                        aria-label={dayLabel(day)}
                        aria-current={isToday ? 'date' : undefined}
                        onClick={() => pick(day)}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          inMonth ? 'text-foreground' : 'text-muted-foreground/70',
                          !isSelected && !blocked && 'hover:bg-muted',
                          isToday && !isSelected && 'font-bold text-primary ring-1 ring-inset ring-primary/40',
                          isSelected && 'bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary',
                          blocked && 'cursor-not-allowed opacity-30'
                        )}
                      >
                        {number}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              disabled={!today || isOutOfRange(today, min, max)}
              onClick={() => pick(today)}
              className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
            >
              Today
            </button>
            {selected && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  close();
                }}
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </FloatingPanel>
    </>
  );
}
