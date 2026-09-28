import '../../types/types.js'; // typedefs

/**
 * Creates a favicon element for a bookmark.
 *
 * Attempts to fetch the site favicon without a leading www. or app.
 * If it fails or the URL is internal, uses the bookmark initials.
 *
 * @param {Bookmark} bookmark - Bookmark object
 * @param {Object} [options]
 * @param {string|null} [options.placeholderUrl] - Local image used instead of resolving a site.
 * @return {HTMLSpanElement} Theme-aware favicon container.
 */
export function createFavicon(bookmark, { placeholderUrl = null } = {}) {
  const favicon = createFaviconContainer(bookmark.name);

  if (placeholderUrl) {
    favicon.append(createFaviconImage(placeholderUrl));
    return favicon;
  }

  let isInternal = false;
  try {
    const urlObj = new URL(bookmark.url);
    isInternal = urlObj.hostname.endsWith('.internal') || urlObj.hostname.endsWith('.local');
    if (!isInternal) {
      const faviconOrigin = getFaviconOrigin(urlObj);
      const img = createFaviconImage();
      img.onerror = () => {
        img.onerror = null;
        showInitialsFallback(favicon, bookmark.name);
      };
      img.src =
        `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(faviconOrigin)}&size=64`;
      favicon.append(img);
    }
  } catch {
    showInitialsFallback(favicon, bookmark.name);
  }

  if (isInternal) showInitialsFallback(favicon, bookmark.name);

  return favicon;
}

function createFaviconContainer(name) {
  const favicon = document.createElement('span');
  favicon.className = 'bookmark-favicon';

  // Keep the same small `alt` contract callers used when this returned an img.
  Object.defineProperty(favicon, 'alt', {
    configurable: true,
    get: () => favicon.getAttribute('aria-label') || '',
    set: value => {
      setAlternativeText(favicon, value);
    }
  });
  favicon.alt = name || '';
  return favicon;
}

function createFaviconImage(src = '') {
  const image = document.createElement('img');
  image.className = 'bookmark-favicon-image';
  image.alt = '';
  image.draggable = false;
  if (src) image.src = src;
  return image;
}

function setAlternativeText(favicon, value) {
  const label = String(value || '');
  favicon.classList.toggle('has-alternative-text', Boolean(label));
  if (label) {
    favicon.setAttribute('role', 'img');
    favicon.setAttribute('aria-label', label);
    favicon.removeAttribute('aria-hidden');
    return;
  }

  favicon.removeAttribute('role');
  favicon.removeAttribute('aria-label');
  favicon.setAttribute('aria-hidden', 'true');
}

/**
 * Omits a leading www. or app. only for favicon discovery.
 * Google can return a valid generic image even with HTTP 404, so an image error
 * handler cannot reliably detect that these hosts need the parent site's icon.
 *
 * @param {URL} url
 * @returns {string}
 */
function getFaviconOrigin(url) {
  if (!/^(www|app)\./.test(url.hostname)) return url.origin;

  const faviconUrl = new URL(url.origin);
  faviconUrl.hostname = faviconUrl.hostname.slice(4);
  return faviconUrl.origin;
}

/**
 * Replaces a failed favicon with theme-aware bookmark initials.
 *
 * Used as a fallback when the favicon cannot be retrieved.
 *
 * @param {HTMLSpanElement} favicon - Favicon container.
 * @param {string} name - Bookmark display name.
 * @returns {void}
 */
function showInitialsFallback(favicon, name) {
  const initials = Array.from((name || '').trim())
    .filter(character => /[\p{L}\p{N}]/u.test(character))
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase() || '?';
  const text = document.createElement('span');
  text.className = 'bookmark-favicon-initials';
  text.setAttribute('aria-hidden', 'true');
  text.textContent = initials;
  favicon.classList.add('bookmark-favicon-fallback');
  favicon.replaceChildren(text);
}
