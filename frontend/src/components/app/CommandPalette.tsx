'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { DashboardIcon, HistoryIcon, PlusIcon, ProductsIcon, SearchIcon, SettingsIcon, SparkIcon, StockIcon } from '@/components/app/icons';
import { useProductOptions, type ProductOption } from '@/features/stock/api';
import { matches } from '@/lib/paletteMatch';
import { cn } from '@/lib/utils';

export interface PaletteActions {
  recordMovement: (preset?: { product?: ProductOption }) => void;
  addProduct: () => void;
  openAssistant: () => void;
}

interface Command {
  id: string;
  group: 'Go to' | 'Do' | 'Products';
  title: string;
  hint?: string;
  Icon: ComponentType<{ size?: number }>;
  run: () => void;
}

/**
 * Ctrl+K / Cmd+K: jump to a page, start a task or find a product. It is a combobox: the input keeps focus,
 * arrows move the highlight, Enter runs it, Escape closes.
 */
export function CommandPalette({ open, onOpenChange, actions }: { open: boolean; onOpenChange: (open: boolean) => void; actions: PaletteActions }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const term = query.trim();
  const products = useProductOptions(term, open && term.length >= 2);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const base: Command[] = [
      { id: 'go-dashboard', group: 'Go to', title: 'Dashboard', Icon: DashboardIcon, run: go('/dashboard') },
      { id: 'go-stock', group: 'Go to', title: 'Stock', Icon: StockIcon, run: go('/inventory') },
      { id: 'go-products', group: 'Go to', title: 'Products', Icon: ProductsIcon, run: go('/products') },
      { id: 'go-history', group: 'Go to', title: 'History', Icon: HistoryIcon, run: go('/transactions') },
      { id: 'go-settings', group: 'Go to', title: 'Settings', Icon: SettingsIcon, run: go('/settings') },
      { id: 'go-profile', group: 'Go to', title: 'Profile', Icon: SettingsIcon, run: go('/profile') },
      { id: 'do-movement', group: 'Do', title: 'Record a movement', hint: 'Receive, ship or adjust', Icon: PlusIcon, run: () => actions.recordMovement() },
      { id: 'do-product', group: 'Do', title: 'Add a product', Icon: PlusIcon, run: actions.addProduct },
      { id: 'do-assistant', group: 'Do', title: 'Ask the assistant', hint: 'Questions, reorder suggestions, report', Icon: SparkIcon, run: actions.openAssistant },
    ];
    const found: Command[] =
      term.length >= 2 && products.data
        ? products.data.map((p) => ({ id: `product-${p.id}`, group: 'Products' as const, title: p.name, hint: `SKU ${p.sku}: record a movement`, Icon: ProductsIcon, run: () => actions.recordMovement({ product: p }) }))
        : [];
    return [...base.filter((c) => matches(c.title, term)), ...found];
  }, [actions, router, term, products.data]);

  useEffect(() => setActive(0), [term, commands.length]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onOpenChange(false);
    command.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(commands.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(commands[active]);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[14px] border border-border bg-card text-card-foreground shadow-xl outline-none">
          <Dialog.Title className="sr-only">Search and commands</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <SearchIcon size={18} />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={commands[active] ? `palette-${commands[active].id}` : undefined}
              aria-label="Search pages, actions and products"
              placeholder="Search pages, actions and products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul id="palette-list" ref={listRef} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
            {commands.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{products.isFetching ? 'Searching...' : 'Nothing found.'}</li>}
            {commands.map((c, i) => (
              <li
                key={c.id}
                id={`palette-${c.id}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => run(c)}
                className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm', i === active ? 'bg-accent text-accent-foreground' : 'text-foreground')}
              >
                <c.Icon size={16} />
                <span className="font-medium">{c.title}</span>
                {c.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{c.hint}</span>}
                <span className="sr-only">{c.group}</span>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
