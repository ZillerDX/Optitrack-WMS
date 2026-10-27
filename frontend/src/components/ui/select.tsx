'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { FloatingPanel } from '@/components/ui/floating-panel';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  /** A second, quieter line under the label. */
  description?: string;
  disabled?: boolean;
}

/**
 * A dropdown that replaces the browser's own <select>, which cannot be styled. Same contract: a value, a list of
 * options, an onChange with the new value. The button is a combobox with a listbox popup, so it is named by a
 * <label htmlFor={id}> and works from the keyboard: Arrow keys, Home/End, type a letter to jump, Enter or Space
 * to choose, Escape to close.
 */
export function Select({
  id,
  value,
  onChange,
  options,
  placeholder = 'Choose',
  disabled,
  size = 'md',
  className,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  disabled?: boolean;
  /** md = 40px (toolbars), lg = 44px (forms). */
  size?: 'md' | 'lg';
  className?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}) {
  const reactId = useId();
  const listId = `${reactId}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef({ text: '', at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const enabled = useMemo(() => options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0), [options]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openList = (at: 'selected' | 'first' | 'last' = 'selected') => {
    if (disabled || enabled.length === 0) return;
    setActive(at === 'first' ? enabled[0] : at === 'last' ? enabled[enabled.length - 1] : selectedIndex >= 0 && enabled.includes(selectedIndex) ? selectedIndex : enabled[0]);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    close();
  };

  const move = (step: 1 | -1) => {
    const at = enabled.indexOf(active);
    const next = enabled[(at + step + enabled.length) % enabled.length];
    setActive(next);
  };

  // keep the highlighted option in view while arrowing through a long list
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const { key } = event;
    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        event.preventDefault();
        openList(key === 'ArrowUp' && selectedIndex < 0 ? 'last' : 'selected');
      }
      return;
    }
    if (key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (key === 'Home') {
      event.preventDefault();
      setActive(enabled[0]);
    } else if (key === 'End') {
      event.preventDefault();
      setActive(enabled[enabled.length - 1]);
    } else if (key === 'Enter' || (key === ' ' && !(typed.current.text && Date.now() - typed.current.at <= 700))) {
      // a space in the middle of typing ("zone b") belongs to the search, not to "choose"
      event.preventDefault();
      choose(active);
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // type-ahead: "co" jumps to the next label that starts with "co"
      const now = Date.now();
      const text = now - typed.current.at > 700 ? key.toLowerCase() : typed.current.text + key.toLowerCase();
      typed.current = { text, at: now };
      const from = text.length === 1 ? enabled.indexOf(active) + 1 : enabled.indexOf(active);
      const order = [...enabled.slice(Math.max(from, 0)), ...enabled.slice(0, Math.max(from, 0))];
      const hit = order.find((i) => options[i].label.toLowerCase().startsWith(text));
      if (hit !== undefined) setActive(hit);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${reactId}-opt-${active}` : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        data-open={open}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKeyDown}
        // a space is handled on keydown; without this the browser also "clicks" the button when the key comes up
        onKeyUp={(event) => event.key === ' ' && event.preventDefault()}
        className={cn(
          'group flex w-full items-center justify-between gap-2 rounded-[10px] border border-input bg-background px-3 text-left text-sm transition-[border-color,box-shadow,background-color]',
          'hover:border-ring/60 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'data-[open=true]:border-ring data-[open=true]:ring-2 data-[open=true]:ring-ring/25',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input disabled:hover:bg-background',
          size === 'lg' ? 'h-11 text-[15px]' : 'h-10',
          className
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected ? selected.label : placeholder}</span>
        <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[open=true]:rotate-180 group-data-[open=true]:text-foreground')} />
      </button>

      <FloatingPanel anchorRef={triggerRef} open={open} onClose={() => close(true)} matchAnchorWidth minWidth={200} className="max-w-[min(360px,calc(100vw-16px))]">
        <div ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className="space-y-0.5">
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === active;
            return (
              <div
                key={option.value || `__empty-${index}`}
                id={`${reactId}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                data-index={index}
                // the trigger keeps focus; a press must not move it
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => !option.disabled && setActive(index)}
                onClick={() => choose(index)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                  isActive && 'bg-muted',
                  isSelected && 'bg-accent text-accent-foreground',
                  isSelected && isActive && 'bg-accent',
                  option.disabled && 'cursor-not-allowed opacity-45'
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate', isSelected && 'font-semibold')}>{option.label}</span>
                  {option.description && <span className="block truncate text-xs text-muted-foreground">{option.description}</span>}
                </span>
                <Check aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-primary', isSelected ? 'opacity-100' : 'opacity-0')} />
              </div>
            );
          })}
          {options.length === 0 && <p className="px-2.5 py-2 text-sm text-muted-foreground">Nothing to choose from.</p>}
        </div>
      </FloatingPanel>
    </>
  );
}
