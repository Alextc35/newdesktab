import '../../types/types.js';
import { DEFAULT_FOLDER_STYLE } from './folderDefaults.js';
import { normalizeBackgroundImage } from '../../shared/images/backgroundImage.js';
import { normalizeCatalogIconId } from '../../shared/icons/iconCatalog.js';

export const BOOKMARK_FOLDER_NAME_MAX_LENGTH = 60;

/** Normalizes editable folder identity without consulting application state. */
export function normalizeBookmarkFolderName(name) {
  return typeof name === 'string'
    ? name.trim().slice(0, BOOKMARK_FOLDER_NAME_MAX_LENGTH)
    : '';
}

export const FOLDER_STYLE_KEYS = Object.freeze([
  'iconId',
  'iconColor',
  'noBackground',
  'backgroundColor',
  'outerBackgroundColor',
  'noOuterBackground',
  'backgroundImageUrl',
  'backgroundImageLocal',
  'backgroundImageSource',
  'backgroundImageUrlLocked',
  'textColor',
  'showFolder',
  'showPreviews',
  'showName'
]);

const IMAGE_PROTOCOLS = new Set(['http:', 'https:', 'data:']);

/** Returns a complete, persistence-safe folder appearance object. */
export function normalizeFolderStyle(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const image = normalizeBackgroundImage(source);
  return {
    iconId: normalizeCatalogIconId(source.iconId),
    iconColor: isHexColor(source.iconColor) ? source.iconColor.toLowerCase() : null,
    noBackground: source.noBackground === true,
    backgroundColor: isHexColor(source.backgroundColor)
      ? source.backgroundColor.toLowerCase()
      : DEFAULT_FOLDER_STYLE.backgroundColor,
    outerBackgroundColor: isHexColor(source.outerBackgroundColor)
      ? source.outerBackgroundColor.toLowerCase()
      : DEFAULT_FOLDER_STYLE.outerBackgroundColor,
    // Older folders did not have this option and retain their original card.
    noOuterBackground: source.noOuterBackground === true,
    ...image,
    backgroundImageUrlLocked: Boolean(image.backgroundImageUrl)
      && image.backgroundImageUrlLocked,
    textColor: isHexColor(source.textColor)
      ? source.textColor.toLowerCase()
      : DEFAULT_FOLDER_STYLE.textColor,
    showFolder: true,
    showPreviews: source.showPreviews !== false,
    showName: source.showName !== false
  };
}

/** Validates editable folder identity and appearance fields. */
export function validateFolderDraft(value = {}) {
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const style = normalizeFolderStyle(value);
  const errors = {};

  if (!name) errors.name = 'required';

  if (style.backgroundImageUrl) {
    try {
      const parsed = new URL(style.backgroundImageUrl);
      if (!IMAGE_PROTOCOLS.has(parsed.protocol)) {
        errors.backgroundImageUrl = 'unsupportedProtocol';
      }
    } catch {
      errors.backgroundImageUrl = 'invalid';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: { ...style, name }
  };
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}
