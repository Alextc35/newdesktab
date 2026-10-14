import { SUPPORTED_LANGUAGES } from './languageCatalog.js';

const INTERFACE_THEMES = ['system', 'light', 'dark'];
const LANGUAGES = ['system', ...SUPPORTED_LANGUAGES];
const LATIN_AMERICAN_REGIONS = new Set([
  '419', 'AR', 'BO', 'BR', 'BZ', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC',
  'GT', 'HN', 'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'US', 'UY', 'VE'
]);

export function normalizeInterfaceTheme(value) {
  return INTERFACE_THEMES.includes(value) ? value : 'system';
}

export function normalizeLanguagePreference(value) {
  return LANGUAGES.includes(value) ? value : 'system';
}

/** Keep the automatic preference portable; resolve it on the current device. */
export function resolveLanguage(preference, deviceLanguage) {
  const normalized = normalizeLanguagePreference(preference);
  if (normalized !== 'system') return normalized;

  const [language, ...parts] = String(deviceLanguage ?? '').replaceAll('_', '-').split('-');
  const region = parts.find(part => /^[a-z]{2}$|^\d{3}$/i.test(part))?.toUpperCase();
  switch (language.toLowerCase()) {
    case 'es': return LATIN_AMERICAN_REGIONS.has(region) ? 'es_419' : 'es';
    case 'pt': return region === 'PT' || ['AO', 'MZ', 'CV', 'GW', 'ST', 'TL'].includes(region)
      ? 'pt_PT' : 'pt_BR';
    case 'zh': return parts.some(part => /^hant$/i.test(part))
      || (!parts.some(part => /^hans$/i.test(part)) && ['TW', 'HK', 'MO'].includes(region))
      ? 'zh_TW' : 'zh_CN';
    case 'nb': case 'nn': return 'no';
    case 'tl': return 'fil';
    case 'iw': return 'he';
    default: return SUPPORTED_LANGUAGES.includes(language.toLowerCase()) ? language.toLowerCase() : 'en';
  }
}
