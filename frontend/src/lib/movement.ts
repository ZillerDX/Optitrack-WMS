import type { MovementType } from '@/lib/labels';

export interface MovementCheck {
  /** Something the user must change before sending. */
  error: string | null;
  /** The stock after the movement, when it can be worked out. */
  after: number | null;
}

/**
 * Checks a movement in the browser before it is sent, so the user gets the answer while typing.
 * The server decides in the end (capacity, ownership, races): this only spares a round trip.
 * For ADJUST the quantity is the counted level (0 empties the shelf), for the others an amount to move.
 */
export function checkMovement(type: MovementType, current: number, quantity: number | null): MovementCheck {
  if (quantity === null) return { error: null, after: null };
  if (!Number.isInteger(quantity) || quantity < 0) return { error: 'Enter a whole number, 0 or more.', after: null };
  if (type !== 'ADJUST' && quantity === 0) return { error: 'Enter a quantity above 0.', after: null };
  if (type === 'OUTBOUND' && quantity > current) {
    return { error: `Only ${current} in stock here: you cannot ship ${quantity}.`, after: null };
  }
  const after = type === 'INBOUND' ? current + quantity : type === 'OUTBOUND' ? current - quantity : quantity;
  return { error: null, after };
}

/** The sentence shown after a movement was saved. */
export function describeDone(done: { type: MovementType; quantity: number; product: string; location: string }): string {
  const n = done.quantity.toLocaleString('en-US');
  if (done.type === 'INBOUND') return `Received ${n} of ${done.product} at ${done.location}.`;
  if (done.type === 'OUTBOUND') return `Shipped ${n} of ${done.product} from ${done.location}.`;
  return `Stock of ${done.product} at ${done.location} set to ${n}.`;
}
