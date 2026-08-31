/**
 * Theme selection. The palette lives entirely in CSS custom properties, so
 * switching themes is one attribute on <html> — no component knows which
 * theme is active, and none needs to.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'reflect.theme';

/** Dark is the designed default; light is an explicit choice, not a guess. */
export function getTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    // Private-mode browsers throw on storage access.
    return 'dark';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* the choice just will not survive the session */
  }
}
