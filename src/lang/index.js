/**
 * Loads translation JSON file for a given language.
 *
 * @param {string} lang - Language code (e.g. "en", "es").
 * @returns {Promise<TranslationTree>}
 */
export async function loadTranslations(lang) {
  const url = chrome.runtime.getURL(`src/lang/${lang}.json`);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load translations: ${lang}`);

  return response.json();
}