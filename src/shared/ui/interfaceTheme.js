import { normalizeInterfaceTheme } from '../../domain/settings/interfacePreferences.js';

/** Applies the portable interface-theme preference to the document root. */
export function applyInterfaceTheme(preference) {
  document.documentElement.dataset.interfaceTheme = normalizeInterfaceTheme(preference);
}
