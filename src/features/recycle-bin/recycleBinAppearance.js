import { resolveBackgroundImage } from '../../platform/images/localImages.js';
import { createRecycleBinSvg } from '../../shared/ui/svgIcons.js';
import { captionBackground } from '../../shared/ui/surfaceContrast.js';
import { createCatalogIcon } from '../../shared/ui/catalogIcon.js';

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
  element.style.setProperty('--recycle-bin-caption-background', captionBackground(textColor || '#f8fafc'));
}

/** Creates the glyph shared by grid, list and editor views. */
export function createRecycleBinGlyph(recycleBin = {}) {
  const glyph = document.createElement('span');
  glyph.className = 'recycle-bin-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  const customIcon = createCatalogIcon(recycleBin.iconId);
  glyph.classList.toggle('has-catalog-icon', Boolean(customIcon));
  glyph.append(customIcon || createRecycleBinSvg());
  return glyph;
}

function setOptionalProperty(element, name, value) {
  if (value) element.style.setProperty(name, value);
  else element.style.removeProperty(name);
}
