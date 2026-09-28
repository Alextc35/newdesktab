import '../../types/types.js';
import {
  DEFAULT_BOOKMARK,
  DEFAULT_BOOKMARK_STRUCTURE,
  DEFAULT_BOOKMARK_STYLE
} from './bookmarkDefaults.js';
import { normalizeBackgroundImage } from '../../shared/images/backgroundImage.js';

export const BOOKMARK_STYLE_KEYS = Object.freeze([
  'backgroundImageUrl',
  'backgroundImageLocal',
  'backgroundImageSource',
  'backgroundImageUrlLocked',
  'backgroundFavicon',
  'invertColorBg',
  'noBackground',
  'backgroundColor',
  'showText',
  'textColor',
  'showFavicon',
  'invertColorIcon'
]);

const BOOLEAN_STYLE_KEYS = new Set([
  'backgroundImageUrlLocked',
  'backgroundFavicon',
  'invertColorBg',
  'noBackground',
  'showText',
  'showFavicon',
  'invertColorIcon'
]);

const COLOR_STYLE_KEYS = new Set(['backgroundColor', 'textColor']);
const SUPPORTED_URL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'about:',
  'brave:',
  'chrome:',
  'edge:'
]);

/**
 * Returns a bookmark appearance object containing only supported style fields.
 * Unknown and identity fields are deliberately discarded.
 *
 * @param {Partial<BookmarkPreset>|Partial<Bookmark>} [value={}]
 * @returns {BookmarkPreset}
 */
export function normalizeBookmarkPreset(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const preset = {};

  for (const key of BOOKMARK_STYLE_KEYS) {
    const fallback = DEFAULT_BOOKMARK_STYLE[key];
    const candidate = source[key];

    if (BOOLEAN_STYLE_KEYS.has(key)) {
      preset[key] = typeof candidate === 'boolean' ? candidate : fallback;
      continue;
    }

    if (COLOR_STYLE_KEYS.has(key)) {
      preset[key] = isHexColor(candidate) ? candidate.toLowerCase() : fallback;
      continue;
    }

    preset[key] = typeof candidate === 'string' && candidate.trim()
      ? candidate.trim()
      : null;
  }

  return { ...preset, ...normalizeBackgroundImage(source) };
}

/**
 * Creates the editable value used by create and edit flows.
 *
 * @param {Object} [options]
 * @param {Partial<BookmarkPreset>} [options.preset]
 * @param {Partial<Bookmark>} [options.bookmark]
 * @returns {BookmarkDraft}
 */
export function createBookmarkDraft({ preset = {}, bookmark = {} } = {}) {
  const source = bookmark && typeof bookmark === 'object' ? bookmark : {};

  return {
    ...structuredClone(DEFAULT_BOOKMARK_STRUCTURE),
    ...normalizeBookmarkPreset(preset),
    ...pickBookmarkStructure(source),
    ...normalizeBookmarkPreset({
      ...normalizeBookmarkPreset(preset),
      ...source
    })
  };
}

/**
 * Creates a complete persisted bookmark without consulting global state.
 * Runtime dependencies can be injected to keep this function deterministic in tests.
 *
 * @param {Partial<Bookmark>} value
 * @param {Object} [options]
 * @param {Partial<BookmarkPreset>} [options.preset]
 * @param {number} [options.now]
 * @param {() => string} [options.idFactory]
 * @param {boolean} [options.touchUpdatedAt=true]
 * @returns {Bookmark}
 */
export function normalizeBookmark(value = {}, {
  preset = {},
  now = Date.now(),
  idFactory = () => crypto.randomUUID(),
  touchUpdatedAt = true
} = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const isNew = typeof source.id !== 'string' || !source.id.trim();
  const draft = createBookmarkDraft({ preset, bookmark: source });

  return {
    ...structuredClone(DEFAULT_BOOKMARK),
    ...draft,
    id: isNew ? idFactory() : source.id,
    name: draft.name.trim(),
    url: normalizeBookmarkUrl(draft.url),
    gx: normalizeGridValue(draft.gx, 0),
    gy: normalizeGridValue(draft.gy, 0),
    w: normalizeGridSize(draft.w),
    h: normalizeGridSize(draft.h),
    folderId: typeof draft.folderId === 'string' && draft.folderId.trim()
      ? draft.folderId
      : null,
    createdAt: isNew ? now : normalizeTimestamp(source.createdAt, now),
    updatedAt: touchUpdatedAt
      ? now
      : normalizeTimestamp(source.updatedAt, now)
  };
}

/**
 * Normalizes user-entered URLs. Host-like values receive an https scheme while
 * supported browser-internal schemes are preserved.
 *
 * @param {*} value
 * @returns {string}
 */
export function normalizeBookmarkUrl(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';

  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Validates an editor draft and returns field-addressable messages.
 * Empty URLs remain valid so visual-only tiles continue to be supported.
 *
 * @param {Partial<BookmarkDraft>} value
 * @returns {{isValid: boolean, errors: Record<string, string>, value: BookmarkDraft}}
 */
export function validateBookmarkDraft(value = {}) {
  const draft = createBookmarkDraft({ bookmark: value });
  const errors = {};

  if (!draft.name.trim()) errors.name = 'required';

  const normalizedUrl = normalizeBookmarkUrl(draft.url);
  if (normalizedUrl) {
    try {
      const parsed = new URL(normalizedUrl);
      if (!SUPPORTED_URL_PROTOCOLS.has(parsed.protocol)) errors.url = 'unsupportedProtocol';
    } catch {
      errors.url = 'invalid';
    }
  }

  if (draft.backgroundImageUrl) {
    try {
      const parsed = new URL(draft.backgroundImageUrl);
      if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) {
        errors.backgroundImageUrl = 'unsupportedProtocol';
      }
    } catch {
      errors.backgroundImageUrl = 'invalid';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: { ...draft, url: normalizedUrl }
  };
}

/**
 * Applies a visual preset without modifying bookmark identity or layout.
 *
 * @param {Partial<BookmarkDraft>|Partial<Bookmark>} bookmark
 * @param {Partial<BookmarkPreset>} preset
 * @returns {BookmarkDraft}
 */
export function applyBookmarkPreset(bookmark, preset) {
  return createBookmarkDraft({
    bookmark: {
      ...bookmark,
      ...normalizeBookmarkPreset(preset)
    }
  });
}

function pickBookmarkStructure(value) {
  const structure = {};

  for (const key of Object.keys(DEFAULT_BOOKMARK_STRUCTURE)) {
    if (value[key] !== undefined) structure[key] = value[key];
  }

  if (typeof value.id === 'string' && value.id.trim()) structure.id = value.id;
  return structure;
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}

function normalizeGridValue(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeGridSize(value) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizeTimestamp(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
