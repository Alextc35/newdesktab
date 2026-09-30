import { resolveBackgroundImage } from '../../platform/images/localImages.js';
import { createFavicon } from '../bookmarks/bookmarkFavicon.js';
import { lightSurfaceTextColor } from '../../shared/ui/surfaceContrast.js';
import { createFolderSvg } from '../../shared/ui/svgIcons.js';

/** Creates the shared folder glyph used by cards, previews and headers. */
export function createFolderVisual(folder, bookmarks = [], { compact = false } = {}) {
  const visual = document.createElement('span');
  visual.className = 'folder-visual';
  visual.classList.toggle('is-compact', compact);
  visual.setAttribute('aria-hidden', 'true');
  applyFolderAppearance(visual, folder);

  const backgroundImage = resolveBackgroundImage(folder);
  // Animated formats repaint reliably as CSS backgrounds, not SVG pattern images.
  const useCssImageLayer = shouldUseCssImageLayer(backgroundImage);
  const artwork = createFolderSvg(useCssImageLayer ? null : backgroundImage);
  if (useCssImageLayer) {
    const imageLayer = document.createElement('span');
    imageLayer.className = 'folder-image-layer';
    imageLayer.style.backgroundImage = `url(${JSON.stringify(backgroundImage)})`;
    visual.classList.add('has-folder-image-layer');
    visual.append(imageLayer);
  }
  const body = document.createElement('span');
  body.className = 'folder-body';
  const previews = document.createElement('span');
  previews.className = 'folder-previews';

  if (!compact && folder.showFolder !== false && folder.showPreviews !== false) {
    const hasOverflow = bookmarks.length > 4;
    const previewLimit = hasOverflow ? 3 : 4;
    for (const bookmark of bookmarks.slice(0, previewLimit)) {
      const image = createFavicon(bookmark);
      image.alt = '';
      previews.append(image);
    }

    if (hasOverflow) {
      const remaining = document.createElement('span');
      remaining.className = 'folder-preview-more';
      remaining.textContent = `+${bookmarks.length - previewLimit}`;
      previews.append(remaining);
    }

    if (bookmarks.length > 1) {
      const compactRemaining = document.createElement('span');
      compactRemaining.className = 'folder-preview-compact-more';
      compactRemaining.textContent = `+${bookmarks.length - 1}`;
      body.append(compactRemaining);
    }
  }

  body.prepend(previews);
  visual.append(artwork, body);
  return visual;
}

function shouldUseCssImageLayer(url) {
  if (!url) return false;
  return /^data:image\/gif(?:;|,)/i.test(url)
    || /\.(?:gif|webp)(?:$|[?#])/i.test(url);
}

/** Applies persisted folder colors and optional imagery through CSS variables. */
export function applyFolderAppearance(element, folder = {}) {
  element.style.setProperty('--folder-light-text', lightSurfaceTextColor(folder.textColor));
  element.classList.toggle('is-folder-transparent', folder.noBackground === true);
  element.classList.toggle('is-folder-outer-transparent', folder.noOuterBackground === true);
  element.classList.toggle('is-folder-hidden', folder.showFolder === false);
  element.classList.toggle('is-folder-preview-hidden', folder.showFolder === false || folder.showPreviews === false);
  element.classList.toggle('is-folder-name-hidden', folder.showName === false);
  element.classList.toggle('is-folder-count-hidden', folder.showCount === false);
  const outerColor = folder.outerBackgroundColor;
  element.classList.toggle('has-folder-outer-color', Boolean(outerColor));
  if (outerColor) element.style.setProperty('--folder-outer-color', outerColor);
  else element.style.removeProperty('--folder-outer-color');
  element.style.setProperty(
    '--folder-color',
    folder.backgroundColor || '#38bdf8'
  );
  element.style.setProperty(
    '--folder-text-color',
    folder.textColor || '#f8fafc'
  );

  const backgroundImage = resolveBackgroundImage(folder) ?? '';
  element.classList.toggle('has-folder-bg-image', Boolean(backgroundImage));
}
