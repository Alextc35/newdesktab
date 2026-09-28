import '../../types/types.js';
import { DEFAULT_FOLDER_STYLE } from './folderDefaults.js';
import { normalizeBackgroundImage } from '../../shared/images/backgroundImage.js';

export const BOOKMARK_FOLDER_NAME_MAX_LENGTH = 60;

/** Normalizes editable folder identity without consulting application state. */
export function normalizeBookmarkFolderName(name) {
  return typeof name === 'string'
    ? name.trim().slice(0, BOOKMARK_FOLDER_NAME_MAX_LENGTH)
    : '';
}

export const FOLDER_STYLE_KEYS = Object.freeze([
  'noBackground',
  'backgroundColor',
  'outerBackgroundColor',
  'backgroundImageUrl',
  'backgroundImageLocal',
  'backgroundImageSource',
  'backgroundImageUrlLocked',
  'textColor',
  'showFolder',
  'showPreviews',
  'showName',
  'showCount'
]);

const IMAGE_PROTOCOLS = new Set(['http:', 'https:', 'data:']);

/** Returns a complete, persistence-safe folder appearance object. */
export function normalizeFolderStyle(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const image = normalizeBackgroundImage(source);
  const showFolder = source.showFolder !== false;
  return {
    noBackground: source.noBackground === true,
    backgroundColor: isHexColor(source.backgroundColor)
      ? source.backgroundColor.toLowerCase()
      : DEFAULT_FOLDER_STYLE.backgroundColor,
    outerBackgroundColor: isHexColor(source.outerBackgroundColor)
      ? source.outerBackgroundColor.toLowerCase()
      : DEFAULT_FOLDER_STYLE.outerBackgroundColor,
    ...image,
    backgroundImageUrlLocked: Boolean(image.backgroundImageUrl)
      && image.backgroundImageUrlLocked,
    textColor: isHexColor(source.textColor)
      ? source.textColor.toLowerCase()
      : DEFAULT_FOLDER_STYLE.textColor,
    showFolder,
    showPreviews: showFolder && source.showPreviews !== false,
    showName: source.showName !== false,
    showCount: source.showCount !== false
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
