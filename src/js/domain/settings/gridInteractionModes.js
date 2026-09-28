export const BOOKMARK_DRAG_MODES = Object.freeze({
  NONE: 'none',
  CASCADE: 'cascade',
  RELOCATE: 'relocate'
});

export const BOOKMARK_RESIZE_MODES = Object.freeze({
  NONE: 'none',
  SMOOTH: 'smooth'
});

const VALID_DRAG_MODES = new Set(Object.values(BOOKMARK_DRAG_MODES));
const VALID_RESIZE_MODES = new Set(Object.values(BOOKMARK_RESIZE_MODES));

/** @returns {'none'|'cascade'|'relocate'} */
export function normalizeBookmarkDragMode(value) {
  return VALID_DRAG_MODES.has(value)
    ? value
    : BOOKMARK_DRAG_MODES.NONE;
}

/** @returns {'smooth'|'none'} */
export function normalizeBookmarkResizeMode(value) {
  return VALID_RESIZE_MODES.has(value)
    ? value
    : BOOKMARK_RESIZE_MODES.SMOOTH;
}
