import '../../types/types.js'; // typedefs
import { VERSION } from '../browser/extensionMetadata.js';
import { loadTranslations } from '../../lang/index.js';
import {
  normalizeLanguagePreference,
  resolveLanguage
} from '../../domain/settings/interfacePreferences.js';

/** @type {TranslationTree} */
let translations = {};

/** @type {string|null} */
let currentLang = null;
let activePreference = 'system';
let languageRequest = 0;

function getDeviceLanguage() {
  return globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language;
}

/** @type {Set<(language: string) => void>} */
const languageChangeListeners = new Set();

/**
 * Initializes the internationalization system.
 *
 * Loads translations for the supplied application settings and applies them to
 * the document. State access remains at the application composition boundary.
 *
 * @param {Partial<Settings>} [settings={}]
 * @returns {Promise<void>}
 */
export async function initI18n(settings = {}) {
  await changeLanguage(settings);
  window.addEventListener('languagechange', () => {
    if (activePreference === 'system') void changeLanguage({ language: 'system' });
  });
}

/**
 * Changes the active language and reapplies translations to the document.
 *
 * @param {Partial<Settings>} [settings={}] - Settings object containing the language to apply.
 * @returns {Promise<void>}
 */
export async function changeLanguage(settings = {}) {
  activePreference = normalizeLanguagePreference(settings.language);
  const language = resolveLanguage(activePreference, getDeviceLanguage());
  const request = ++languageRequest;
  const nextTranslations = language === currentLang ? translations : await loadTranslations(language);
  if (request !== languageRequest) return;
  translations = nextTranslations;
  currentLang = language;

  applyI18n(document, { VERSION });
  for (const listener of languageChangeListeners) listener(currentLang);
}

/**
 * Subscribes UI containing locale-formatted values to live language changes.
 *
 * @param {(language: string) => void} listener
 * @returns {() => void}
 */
export function subscribeLanguageChange(listener) {
  languageChangeListeners.add(listener);
  return () => languageChangeListeners.delete(listener);
}

/**
 * Resolves a translation key using dot-notation and interpolates parameters.
 *
 * @param {string} key - Translation key (e.g. "alert.bookmarks.no_space").
 * @param {Object<string, string|number>} [params={}] - Parameters for template interpolation.
 * @returns {string} The translated string, or the key if not found.
 */
export function t(key, params = {}) {
  const parts = key.split('.');
  let value = translations;

  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) return key;
  }

  if (typeof value !== 'string') return key;

  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? '');
}

/**
 * Applies translations to all elements within a root node that have
 * a `data-i18n` attribute.
 *
 * @param {Document|HTMLElement} [root=document] - Root element to search within.
 * @param {Object<string, string|number>} [params={}] - Interpolation parameters.
 * @returns {void}
 */
export function applyI18n(root = document, params = {}) {
  document.documentElement.lang = (currentLang || 'en').replaceAll('_', '-');

  const elements = root.querySelectorAll('[data-i18n], [data-i18n-aria-label]');

  elements.forEach(el => {
    const key = el.dataset.i18nAriaLabel || el.dataset.i18n;
    const text = t(key, params);

    if (el.dataset.i18nAriaLabel) {
      el.setAttribute('aria-label', text);
    } else if (el.placeholder !== undefined && el.tagName === 'INPUT') {
      el.placeholder = text;
    } else {
      el.textContent = text;
    }
  });
}
