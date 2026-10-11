import { DEFAULT_FOLDER_STYLE } from '../../domain/folders/folderDefaults.js';
import { resolveBackgroundImage } from '../../platform/images/localImages.js';
import {
  captionBackground,
  readableSurfaceBorderColor,
  readableSurfacePalette
} from '../../shared/ui/surfaceContrast.js';

// Contrast baselines use the darkest light veil and the brightest dark veil
// possible over a wallpaper, with the same 62% opacity as the contents CSS.
const LIGHT_CONTENTS = { surface: '#f6f6f7', transparentSurface: '#989899',
  transparentBorder: 'rgba(36, 36, 40, .2)' };
const DARK_CONTENTS = { surface: '#18181a', transparentSurface: '#707071',
  transparentBorder: 'rgba(255, 255, 255, .16)' };

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
  element.style.setProperty('--folder-caption-background', captionBackground(folder.textColor || DEFAULT_FOLDER_STYLE.textColor));
  element.classList.toggle('has-folder-bg-image', Boolean(resolveBackgroundImage(folder)));
}

/** Opaque folders accent their border; transparent folders stay entirely neutral. */
export function applyFolderContentsAppearance(element, folder = {}) {
  const transparent = folder.noBackground === true;
  const light = createContentsPalette(folder, LIGHT_CONTENTS);
  const dark = createContentsPalette(folder, DARK_CONTENTS);
  element.classList.toggle('is-folder-contents-transparent', transparent);
  for (const [variable, key] of Object.entries({
    '--folder-contents-background': 'background',
    '--folder-contents-border': 'border',
    '--folder-contents-text': 'text',
    '--folder-contents-muted': 'muted',
    '--folder-control-text': 'controlText',
    '--folder-control-background': 'controlBackground',
    '--folder-control-hover': 'controlHover',
    '--folder-control-active': 'controlActive',
    '--folder-control-border': 'controlBorder'
  })) {
    element.style.setProperty(variable, `light-dark(${light[key]}, ${dark[key]})`);
  }
}

function contentsContrastSurface(folder, theme) {
  return folder.noBackground === true ? theme.transparentSurface : theme.surface;
}

function createContentsPalette(folder, theme) {
  const background = contentsContrastSurface(folder, theme);
  return {
    ...readableSurfacePalette(background, { controlBackgroundColor: theme.surface }),
    background: theme.surface,
    border: folder.noBackground === true ? theme.transparentBorder
      : readableSurfaceBorderColor(folder.backgroundColor || DEFAULT_FOLDER_STYLE.backgroundColor, background)
  };
}
