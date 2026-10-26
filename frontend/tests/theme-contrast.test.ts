import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The design tokens in src/app/globals.css are HSL triplets. This checks the WCAG contrast of the pairs that
 * are used together, in both themes: body text and text on coloured surfaces at least 4.5:1, the accent and the
 * focus ring against the page at least 3:1.
 */

const css = readFileSync(path.resolve(import.meta.dirname, '../src/app/globals.css'), 'utf8').replace(/\r\n/g, '\n');

function block(selector: string): Record<string, [number, number, number]> {
  const start = css.indexOf(`  ${selector} {`);
  if (start < 0) throw new Error(`${selector} not found in globals.css`);
  const end = css.indexOf('\n  }', start);
  const tokens: Record<string, [number, number, number]> = {};
  for (const m of css.slice(start, end).matchAll(/--([a-z0-9-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%;/g)) {
    tokens[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return tokens;
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(hslToRgb(a)), luminance(hslToRgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['success', 'success-bg'],
  ['warning', 'warning-bg'],
  ['danger', 'danger-bg'],
  ['primary', 'card'],
  ['accent-foreground', 'card'],
];

describe.each([
  ['light', ':root'],
  ['dark', '.dark'],
] as const)('%s theme', (_name, selector) => {
  const t = block(selector);

  it('defines every token the pairs use', () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      expect(t[fg], `--${fg}`).toBeDefined();
      expect(t[bg], `--${bg}`).toBeDefined();
    }
  });

  it.each(TEXT_PAIRS)('text --%s on --%s is at least 4.5:1', (fg, bg) => {
    const ratio = contrast(t[fg], t[bg]);
    expect(ratio, `${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });

  it('the accent and the focus ring stand out from the page and from cards by at least 3:1', () => {
    for (const surface of ['background', 'card']) {
      expect(contrast(t.primary, t[surface]), `primary on ${surface}`).toBeGreaterThanOrEqual(3);
      expect(contrast(t.ring, t[surface]), `ring on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('the five chart colours can be told apart from the card and from each other by lightness or hue', () => {
    const colours = [1, 2, 3, 4, 5].map((n) => t[`chart-${n}`]);
    for (const c of colours) expect(contrast(c, t.card)).toBeGreaterThanOrEqual(2.2);
    for (let i = 0; i < colours.length; i++) {
      for (let j = i + 1; j < colours.length; j++) {
        const hueGap = Math.min(Math.abs(colours[i][0] - colours[j][0]), 360 - Math.abs(colours[i][0] - colours[j][0]));
        const different = hueGap >= 25 || contrast(colours[i], colours[j]) >= 1.5;
        expect(different, `chart-${i + 1} vs chart-${j + 1}`).toBe(true);
      }
    }
  });
});

describe('the pages not yet redesigned keep their dark values', () => {
  it('has a .legacy-dark block with the old dark tokens', () => {
    const legacy = block('.legacy-dark');
    expect(legacy.background).toEqual([222.2, 84, 4.9]);
    expect(legacy['primary-foreground']).toEqual([210, 40, 98]);
    expect(legacy.border).toEqual([217.2, 32.6, 17.5]);
  });
});
