import '../../types/types.js';

export const FOLDER_GRID_COLUMNS = 6;
export const FOLDER_GRID_ROWS = 3;
export const FOLDER_GRID_CAPACITY = FOLDER_GRID_COLUMNS * FOLDER_GRID_ROWS;

/**
 * Builds the stable, one-cell layout used by bookmarks inside a folder.
 * Valid, non-overlapping saved positions are preserved. Legacy or colliding
 * positions are packed into the first available cell in reading order.
 *
 * @param {Bookmark[]} bookmarks
 * @returns {Map<string, {gx: number, gy: number}>}
 */
export function createFolderBookmarkLayout(bookmarks) {
  const layout = new Map();
  const occupied = new Set();

  for (const bookmark of bookmarks) {
    if (!isFolderCell(bookmark.gx, bookmark.gy)) continue;
    const key = cellKey(bookmark.gx, bookmark.gy);
    if (occupied.has(key)) continue;
    occupied.add(key);
    layout.set(bookmark.id, { gx: bookmark.gx, gy: bookmark.gy });
  }

  for (const bookmark of bookmarks) {
    if (layout.has(bookmark.id)) continue;
    const position = findFirstFreeFolderCell(occupied);
    if (!position) {
      const overflowIndex = layout.size - FOLDER_GRID_CAPACITY;
      layout.set(bookmark.id, {
        gx: overflowIndex % FOLDER_GRID_COLUMNS,
        gy: FOLDER_GRID_ROWS + Math.floor(overflowIndex / FOLDER_GRID_COLUMNS)
      });
      continue;
    }
    occupied.add(cellKey(position.gx, position.gy));
    layout.set(bookmark.id, position);
  }

  return layout;
}

/** @returns {{gx: number, gy: number}|null} */
export function findFirstFreeFolderCell(occupied) {
  for (let gy = 0; gy < FOLDER_GRID_ROWS; gy += 1) {
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
    && gy < FOLDER_GRID_ROWS;
}

/** @returns {string} */
export function cellKey(gx, gy) {
  return `${gx}:${gy}`;
}
