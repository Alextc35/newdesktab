import { DEFAULT_RECYCLE_BIN_STYLE } from './recycleBinDefaults.js';
import { normalizeBackgroundImage } from '../../shared/images/backgroundImage.js';

export const RECYCLE_BIN_STYLE_KEYS = Object.freeze([
  'noBackground',
  'backgroundColor',
  'backgroundImageUrl',
  'backgroundImageLocal',
  'backgroundImageSource',
  'backgroundImageUrlLocked',
  'iconColor',
  'textColor',
  'showIcon',
  'showName',
  'showCount'
]);

const IMAGE_PROTOCOLS = new Set(['http:', 'https:', 'data:']);

/** Returns a complete, persistence-safe recycle bin appearance object. */
export function normalizeRecycleBinStyle(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const image = normalizeBackgroundImage(source);
  return {
    noBackground: source.noBackground === true,
    backgroundColor: normalizeOptionalColor(source.backgroundColor),
    ...image,
    backgroundImageUrlLocked: Boolean(image.backgroundImageUrl)
      && image.backgroundImageUrlLocked,
    iconColor: isHexColor(source.iconColor)
      ? source.iconColor.toLowerCase()
      : DEFAULT_RECYCLE_BIN_STYLE.iconColor,
    textColor: normalizeOptionalColor(source.textColor),
    showIcon: source.showIcon !== false,
    showName: source.showName !== false,
    showCount: source.showCount !== false
  };
}

/** Validates and normalizes an editable recycle bin appearance. */
export function validateRecycleBinStyle(value = {}) {
  const style = normalizeRecycleBinStyle(value);
  const errors = {};

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
    value: style
  };
}

function normalizeOptionalColor(value) {
  return isHexColor(value) ? value.toLowerCase() : null;
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}
