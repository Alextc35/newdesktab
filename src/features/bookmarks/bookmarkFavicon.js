import '../../types/types.js'; // typedefs
import { getFaviconOrigins } from './faviconOrigins.js';
import { getFaviconUrl, isFaviconAvailable } from '../../platform/images/faviconService.js';
import { createCatalogIcon } from '../../shared/ui/catalogIcon.js';
import { lightSurfaceTextColor, readableSurfaceTextColor } from '../../shared/ui/surfaceContrast.js';

/**
 * Creates a favicon element for a bookmark.
 *
 * Resolves the site's favicon origin independently of the bookmark destination.
 * If it fails or the URL is internal, uses the bookmark initials.
 *
 * @param {Bookmark} bookmark - Bookmark object
 * @param {Object} [options]
 * @param {string|null} [options.placeholderUrl] - Local image used instead of resolving a site.
 * @param {boolean} [options.fitToContent=false] - Center compact SVGs using their actual artwork bounds.
 * @return {HTMLSpanElement} Theme-aware favicon container.
 */
export function createFavicon(bookmark, { placeholderUrl = null, fitToContent = false } = {}) {
  const favicon = createFaviconContainer(bookmark.name);
  const customIcon = createCatalogIcon(bookmark.iconId, { fitToContent });
  if (customIcon) {
    favicon.classList.add('bookmark-favicon-catalog');
    if (bookmark.iconColor) favicon.style.setProperty('--bookmark-icon-color', bookmark.iconColor);
    favicon.style.setProperty('--catalog-icon-light', lightSurfaceTextColor(bookmark.textColor));
    favicon.style.setProperty('--catalog-icon-dark', readableSurfaceTextColor(bookmark.textColor, '#18181a'));
    favicon.append(customIcon);
    return favicon;
  }

  if (placeholderUrl) {
    favicon.append(createFaviconImage(placeholderUrl));
    return favicon;
  }

  const origins = getFaviconOrigins(bookmark.url);
  if (!origins.length) {
    showInitialsFallback(favicon, bookmark.name);
    return favicon;
  }

  const img = createFaviconImage();
  let attempt = 0;
  function tryNext() {
    const origin = origins[attempt++];
    if (!origin) {
      img.onload = null;
      img.onerror = null;
      showInitialsFallback(favicon, bookmark.name);
      return;
    }
    const currentAttempt = attempt;
    img.onload = () => {
      void isFaviconAvailable(origin).then(available => {
        if (attempt === currentAttempt && available === false) tryNext();
      });
    };
    img.onerror = tryNext;
    img.src = getFaviconUrl(origin);
  }
  tryNext();
  favicon.append(img);

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
