import '../../types/types.js';

export const FOLDER_GRID_COLUMNS = 6;
export const FOLDER_GRID_ROWS = 3;
export const FOLDER_GRID_CAPACITY = FOLDER_GRID_COLUMNS * FOLDER_GRID_ROWS;

/**
 * Builds the stable, one-cell layout used by bookmarks inside a folder.
 * Valid, non-overlapping saved positions are preserved. Legacy or colliding
 * positions are packed into the first available cell in reading order. Folders
 * can grow beyond the initial three visible rows without losing any entries.
 *
 * @param {Bookmark[]} bookmarks
 * @returns {Map<string, {gx: number, gy: number}>}
 */
export function createFolderBookmarkLayout(bookmarks) {
  const layout = new Map();
  const occupied = new Set();
  let nextIndex = 0;

  for (const bookmark of bookmarks) {
    if (!isFolderCell(bookmark.gx, bookmark.gy)) continue;
    const key = cellKey(bookmark.gx, bookmark.gy);
    if (occupied.has(key)) continue;
    occupied.add(key);
    layout.set(bookmark.id, { gx: bookmark.gx, gy: bookmark.gy });
  }

  for (const bookmark of bookmarks) {
    if (layout.has(bookmark.id)) continue;
    while (occupied.has(cellKey(nextIndex % FOLDER_GRID_COLUMNS, Math.floor(nextIndex / FOLDER_GRID_COLUMNS)))) nextIndex += 1;
    const position = { gx: nextIndex % FOLDER_GRID_COLUMNS, gy: Math.floor(nextIndex / FOLDER_GRID_COLUMNS) };
    occupied.add(cellKey(position.gx, position.gy));
    layout.set(bookmark.id, position);
  }

  return layout;
}

/** @returns {{gx: number, gy: number}|null} */
export function findFirstFreeFolderCell(occupied) {
  for (let gy = 0; gy <= Math.floor(occupied.size / FOLDER_GRID_COLUMNS); gy += 1) {
    for (let gx = 0; gx < FOLDER_GRID_COLUMNS; gx += 1) {
      if (!occupied.has(cellKey(gx, gy))) return { gx, gy };
    }
  }
  return null;
}

/** @returns {boolean} */
export function isFolderCell(gx, gy) {
  return Number.isInteger(gx)
    && Number.isInteger(gy)
    && gx >= 0
    && gx < FOLDER_GRID_COLUMNS
    && gy >= 0
    && Number.isSafeInteger(gy);
}

/** @returns {string} */
export function cellKey(gx, gy) {
  return `${gx}:${gy}`;
}
