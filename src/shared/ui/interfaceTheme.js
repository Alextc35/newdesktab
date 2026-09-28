import { normalizeInterfaceTheme } from '../../domain/settings/interfacePreferences.js';

/** Applies the portable interface-theme preference to the document root. */
export function applyInterfaceTheme(preference) {
  document.documentElement.dataset.interfaceTheme = normalizeInterfaceTheme(preference);
}

/** Resolves the effective interface theme, including the operating-system preference. */
export function isDarkInterfaceActive() {
  const interfaceTheme = document.documentElement.dataset.interfaceTheme;
  if (interfaceTheme === 'light') return false;
  if (interfaceTheme === 'dark') return true;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
}
