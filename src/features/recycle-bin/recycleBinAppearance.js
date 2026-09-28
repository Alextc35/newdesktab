import { resolveBackgroundImage } from '../../platform/images/localImages.js';
import { createRecycleBinSvg } from '../../shared/ui/svgIcons.js';

/** Applies persisted recycle-bin colors and element visibility. */
export function applyRecycleBinAppearance(element, recycleBin = {}) {
  const noBackground = recycleBin.noBackground === true;
  const backgroundColor = recycleBin.backgroundColor || null;
  const backgroundImage = resolveBackgroundImage(recycleBin);
  const textColor = recycleBin.textColor || null;

  element.classList.toggle('has-recycle-bin-background', Boolean(backgroundColor));
  element.classList.toggle('is-recycle-bin-transparent', noBackground);
  element.classList.toggle('has-recycle-bin-bg-image', Boolean(backgroundImage));
  element.classList.toggle('is-recycle-bin-icon-hidden', recycleBin.showIcon === false);
  element.classList.toggle('is-recycle-bin-name-hidden', recycleBin.showName === false);
  element.classList.toggle('is-recycle-bin-count-hidden', recycleBin.showCount === false);

  setOptionalProperty(element, '--recycle-bin-background', backgroundColor);
  setOptionalProperty(
    element,
    '--recycle-bin-bg-image',
    backgroundImage ? `url("${backgroundImage}")` : null
  );
  element.style.setProperty('--recycle-bin-icon-color', recycleBin.iconColor || '#475569');
  setOptionalProperty(element, '--recycle-bin-text-color', textColor);
}

/** Creates the glyph shared by grid, list and editor views. */
export function createRecycleBinGlyph() {
  const glyph = document.createElement('span');
  glyph.className = 'recycle-bin-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.append(createRecycleBinSvg());
  return glyph;
}

function setOptionalProperty(element, name, value) {
  if (value) element.style.setProperty(name, value);
  else element.style.removeProperty(name);
}
