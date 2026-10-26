import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { isThemePreference, resolveTheme, themeScript, THEME_STORAGE_KEY } from '@/lib/theme';

describe('resolveTheme', () => {
  it('is light unless the user chose dark or system', () => {
    expect(resolveTheme(null, true)).toBe('light'); // nothing stored: light, even on a dark system
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('knows its preferences', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('auto')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(1)).toBe(false);
  });
});

/** Run the inline script against a fake page and report what it did to <html>. */
function runScript(opts: { stored?: string | null; systemDark?: boolean; storageThrows?: boolean; matchMediaThrows?: boolean }) {
  const classes = new Set<string>();
  const style: Record<string, string> = {};
  const sandbox = {
    localStorage: {
      getItem: (key: string) => {
        if (opts.storageThrows) throw new Error('SecurityError');
        return key === THEME_STORAGE_KEY ? (opts.stored ?? null) : null;
      },
    },
    window: {
      matchMedia: () => {
        if (opts.matchMediaThrows) throw new Error('no matchMedia');
        return { matches: Boolean(opts.systemDark) };
      },
    },
    document: {
      documentElement: {
        classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
        style,
      },
    },
  };
  // the script uses the bare names localStorage / window / document, as it does in a page
  runInNewContext(themeScript, { ...sandbox, localStorage: sandbox.localStorage, window: sandbox.window, document: sandbox.document });
  return { dark: classes.has('dark'), colorScheme: style.colorScheme };
}

describe('the inline script that sets the theme before the first paint', () => {
  it('leaves the page light when nothing is stored, even if the system is dark', () => {
    expect(runScript({ stored: null, systemDark: true })).toEqual({ dark: false, colorScheme: 'light' });
  });

  it('applies a stored dark choice', () => {
    expect(runScript({ stored: 'dark' })).toEqual({ dark: true, colorScheme: 'dark' });
  });

  it('applies a stored light choice', () => {
    expect(runScript({ stored: 'light', systemDark: true })).toEqual({ dark: false, colorScheme: 'light' });
  });

  it('follows the system for "system"', () => {
    expect(runScript({ stored: 'system', systemDark: true })).toEqual({ dark: true, colorScheme: 'dark' });
    expect(runScript({ stored: 'system', systemDark: false })).toEqual({ dark: false, colorScheme: 'light' });
  });

  it('ignores a value it does not know', () => {
    expect(runScript({ stored: 'purple', systemDark: true })).toEqual({ dark: false, colorScheme: 'light' });
  });

  it('never throws when storage is blocked (private window, strict settings) and stays light', () => {
    expect(() => runScript({ storageThrows: true })).not.toThrow();
    expect(runScript({ storageThrows: true }).dark).toBe(false);
  });

  it('never throws when matchMedia is missing for "system"', () => {
    expect(() => runScript({ stored: 'system', matchMediaThrows: true })).not.toThrow();
  });

  it('is small enough to live in the <head>', () => {
    expect(themeScript.length).toBeLessThan(500);
  });
});
