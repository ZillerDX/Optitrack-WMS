/**
 * Theme preference: light by default, dark on request, or follow the system.
 * The class on <html> is set by `themeScript` before the first paint (no flash), then kept in step by
 * ThemeProvider. Only the new pages use it; the pages not yet redesigned keep their own dark look.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'optitrack-theme';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** What the page looks like for a preference. No stored preference means light. */
export function resolveTheme(preference: ThemePreference | null, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'dark') return 'dark';
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return 'light';
}

/**
 * Runs inline in <head>, before the page is painted. Must stay tiny, dependency free and safe when
 * storage is blocked (private windows, strict browser settings): it then leaves the light theme.
 */
export const themeScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;if(d){e.classList.add('dark')}else{e.classList.remove('dark')}e.style.colorScheme=d?'dark':'light'}catch(x){}})();`;

export function readStoredPreference(): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}

export function storePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // storage blocked: the choice still applies to this page view
  }
}

export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}
