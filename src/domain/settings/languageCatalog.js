/** Shipped Chrome locales, with names that remain recognizable in any UI language. */
export const LANGUAGE_CATALOG = Object.freeze([
  { code: 'am', name: 'አማርኛ', regions: ['ET'] },
  { code: 'ar', name: 'العربية', regions: ['SA', 'EG', 'AE', 'MA', 'DZ', 'IQ', 'JO', 'TN', 'LB', 'KW', 'QA', 'OM', 'BH', 'LY', 'PS', 'SD', 'YE', 'SY', 'MR', 'SO', 'KM', 'DJ'], direction: 'rtl' },
  { code: 'bg', name: 'Български', regions: ['BG'] },
  { code: 'bn', name: 'বাংলা', regions: ['BD', 'IN'] },
  { code: 'ca', name: 'Català', regions: ['ES', 'AD'] },
  { code: 'cs', name: 'Čeština', regions: ['CZ'] },
  { code: 'da', name: 'Dansk', regions: ['DK'] },
  { code: 'de', name: 'Deutsch', regions: ['DE', 'AT', 'CH', 'LI'] },
  { code: 'el', name: 'Ελληνικά', regions: ['GR', 'CY'] },
  { code: 'en', name: 'English', regions: ['US', 'GB', 'AU', 'CA', 'IE', 'NZ', 'ZA', 'IN', 'NG', 'GH', 'KE', 'PK', 'PH', 'SG', 'TZ', 'UG', 'JM', 'TT', 'BZ', 'MT'] },
  { code: 'es', name: 'Español', regions: ['ES'] },
  { code: 'es_419', name: 'Español (Latinoamérica)', regions: ['MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'CR', 'CU', 'DO', 'GT', 'HN', 'NI', 'PA', 'PR', 'SV'] },
  { code: 'et', name: 'Eesti', regions: ['EE'] },
  { code: 'fa', name: 'فارسی', regions: ['IR', 'AF'], direction: 'rtl' },
  { code: 'fi', name: 'Suomi', regions: ['FI'] },
  { code: 'fil', name: 'Filipino', regions: ['PH'] },
  { code: 'fr', name: 'Français', regions: ['FR', 'BE', 'CH', 'CA', 'LU', 'SN', 'CI', 'CM', 'CD', 'CG', 'BJ', 'BF', 'GA', 'GN', 'ML', 'NE', 'TD', 'MG', 'HT', 'RW', 'BI', 'DJ', 'KM', 'SC', 'MC'] },
  { code: 'gu', name: 'ગુજરાતી', regions: ['IN'] },
  { code: 'he', name: 'עברית', regions: ['IL'], direction: 'rtl' },
  { code: 'hi', name: 'हिन्दी', regions: ['IN'] },
  { code: 'hr', name: 'Hrvatski', regions: ['HR', 'BA'] },
  { code: 'hu', name: 'Magyar', regions: ['HU'] },
  { code: 'id', name: 'Bahasa Indonesia', regions: ['ID'] },
  { code: 'it', name: 'Italiano', regions: ['IT', 'CH', 'SM', 'VA'] },
  { code: 'ja', name: '日本語', regions: ['JP'] },
  { code: 'kn', name: 'ಕನ್ನಡ', regions: ['IN'] },
  { code: 'ko', name: '한국어', regions: ['KR'] },
  { code: 'lt', name: 'Lietuvių', regions: ['LT'] },
  { code: 'lv', name: 'Latviešu', regions: ['LV'] },
  { code: 'ml', name: 'മലയാളം', regions: ['IN'] },
  { code: 'mr', name: 'मराठी', regions: ['IN'] },
  { code: 'ms', name: 'Bahasa Melayu', regions: ['MY', 'BN', 'SG'] },
  { code: 'nl', name: 'Nederlands', regions: ['NL', 'BE', 'SR'] },
  { code: 'no', name: 'Norsk', regions: ['NO'] },
  { code: 'pl', name: 'Polski', regions: ['PL'] },
  { code: 'pt_BR', name: 'Português (Brasil)', regions: ['BR'] },
  { code: 'pt_PT', name: 'Português (Portugal)', regions: ['PT', 'AO', 'MZ', 'CV'] },
  { code: 'ro', name: 'Română', regions: ['RO', 'MD'] },
  { code: 'ru', name: 'Русский', regions: ['RU', 'BY', 'KZ', 'KG'] },
  { code: 'sk', name: 'Slovenčina', regions: ['SK'] },
  { code: 'sl', name: 'Slovenščina', regions: ['SI'] },
  { code: 'sr', name: 'Српски', regions: ['RS', 'BA', 'ME'] },
  { code: 'sv', name: 'Svenska', regions: ['SE', 'FI'] },
  { code: 'sw', name: 'Kiswahili', regions: ['TZ', 'KE', 'UG', 'CD'] },
  { code: 'ta', name: 'தமிழ்', regions: ['IN', 'LK', 'SG'] },
  { code: 'te', name: 'తెలుగు', regions: ['IN'] },
  { code: 'th', name: 'ไทย', regions: ['TH'] },
  { code: 'tr', name: 'Türkçe', regions: ['TR', 'CY'] },
  { code: 'uk', name: 'Українська', regions: ['UA'] },
  { code: 'vi', name: 'Tiếng Việt', regions: ['VN'] },
  { code: 'zh_CN', name: '简体中文', regions: ['CN', 'SG'] },
  { code: 'zh_TW', name: '繁體中文', regions: ['TW', 'HK', 'MO'] }
].map(language => Object.freeze({ ...language, regions: Object.freeze(language.regions) })));

export const SUPPORTED_LANGUAGES = Object.freeze(LANGUAGE_CATALOG.map(language => language.code));

export function getLanguageDirection(code) {
  return LANGUAGE_CATALOG.find(language => language.code === code)?.direction ?? 'ltr';
}

/** Search both native names and names of languages/countries familiar to the user. */
export function getLanguageSearchTerms(language, uiLanguage = 'en') {
  const terms = [language.code, language.name];
  for (const locale of new Set([uiLanguage.replaceAll('_', '-'), 'en', 'es'])) {
    const languages = new Intl.DisplayNames([locale], { type: 'language' });
    const regions = new Intl.DisplayNames([locale], { type: 'region' });
    terms.push(languages.of(language.code.replaceAll('_', '-')));
    terms.push(...language.regions.flatMap(region => [region, regions.of(region)]));
  }
  return terms.join(' ');
}
