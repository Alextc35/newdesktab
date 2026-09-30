import { resolveBackgroundImage } from '../../platform/images/localImages.js';
import { createFavicon } from './bookmarkFavicon.js';

/** Creates one read-only bookmark row for compact list surfaces. */
export function createBookmarkListItem(bookmark, { active = false } = {}) {
  const row = document.createElement('li');
  row.className = 'bookmark bookmark-list-item';
  row.dataset.bookmarkId = bookmark.id;
  row.classList.toggle('is-keyboard-active', active);

  const link = document.createElement('a');
  link.className = 'bookmark-list-link bookmark-link';
  link.href = bookmark.url || '#';

  const icon = createBookmarkListIcon(bookmark);
  const copy = document.createElement('span');
  copy.className = 'bookmark-list-copy';
  const name = document.createElement('span');
  name.className = 'bookmark-list-name';
  name.textContent = bookmark.name || bookmark.url || '—';
  const detail = document.createElement('span');
  detail.className = 'bookmark-list-detail';
  detail.textContent = describeUrl(bookmark.url);
  copy.append(name, detail);

  const arrow = document.createElement('span');
  arrow.className = 'bookmark-list-arrow';
  arrow.textContent = '›';
  arrow.setAttribute('aria-hidden', 'true');
  link.append(icon, copy, arrow);
  row.append(link);
  return row;
}

/** Reuses the saved bookmark artwork in list rows and recycle-bin thumbnails. */
export function createBookmarkListIcon(bookmark) {
  const icon = document.createElement('span');
  icon.className = 'bookmark-list-icon';
  icon.style.backgroundColor = bookmark.noBackground ? 'transparent' : bookmark.backgroundColor;
  const cover = !bookmark.backgroundFavicon && resolveBackgroundImage(bookmark);
  const showIcon = bookmark.backgroundFavicon || (bookmark.showFavicon ?? true);
  const image = cover ? document.createElement('img') : showIcon ? createFavicon(bookmark) : null;
  if (image) {
    if (cover) {
      image.src = cover;
      image.className = 'bookmark-list-cover';
    }
    if (cover ? bookmark.invertColorBg : bookmark.invertColorIcon) image.style.filter = 'invert(1)';
    image.alt = '';
    image.draggable = false;
    icon.append(image);
  }
  return icon;
}

function describeUrl(value) {
  try { return new URL(value).hostname.replace(/^www\./, '') || value; }
  catch { return value || ''; }
}
