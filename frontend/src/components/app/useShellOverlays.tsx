'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CommandPalette } from '@/components/app/CommandPalette';
import { AssistantPanel } from '@/features/assistant/AssistantPanel';
import { ProductSheet } from '@/features/products/ProductSheet';
import { MovementSheet, type MovementPreset } from '@/features/stock/MovementSheet';
import type { ProductOption } from '@/features/stock/api';
import { describeDone } from '@/lib/movement';

export interface ShellOverlays {
  openPalette: () => void;
  recordMovement: (preset?: { product?: ProductOption }) => void;
  openAssistant: () => void;
  /** A message shown above the page after something was saved from here. */
  notice: string | null;
  dismissNotice: () => void;
  /** Render once, anywhere in the shell. */
  overlays: ReactNode;
}

/**
 * The things that open over any page: the command palette (Ctrl/Cmd+K), the movement form, the product form and
 * the assistant. Living in the shell, they work the same from every page, which is what the palette's actions need.
 */
export function useShellOverlays(): ShellOverlays {
  const [palette, setPalette] = useState(false);
  const [movement, setMovement] = useState<{ open: boolean; preset?: MovementPreset }>({ open: false });
  const [product, setProduct] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const recordMovement = useCallback((preset?: { product?: ProductOption }) => setMovement({ open: true, preset }), []);
  const openAssistant = useCallback(() => setAssistant(true), []);
  const openPalette = useCallback(() => setPalette(true), []);
  const paletteActions = useMemo(() => ({ recordMovement, addProduct: () => setProduct(true), openAssistant }), [recordMovement, openAssistant]);

  const overlays = (
    <>
      <CommandPalette open={palette} onOpenChange={setPalette} actions={paletteActions} />
      <MovementSheet open={movement.open} onOpenChange={(open) => setMovement((m) => ({ ...m, open }))} preset={movement.preset} onDone={(done) => setNotice(describeDone(done))} />
      <ProductSheet open={product} onOpenChange={setProduct} product={null} onSaved={setNotice} />
      <AssistantPanel open={assistant} onOpenChange={setAssistant} />
    </>
  );

  return { openPalette, recordMovement, openAssistant, notice, dismissNotice: () => setNotice(null), overlays };
}
