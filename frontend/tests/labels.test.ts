import { describe, expect, it } from 'vitest';
import { describeMovement, movementLabel, statusFor, statusLabel } from '@/lib/labels';
import { inventoryStatus } from '@/lib/stockStatus';
import { inventoryStatus as fromStock } from '@/lib/stock';

describe('stock status rule', () => {
  it('is out of stock at 0, below the minimum under it, in stock at or above it', () => {
    expect(inventoryStatus(0, 5)).toBe('OUT_OF_STOCK');
    expect(inventoryStatus(4, 5)).toBe('LOW_STOCK');
    expect(inventoryStatus(5, 5)).toBe('IN_STOCK'); // at the minimum is fine
    expect(inventoryStatus(6, 5)).toBe('IN_STOCK');
    expect(inventoryStatus(3, 0)).toBe('IN_STOCK'); // a minimum of 0 never warns
    expect(inventoryStatus(0, 0)).toBe('OUT_OF_STOCK');
  });

  it('is the same function on the server and in the browser', () => {
    expect(fromStock).toBe(inventoryStatus);
  });
});

describe('labels', () => {
  it('uses Receive / Ship / Adjust for actions and Received / Shipped / Adjusted for what happened', () => {
    expect(movementLabel('INBOUND')).toMatchObject({ action: 'Receive', done: 'Received' });
    expect(movementLabel('OUTBOUND')).toMatchObject({ action: 'Ship', done: 'Shipped' });
    expect(movementLabel('ADJUST')).toMatchObject({ action: 'Adjust', done: 'Adjusted' });
  });

  it('falls back to the raw value for a type it does not know', () => {
    expect(movementLabel('RETURN')).toMatchObject({ action: 'RETURN', done: 'RETURN' });
    expect(statusLabel('SOMETHING')).toEqual({ text: 'SOMETHING', tone: 'neutral' });
  });

  it('gives each stock status one text and one tone', () => {
    expect(statusLabel('IN_STOCK')).toEqual({ text: 'In stock', tone: 'success' });
    expect(statusLabel('LOW_STOCK')).toEqual({ text: 'Below minimum', tone: 'warning' });
    expect(statusLabel('OUT_OF_STOCK')).toEqual({ text: 'Out of stock', tone: 'danger' });
  });

  it('derives the status from the numbers', () => {
    expect(statusFor(0, 10).text).toBe('Out of stock');
    expect(statusFor(9, 10).text).toBe('Below minimum');
    expect(statusFor(10, 10).text).toBe('In stock');
  });
});

describe('describeMovement', () => {
  it('shows receipts as plus and shipments as minus', () => {
    expect(describeMovement({ type: 'INBOUND', quantity: 40 })).toEqual({ label: 'Received', delta: 40, text: '+40' });
    expect(describeMovement({ type: 'OUTBOUND', quantity: 12 })).toEqual({ label: 'Shipped', delta: -12, text: '−12' });
  });

  it('reads an ADJUST written since migration 0012 as the signed change it stores', () => {
    expect(describeMovement({ type: 'ADJUST', quantity: -6, stock_after: 4 })).toEqual({ label: 'Adjusted', delta: -6, text: '−6' });
    expect(describeMovement({ type: 'ADJUST', quantity: 8, stock_after: 10 })).toMatchObject({ delta: 8, text: '+8' });
    expect(describeMovement({ type: 'ADJUST', quantity: 0, stock_after: 4 })).toMatchObject({ delta: 0, text: '0' });
  });

  it('does not invent a change for an older ADJUST: it only holds the level it was set to', () => {
    expect(describeMovement({ type: 'ADJUST', quantity: 4, stock_after: null })).toEqual({ label: 'Adjusted', delta: null, text: 'Set to 4' });
    expect(describeMovement({ type: 'ADJUST', quantity: 4 })).toMatchObject({ delta: null, text: 'Set to 4' });
  });

  it('copes with a missing quantity', () => {
    expect(describeMovement({ type: 'INBOUND', quantity: undefined as unknown as number })).toMatchObject({ delta: 0, text: '0' });
  });
});
