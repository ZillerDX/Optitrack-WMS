'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAllProducts } from '@/features/products/api';
import { useLocations } from '@/features/stock/api';
import { apiFetch } from '@/lib/apiFetch';
import { EMPTY_STATE, TOUR_STEPS, currentStep, doneIds, withManual, withVisit, type Snapshot, type StepId, type TourState, type TourStep } from './steps';

export interface TourValue {
  steps: readonly TourStep[];
  done: ReadonlySet<StepId>;
  current: TourStep | null;
  /** The panel is open. */
  open: boolean;
  setOpen: (open: boolean) => void;
  markDone: (id: StepId) => void;
  restart: () => void;
  /** The first of `ids` that is not done yet, or null: the step a button should carry a tag for. */
  pendingAmong: (ids: StepId[]) => TourStep | null;
}

const TourContext = createContext<TourValue | null>(null);

/** The guide's state, or null when this is not a reviewer demo account (everything then renders as normal). */
export function useTour(): TourValue | null {
  return useContext(TourContext);
}

const storageKey = (userId: number) => `optitrack-tour:v1:${userId}`;

function readState(userId: number): { state: TourState; open: boolean } | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: TourState; open?: boolean };
    if (!parsed.state || !Array.isArray(parsed.state.visited) || !Array.isArray(parsed.state.manual)) return null;
    return { state: parsed.state, open: Boolean(parsed.open) };
  } catch {
    return null;
  }
}

function useCount(type: 'INBOUND' | 'OUTBOUND' | 'ADJUST', enabled: boolean) {
  // 'history' is the first key part so every stock change refreshes these (see useInvalidateStock)
  return useQuery({
    queryKey: ['history', 'tour', type] as const,
    enabled,
    queryFn: ({ signal }) => apiFetch<unknown[]>(`/api/transactions?type=${type}&limit=1`, { signal }).then((r) => r.total ?? 0),
  });
}

/**
 * Keeps the reviewer guide for a demo account: what has been done (counted from the data, so it follows what the
 * reviewer really does), which pages were visited, and whether the panel is open. Remembered per account on this device.
 */
export function TourProvider({ enabled, userId, children }: { enabled: boolean; userId: number | undefined; children: ReactNode }) {
  const pathname = usePathname();
  const active = enabled && userId !== undefined;
  const locations = useLocations();
  const products = useAllProducts();
  const inbound = useCount('INBOUND', active);
  const outbound = useCount('OUTBOUND', active);
  const adjust = useCount('ADJUST', active);

  const [state, setState] = useState<TourState>(EMPTY_STATE);
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const snapshot = useMemo<Snapshot | null>(() => {
    if (!active || !locations.data || !products.data || inbound.data === undefined || outbound.data === undefined || adjust.data === undefined) return null;
    return { locations: locations.data.length, products: products.data.length, inbound: inbound.data, outbound: outbound.data, adjust: adjust.data };
  }, [active, locations.data, products.data, inbound.data, outbound.data, adjust.data]);

  useEffect(() => {
    if (!active || userId === undefined) return;
    const saved = readState(userId);
    if (saved) {
      setState(saved.state);
      setOpen(saved.open);
    }
    setLoaded(true);
  }, [active, userId]);

  // the first time the numbers are known is the starting line
  useEffect(() => {
    if (loaded && snapshot && !state.baseline) setState((s) => (s.baseline ? s : { ...s, baseline: snapshot }));
  }, [loaded, snapshot, state.baseline]);

  useEffect(() => {
    if (loaded && state.baseline) setState((s) => withVisit(s, snapshot, pathname));
  }, [loaded, state.baseline, snapshot, pathname]);

  useEffect(() => {
    if (!loaded || userId === undefined) return;
    try {
      window.localStorage.setItem(storageKey(userId), JSON.stringify({ state, open }));
    } catch {
      // storage blocked: the guide still works for this visit
    }
  }, [loaded, userId, state, open]);

  const done = useMemo(() => new Set(doneIds(state, snapshot)), [state, snapshot]);
  const current = useMemo(() => currentStep(state, snapshot), [state, snapshot]);
  const markDone = useCallback((id: StepId) => setState((s) => withManual(s, id)), []);
  const restart = useCallback(() => {
    setState({ ...EMPTY_STATE, baseline: snapshot });
    setOpen(true);
  }, [snapshot]);
  const pendingAmong = useCallback((ids: StepId[]) => TOUR_STEPS.find((s) => ids.includes(s.id) && !done.has(s.id)) ?? null, [done]);

  const value = useMemo<TourValue | null>(
    () => (active && loaded ? { steps: TOUR_STEPS, done, current, open, setOpen, markDone, restart, pendingAmong } : null),
    [active, loaded, done, current, open, markDone, restart, pendingAmong]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
