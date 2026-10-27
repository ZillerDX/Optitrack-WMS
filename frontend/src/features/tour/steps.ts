/**
 * The reviewer guide: the steps, in the order a reviewer would try the system, and the rule that tells when
 * each one is done. Pure data and functions (no React) so the rules can be unit tested.
 */

export type StepId = 'location' | 'product' | 'receive' | 'ship' | 'adjust' | 'history' | 'dashboard' | 'assistant' | 'tips';

/** What the app can count, read when the guide starts (the baseline) and again after every change. */
export interface Snapshot {
  locations: number;
  products: number;
  inbound: number;
  outbound: number;
  adjust: number;
}

export interface TourStep {
  id: StepId;
  /** Short title, also the label of the checklist row. */
  title: string;
  /** What to do and what to look for, in two or three sentences. */
  body: string;
  /** The page where the step happens. */
  href: string;
  /** The words on the button the tag points at. */
  where: string;
  /** How it is checked: by a change in the data, by visiting the page after an earlier step, or by the reviewer. */
  check: { kind: 'count'; key: keyof Snapshot } | { kind: 'visit'; path: string; after: StepId } | { kind: 'manual' };
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'location',
    title: 'Create a location',
    where: 'Locations > Add location',
    href: '/inventory',
    body: 'A location is a place where stock is kept: a rack, a shelf, a cold room. Open Locations, choose Add location, give it a name and a capacity (how many units it can hold), then Save. The meter shows how full each location is.',
    check: { kind: 'count', key: 'locations' },
  },
  {
    id: 'product',
    title: 'Add a product',
    where: 'Add product',
    href: '/products',
    body: 'A product is something you keep: a name, a SKU (its unique code), cost and selling prices, and a minimum stock level. Below the minimum it is flagged "Below minimum". A new product starts with no stock; you receive some in the next step.',
    check: { kind: 'count', key: 'products' },
  },
  {
    id: 'receive',
    title: 'Receive stock into your location',
    where: 'Record movement > Receive',
    href: '/inventory',
    body: 'Choose Record movement, pick Receive, search for your new product, and choose YOUR new location from the Location list. Enter a quantity and see "Stock will be N after this" before you save. If the quantity does not fit the location\'s capacity, the server refuses it and says why.',
    check: { kind: 'count', key: 'inbound' },
  },
  {
    id: 'ship',
    title: 'Ship stock out',
    where: 'Record movement > Ship',
    href: '/inventory',
    body: 'Pick Ship and first enter MORE than is in stock: the form warns you and the button stays disabled, because stock can never go below zero. Then enter a quantity that is available and save. Every shipment is written to the history.',
    check: { kind: 'count', key: 'outbound' },
  },
  {
    id: 'adjust',
    title: 'Correct the stock after a count',
    where: 'Record movement > Adjust',
    href: '/inventory',
    body: 'Adjust is for a physical count: you enter the number you actually counted and the system works out the difference (shown as a signed change in the history). Setting it to 0 empties the shelf and the product shows "Out of stock".',
    check: { kind: 'count', key: 'adjust' },
  },
  {
    id: 'history',
    title: 'Read the history',
    where: 'History',
    href: '/transactions',
    body: 'Every movement is recorded and never edited. Filter by type (Received, Shipped, Adjusted), by dates, by location or by product, and use Export CSV to download what you see. "Stock after" shows the level after each movement.',
    check: { kind: 'visit', path: '/transactions', after: 'adjust' },
  },
  {
    id: 'dashboard',
    title: 'See the result on the Dashboard',
    where: 'Dashboard',
    href: '/dashboard',
    body: 'The dashboard is calculated from the same movements: units and value in stock, what was received and shipped each day, value by category, how full each location is, and which products need ordering (their total is below the minimum).',
    check: { kind: 'visit', path: '/dashboard', after: 'adjust' },
  },
  {
    id: 'assistant',
    title: 'Let the assistant suggest an order',
    where: 'Assistant > Reorder',
    href: '/dashboard',
    body: 'Open Assistant and choose Reorder. It suggests purchase orders for products that are running low, based on the last 30 days of shipments. "Approve and receive" records the order and puts the stock into the chosen location at once. Ask and Report answer questions about your stock.',
    check: { kind: 'manual' },
  },
  {
    id: 'tips',
    title: 'Shortcuts and settings',
    where: 'Search (Ctrl K) and Settings',
    href: '/settings',
    body: 'Press Ctrl+K (Cmd+K on a Mac) to jump to any page, start a movement or find a product. In Settings you can switch between light and dark and choose the currency prices are shown in. This demo account is private to you and is deleted automatically after about two days.',
    check: { kind: 'manual' },
  },
];

export interface TourState {
  /** Counts when the guide started: a step is done when its count has gone up since. */
  baseline: Snapshot | null;
  /** Pages visited after their prerequisite step was done. */
  visited: string[];
  /** Steps the reviewer marked done by hand. */
  manual: StepId[];
}

export const EMPTY_STATE: TourState = { baseline: null, visited: [], manual: [] };

export function isStepDone(step: TourStep, state: TourState, now: Snapshot | null): boolean {
  if (state.manual.includes(step.id)) return true;
  const c = step.check;
  if (c.kind === 'count') return Boolean(state.baseline && now && now[c.key] > state.baseline[c.key]);
  if (c.kind === 'visit') return state.visited.includes(c.path);
  return false;
}

export function doneIds(state: TourState, now: Snapshot | null): StepId[] {
  return TOUR_STEPS.filter((s) => isStepDone(s, state, now)).map((s) => s.id);
}

/** The first step not done yet, or null when all are. */
export function currentStep(state: TourState, now: Snapshot | null): TourStep | null {
  const done = new Set(doneIds(state, now));
  return TOUR_STEPS.find((s) => !done.has(s.id)) ?? null;
}

/**
 * A page counts as visited only if the step it belongs to has its prerequisite done: the reviewer lands on
 * the dashboard right after signing in, which must not tick "See the result on the Dashboard".
 */
export function withVisit(state: TourState, now: Snapshot | null, pathname: string): TourState {
  const toTick = TOUR_STEPS.filter((s) => s.check.kind === 'visit' && s.check.path === pathname && !state.visited.includes(pathname));
  if (toTick.length === 0) return state;
  const done = new Set(doneIds(state, now));
  const ready = toTick.some((s) => s.check.kind === 'visit' && done.has(s.check.after));
  return ready ? { ...state, visited: [...state.visited, pathname] } : state;
}

export function withManual(state: TourState, id: StepId): TourState {
  return state.manual.includes(id) ? state : { ...state, manual: [...state.manual, id] };
}

export function stepNumber(id: StepId): number {
  return TOUR_STEPS.findIndex((s) => s.id === id) + 1;
}
