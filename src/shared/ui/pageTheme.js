import '../../types/types.js'; // typedefs
import { VERSION } from '../../platform/browser/extensionMetadata.js';
import { resolveBackgroundImage } from '../../platform/images/localImages.js';

/**
 * Applies the page background settings and visible extension version.
 *
 * @param {Partial<Settings>} [settings={}]
 * @returns {void}
 */
export function applyPageTheme(settings = {}) {
  const root = document.documentElement;
  const theme = settings.theme || {};

  root.style.setProperty('--version', `"v${VERSION}"`);
  root.style.setProperty(
    '--color-bg-body',
    theme.backgroundSolid
      ? theme.backgroundColor
      : (theme.backgroundImageColor ?? theme.backgroundColor)
  );

  root.classList.toggle('is-default-bg', Boolean(theme.backgroundDefault));

  if (theme.backgroundDefault) {
    root.style.removeProperty('--image-bg-body');
    return;
  }

  const backgroundImage = theme.backgroundSolid ? null : resolveBackgroundImage(theme);
  root.style.setProperty(
    '--image-bg-body',
    backgroundImage ? `url("${backgroundImage}")` : 'none'
  );
}
