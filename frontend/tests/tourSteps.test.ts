import { describe, expect, it } from 'vitest';
import { EMPTY_STATE, TOUR_STEPS, currentStep, doneIds, isStepDone, stepNumber, withManual, withVisit, type Snapshot, type TourState } from '@/features/tour/steps';

const base: Snapshot = { locations: 3, products: 10, inbound: 13, outbound: 50, adjust: 2 };
const started: TourState = { ...EMPTY_STATE, baseline: base };
const step = (id: string) => TOUR_STEPS.find((s) => s.id === id)!;

describe('guide steps', () => {
  it('nothing is done before the baseline exists, even with data', () => {
    expect(doneIds(EMPTY_STATE, base)).toEqual([]);
    expect(currentStep(EMPTY_STATE, base)?.id).toBe('location');
  });

  it('a count step is done when its number went up since the start, not before', () => {
    expect(isStepDone(step('location'), started, base)).toBe(false);
    expect(isStepDone(step('location'), started, { ...base, locations: 4 })).toBe(true);
    expect(isStepDone(step('receive'), started, { ...base, locations: 4 })).toBe(false);
    expect(isStepDone(step('ship'), started, { ...base, outbound: 51 })).toBe(true);
    expect(isStepDone(step('adjust'), started, { ...base, adjust: 3 })).toBe(true);
  });

  it('deleting something never un-does a step that counts lower than the baseline', () => {
    expect(isStepDone(step('product'), started, { ...base, products: 9 })).toBe(false);
  });

  it('the current step is the first one not done', () => {
    const now = { ...base, locations: 4, products: 11 };
    expect(currentStep(started, now)?.id).toBe('receive');
  });

  it('landing on the dashboard at sign-in does not tick the dashboard step', () => {
    expect(withVisit(started, base, '/dashboard')).toEqual(started);
  });

  it('visiting history or the dashboard counts once the adjust step is done', () => {
    const afterAdjust = { ...base, adjust: 3 };
    const s1 = withVisit(started, afterAdjust, '/transactions');
    expect(s1.visited).toEqual(['/transactions']);
    expect(isStepDone(step('history'), s1, afterAdjust)).toBe(true);
    const s2 = withVisit(s1, afterAdjust, '/dashboard');
    expect(isStepDone(step('dashboard'), s2, afterAdjust)).toBe(true);
    expect(withVisit(s2, afterAdjust, '/dashboard')).toBe(s2); // not added twice
  });

  it('manual steps wait for the reviewer', () => {
    expect(isStepDone(step('assistant'), started, base)).toBe(false);
    const s = withManual(started, 'assistant');
    expect(isStepDone(step('assistant'), s, base)).toBe(true);
    expect(withManual(s, 'assistant')).toBe(s);
  });

  it('the steps are numbered in order and every step has an English title, a place and an explanation', () => {
    expect(TOUR_STEPS.map((s) => stepNumber(s.id))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(5);
      expect(s.body.length).toBeGreaterThan(60);
      expect(s.href.startsWith('/')).toBe(true);
      expect(s.body).not.toMatch(/[฀-๿]/); // English only
    }
  });
});
