import { describe, expect, it } from 'vitest';
import { matches } from '@/lib/paletteMatch';

describe('palette matching', () => {
  it('needs every typed word, in any order', () => {
    expect(matches('Record a movement', 'rec mov')).toBe(true);
    expect(matches('Record a movement', 'mov rec')).toBe(true);
    expect(matches('Record a movement', 'rec xyz')).toBe(false);
  });
  it('ignores case and extra spaces, and an empty query matches everything', () => {
    expect(matches('Dashboard', '  DASH ')).toBe(true);
    expect(matches('Dashboard', '')).toBe(true);
  });
});
