import { describe, expect, it } from 'vitest';
import { checkMovement } from '@/lib/movement';

describe('checkMovement', () => {
  it('works out the stock after each kind of movement', () => {
    expect(checkMovement('INBOUND', 10, 5)).toEqual({ error: null, after: 15 });
    expect(checkMovement('OUTBOUND', 10, 4)).toEqual({ error: null, after: 6 });
    expect(checkMovement('ADJUST', 10, 3)).toEqual({ error: null, after: 3 });
  });

  it('refuses to ship more than is there, and says how much is', () => {
    const r = checkMovement('OUTBOUND', 10, 11);
    expect(r.after).toBeNull();
    expect(r.error).toContain('Only 10 in stock');
  });

  it('allows shipping exactly what is there', () => {
    expect(checkMovement('OUTBOUND', 10, 10).after).toBe(0);
  });

  it('allows adjusting to 0 but not receiving or shipping 0', () => {
    expect(checkMovement('ADJUST', 10, 0)).toEqual({ error: null, after: 0 });
    expect(checkMovement('INBOUND', 10, 0).error).toBeTruthy();
    expect(checkMovement('OUTBOUND', 10, 0).error).toBeTruthy();
  });

  it('rejects fractions and negatives, and waits while nothing is typed', () => {
    expect(checkMovement('INBOUND', 10, 1.5).error).toBeTruthy();
    expect(checkMovement('ADJUST', 10, -1).error).toBeTruthy();
    expect(checkMovement('INBOUND', 10, null)).toEqual({ error: null, after: null });
  });
});
