import '../../types/types.js'; // typedefs
import { resolveBackgroundImage } from '../../platform/images/localImages.js';

/**
 * Determines whether a styled grid-item surface should be considered dark.
 *
 * The evaluation is based on:
 * - Background color luminance
 * - Presence of a background image (assumed dark for contrast safety)
 * - Optional background color inversion flag
 *
 * This is mainly used to decide UI contrast (e.g. action button theme).
 *
 * @param {Object} item - Grid item with bookmark-compatible appearance fields.
 * @returns {boolean} True if the bookmark is considered visually dark.
 */
export function isGridItemSurfaceDark(item) {
  let dark = isDarkColor(item.backgroundColor);
  if (resolveBackgroundImage(item)) dark = true;
  if (item.invertColorBg) dark = !dark;
  return dark;
}

/**
 * Checks whether a hex color is considered dark based on luminance.
 *
 * Uses the relative luminance formula:
 * 0.2126R + 0.7152G + 0.0722B
 *
 * Any value below the defined threshold is treated as dark.
 * Non-hex or undefined values default to dark for safety.
 *
 * @param {string|null|undefined} color - Hex color string (e.g. "#ffffff").
 * @returns {boolean} True if the color is considered dark.
 */
function isDarkColor(color) {
  if (!color || color === 'transparent') return true;
  if (!color.startsWith('#')) return true;
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0,2), 16);
  const g = parseInt(hex.slice(2,4), 16);
  const b = parseInt(hex.slice(4,6), 16);
  const luminance = 0.2126*r + 0.7152*g + 0.0722*b;
  return luminance < 64;
}
