import { resolveBackgroundImage } from '../../platform/images/localImages.js';
import { createFavicon } from './bookmarkFavicon.js';
import { lightSurfaceTextColor } from '../../shared/ui/surfaceContrast.js';

/**
 * Creates a bookmark card without attaching grid behavior. Editors, folder
 * previews and the main grid can therefore reuse the visual independently.
 */
export function createBookmarkElement(bookmark, options = {}) {
  const { isEditing = false, isPreview = false, faviconUrl = null } = options;
  const element = document.createElement('div');
  element.className = 'bookmark';
  element.classList.toggle('is-editing', isEditing);
  element.classList.toggle('is-preview', isPreview);

  applyBookmarkStyle(element, bookmark);
  createBookmarkContent(element, bookmark, isEditing, faviconUrl);
  return element;
}

function applyBookmarkStyle(element, bookmark) {
  element.classList.remove('is-favicon-bg', 'has-bg-image', 'invert-bg-image');
  element.style.removeProperty('--bookmark-bg-image');
  element.style.removeProperty('--color-bg-bookmark');
  element.style.removeProperty('--color-text-bookmark');

  const backgroundImage = resolveBackgroundImage(bookmark);
  element.classList.toggle('has-transparent-background', Boolean(
    bookmark.noBackground && (!backgroundImage || bookmark.backgroundFavicon)
  ));
  if (backgroundImage) {
    element.classList.add('has-bg-image');
    element.style.setProperty('--bookmark-bg-image', `url("${backgroundImage}")`);
    if (bookmark.invertColorBg) element.classList.add('invert-bg-image');
  }
  if (bookmark.backgroundFavicon) element.classList.add('is-favicon-bg');
  if (!bookmark.noBackground && bookmark.backgroundColor) {
    element.style.setProperty('--color-bg-bookmark', bookmark.backgroundColor);
  } else if (bookmark.noBackground) {
    element.style.setProperty('--color-bg-bookmark', 'transparent');
  }

  element.style.setProperty('--bookmark-light-text', lightSurfaceTextColor(bookmark.textColor));
  if (bookmark.textColor) {
    element.style.setProperty('--color-text-bookmark', bookmark.textColor);
  }
}

function createBookmarkContent(element, bookmark, isEditing, faviconUrl) {
  const link = document.createElement('a');
  link.href = bookmark.url || '#';
  link.title = bookmark.name || bookmark.url || '';
  link.className = 'bookmark-link';
  link.classList.toggle('is-editing', isEditing);

  if (bookmark.backgroundFavicon) {
    link.appendChild(createIcon(bookmark, faviconUrl));
    if (bookmark.showText) link.appendChild(createText(bookmark));
    element.appendChild(link);
    return;
  }

  const info = document.createElement('div');
  info.className = 'bookmark-info';
  if (bookmark.showFavicon ?? true) {
    const icon = createIcon(bookmark, faviconUrl);
    icon.style.width = '16px';
    icon.style.height = '16px';
    info.appendChild(icon);
  }
  if (bookmark.showText ?? true) info.appendChild(createText(bookmark));
  link.appendChild(info);
  element.appendChild(link);
}

function createIcon(bookmark, faviconUrl) {
  const image = createFavicon(bookmark, { placeholderUrl: faviconUrl });
  image.alt = bookmark.name || '';
  if (bookmark.invertColorIcon) image.style.filter = 'invert(1)';
  return image;
}

function createText(bookmark) {
  const text = document.createElement('span');
  text.className = 'bookmark-title';
  text.textContent = bookmark.name || '';
  text.style.color = 'var(--bookmark-context-text, var(--color-text-bookmark))';
  return text;
}
