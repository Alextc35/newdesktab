/** Browser families with an explicit NewDeskTab synchronization policy. */
export const SYNC_BROWSERS = Object.freeze({
  CHROME: 'chrome',
  BRAVE: 'brave',
  UNSUPPORTED: 'unsupported'
});

function hasBrand(brands, expectedBrand) {
  return Array.isArray(brands)
    && brands.some(({ brand } = {}) => brand === expectedBrand);
}

/**
 * Identifies browsers whose extension storage synchronization has been tested.
 * Brave is checked first because its user agent can look like Google Chrome.
 *
 * @param {Navigator|Object|undefined} navigatorLike
 * @returns {'chrome'|'brave'|'unsupported'}
 */
export function detectSyncBrowser(navigatorLike = globalThis.navigator) {
  const brands = navigatorLike?.userAgentData?.brands;

  if (navigatorLike?.brave || hasBrand(brands, 'Brave')) {
    return SYNC_BROWSERS.BRAVE;
  }

  if (hasBrand(brands, 'Google Chrome')) {
    return SYNC_BROWSERS.CHROME;
  }

  const userAgent = navigatorLike?.userAgent ?? '';
  const isChrome = /\bChrome\/\d/.test(userAgent);
  const isAnotherChromiumBrowser = /\b(?:Brave|Chromium|EdgA?|EdgiOS|OPR|Opera|Vivaldi|YaBrowser)\//.test(
    userAgent
  );

  return isChrome && !isAnotherChromiumBrowser
    ? SYNC_BROWSERS.CHROME
    : SYNC_BROWSERS.UNSUPPORTED;
}

/**
 * Google Chrome is currently the only browser where NewDeskTab sync has been
 * confirmed to propagate extension data between devices.
 */
export function getSyncBrowserSupport(navigatorLike = globalThis.navigator) {
  const browser = detectSyncBrowser(navigatorLike);

  return {
    browser,
    canSync: browser === SYNC_BROWSERS.CHROME
  };
}
