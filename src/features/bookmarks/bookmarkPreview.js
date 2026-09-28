import { createBookmarkElement } from './bookmarkCard.js';

export function renderBookmarkPreview(container, bookmark, { faviconUrl = null } = {}) {
  if (!container) return;

  container.innerHTML = '';

  const previewBookmarkData = {
    ...bookmark,
    showFavicon: bookmark.backgroundFavicon
      ? false
      : bookmark.showFavicon
  };

  const previewBookmark = createBookmarkElement(previewBookmarkData, {
    isEditing: false,
    isPreview: true,
    faviconUrl
  });

  // quitar grid positioning
  previewBookmark.style.removeProperty('--x');
  previewBookmark.style.removeProperty('--y');
  previewBookmark.style.removeProperty('--w');
  previewBookmark.style.removeProperty('--h');

  container.appendChild(previewBookmark);
}
