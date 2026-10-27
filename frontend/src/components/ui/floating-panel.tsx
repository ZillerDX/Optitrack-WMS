'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface Placement {
  style: CSSProperties;
  above: boolean;
}

const GAP = 6;
const EDGE = 8;

/**
 * The surface under a dropdown or date picker. It is drawn next to its anchor with `position: fixed`, so a card
 * with `overflow: hidden` or a scrolling sheet never clips it, and it opens upwards when there is no room below.
 * Inside a dialog it is rendered in that dialog (not in <body>): the dialog would otherwise treat a click on the
 * panel as a click outside and close itself.
 *
 * Closing: a press outside, Tab, and Escape. Escape is caught on the window before the dialog sees it, so it
 * closes only the panel and the sheet behind it stays open.
 */
export function FloatingPanel({
  anchorRef,
  open,
  onClose,
  onPlaced,
  width,
  matchAnchorWidth = false,
  minWidth,
  className,
  children,
  ...rest
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** Called once the panel is drawn and can take the focus. */
  onPlaced?: () => void;
  /** Fixed width in px. */
  width?: number;
  /** At least as wide as the anchor. */
  matchAnchorWidth?: boolean;
  minWidth?: number;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelWidth = width ?? Math.max(matchAnchorWidth ? rect.width : 0, minWidth ?? 0);
    const left = Math.min(Math.max(EDGE, rect.left), Math.max(EDGE, vw - panelWidth - EDGE));
    const below = vh - rect.bottom - GAP - EDGE;
    const aboveRoom = rect.top - GAP - EDGE;
    const wanted = panelRef.current?.scrollHeight ?? 0;
    const above = wanted > below && aboveRoom > below;
    const room = Math.max(160, above ? aboveRoom : below);
    setPlacement({
      above,
      style: {
        position: 'fixed',
        left,
        width: width ?? undefined,
        minWidth: width ? undefined : panelWidth || undefined,
        maxHeight: room,
        ...(above ? { bottom: vh - rect.top + GAP } : { top: rect.bottom + GAP }),
      },
    });
  }, [anchorRef, width, matchAnchorWidth, minWidth]);

  // where to render: the dialog that holds the anchor, or <body>
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    setContainer((anchorRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? document.body);
  }, [open, anchorRef]);

  // measured after the panel exists, then kept in step with the page
  useLayoutEffect(() => {
    if (!open || !container) return;
    place();
  }, [open, container, place, children]);

  const placed = placement !== null;
  useEffect(() => {
    if (open && placed) onPlaced?.();
    // only when the panel first becomes visible
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placed]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        onClose();
      } else if (event.key === 'Tab') {
        onClose();
      }
    };
    const onPress = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPress, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPress, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !container) return null;

  return createPortal(
    <div
      ref={panelRef}
      {...rest}
      style={placement ? placement.style : { position: 'fixed', top: 0, left: 0, width, visibility: 'hidden' }}
      className={cn(
        'pointer-events-auto z-[60] overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1.5 text-popover-foreground',
        'shadow-[0_14px_34px_-10px_hsl(221_39%_11%/0.30),0_2px_8px_hsl(221_39%_11%/0.08)]',
        'animate-in fade-in-0 zoom-in-95 duration-100 motion-reduce:animate-none',
        placement?.above ? 'origin-bottom' : 'origin-top',
        className
      )}
    >
      {children}
    </div>,
    container
  );
}
