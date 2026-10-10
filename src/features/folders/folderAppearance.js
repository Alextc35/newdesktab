import { DEFAULT_FOLDER_STYLE } from '../../domain/folders/folderDefaults.js';
import { resolveBackgroundImage } from '../../platform/images/localImages.js';
import {
  readableSurfaceBorderColor,
  readableSurfacePalette,
  readableSurfaceTextColor
} from '../../shared/ui/surfaceContrast.js';

const CONTENTS_SURFACE = '#18181a';
// The 62% neutral veil remains readable even over an entirely white wallpaper.
const TRANSPARENT_CONTENTS_SURFACE = '#707071';

/** Applies saved artwork and card appearance without reading application state. */
export function applyFolderAppearance(element, folder = {}) {
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
  element.style.setProperty('--folder-color', folder.backgroundColor || DEFAULT_FOLDER_STYLE.backgroundColor);
  element.style.setProperty('--folder-text-color', folder.textColor || DEFAULT_FOLDER_STYLE.textColor);
  element.classList.toggle('has-folder-bg-image', Boolean(resolveBackgroundImage(folder)));
}

/** Opaque folders accent their border; transparent folders stay entirely neutral. */
export function applyFolderContentsAppearance(element, folder = {}) {
  const transparent = folder.noBackground === true;
  const color = folder.backgroundColor || DEFAULT_FOLDER_STYLE.backgroundColor;
  const background = transparent ? TRANSPARENT_CONTENTS_SURFACE : CONTENTS_SURFACE;
  const palette = readableSurfacePalette(background, {
    controlBackgroundColor: CONTENTS_SURFACE
  });
  element.classList.toggle('is-folder-contents-transparent', transparent);
  element.style.setProperty('--folder-contents-background', CONTENTS_SURFACE);
  element.style.setProperty('--folder-contents-border', transparent
    ? 'rgba(255, 255, 255, .16)'
    : readableSurfaceBorderColor(color, background));
  element.style.setProperty('--folder-contents-text', palette.text);
  element.style.setProperty('--folder-contents-muted', palette.muted);
  element.style.setProperty('--folder-control-text', palette.controlText);
  element.style.setProperty('--folder-control-background', palette.controlBackground);
  element.style.setProperty('--folder-control-hover', palette.controlHover);
  element.style.setProperty('--folder-control-active', palette.controlActive);
  element.style.setProperty('--folder-control-border', palette.controlBorder);
}

/** Keeps bookmark colors where they contrast with the neutral contents surface. */
export function applyFolderBookmarkContrast(element, bookmark, folder = {}) {
  element.style.removeProperty('--folder-bookmark-text');
  if (!element.classList.contains('has-transparent-background')) return;
  element.style.setProperty('--folder-bookmark-text', readableSurfaceTextColor(
    bookmark.textColor,
    folder.noBackground === true ? TRANSPARENT_CONTENTS_SURFACE : CONTENTS_SURFACE
  ));
}
