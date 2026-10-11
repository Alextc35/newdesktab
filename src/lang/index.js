/**
 * Loads translation JSON file for a given language.
 *
 * @param {string} lang - Language code (e.g. "en", "es").
 * @returns {Promise<TranslationTree>}
 */
export async function loadTranslations(lang) {
  const url = chrome.runtime.getURL(`src/lang/${lang}.json`);

  const manualLang = lang === 'es_419' ? 'es' : lang;
  const manualUrl = chrome.runtime.getURL(`src/lang/manual/${manualLang}.json`);
  const responses = await Promise.all([fetch(url), fetch(manualUrl)]);
  if (responses.some(response => !response.ok)) throw new Error(`Failed to load translations: ${lang}`);
  const [translations, manual] = await Promise.all(responses.map(response => response.json()));
  return { ...translations, manual };
}
