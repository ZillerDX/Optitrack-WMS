import { inventoryStatus, type InventoryStatus } from '@/lib/stockStatus';
import { formatSigned } from '@/lib/format';

/**
 * The words of the app, in one place, so a movement is "Received" on every page and a status always has
 * the same text and tone. The UI is English only. Terminology: Receive / Ship / Adjust (the actions),
 * Received / Shipped / Adjusted (what happened), Stock, Location, SKU.
 */

export type MovementType = 'INBOUND' | 'OUTBOUND' | 'ADJUST';

export interface MovementLabel {
  /** The action on a button: "Receive 40 units". */
  action: string;
  /** What happened, for history and charts. */
  done: string;
  /** The label of the quantity field. */
  quantityLabel: string;
}

export const MOVEMENT_LABELS: Record<MovementType, MovementLabel> = {
  INBOUND: { action: 'Receive', done: 'Received', quantityLabel: 'Quantity received' },
  OUTBOUND: { action: 'Ship', done: 'Shipped', quantityLabel: 'Quantity shipped' },
  ADJUST: { action: 'Adjust', done: 'Adjusted', quantityLabel: 'Counted quantity' },
};

export function movementLabel(type: string): MovementLabel {
  return MOVEMENT_LABELS[type as MovementType] ?? { action: type, done: type, quantityLabel: 'Quantity' };
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral';

export interface StatusLabel {
  text: string;
  tone: Tone;
}

export const STATUS_LABELS: Record<InventoryStatus, StatusLabel> = {
  IN_STOCK: { text: 'In stock', tone: 'success' },
  LOW_STOCK: { text: 'Below minimum', tone: 'warning' },
  OUT_OF_STOCK: { text: 'Out of stock', tone: 'danger' },
};

export function statusLabel(status: string): StatusLabel {
  return STATUS_LABELS[status as InventoryStatus] ?? { text: status, tone: 'neutral' };
}

/** Status from the numbers: the same rule as the database. */
export function statusFor(quantity: number, minimum: number): StatusLabel {
  return STATUS_LABELS[inventoryStatus(quantity, minimum)];
}

export interface MovementRow {
  type: string;
  quantity: number;
  /** Set by migration 0012 and later: the level after the movement. Missing on older ADJUST rows. */
  stock_after?: number | null;
}

export interface MovementDescription {
  label: string;
  /** The change in units, or null when it cannot be known (an ADJUST written before 0012). */
  delta: number | null;
  /** "+40", "−12", or "Set to 4" for an older ADJUST. */
  text: string;
}

/**
 * How a history row reads. INBOUND adds, OUTBOUND subtracts. Since migration 0012 an ADJUST stores its signed
 * change; an ADJUST written before holds the level it was set to and has no stock_after, so only that level
 * can be shown.
 */
export function describeMovement(row: MovementRow): MovementDescription {
  const label = movementLabel(row.type).done;
  const q = Number(row.quantity) || 0;
  if (row.type === 'INBOUND') return { label, delta: q, text: formatSigned(q) };
  if (row.type === 'OUTBOUND') return { label, delta: -q, text: formatSigned(-q) };
  if (row.type === 'ADJUST') {
    if (row.stock_after === null || row.stock_after === undefined) return { label, delta: null, text: `Set to ${q}` };
    return { label, delta: q, text: formatSigned(q) };
  }
  return { label, delta: null, text: String(q) };
}
