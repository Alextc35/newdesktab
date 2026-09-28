import '../../types/types.js'; // typedefs

/**
 * Checks whether a rectangular grid area is free of overlapping grid items.
 *
 * @param {Array<Bookmark|BookmarkFolder>} items
 * @param {number} gx
 * @param {number} gy
 * @param {number} [w=1]
 * @param {number} [h=1]
 * @param {string|null} [ignoreId=null]
 * @returns {boolean}
 */
export function isAreaFree(items, gx, gy, w = 1, h = 1, ignoreId = null) {
  for (const item of items) {
    if (ignoreId != null && item.id === ignoreId) continue;
    if (item.gx == null || item.gy == null) continue;

    if (rectanglesOverlap(gx, gy, w, h, item.gx, item.gy, item.w, item.h)) return false;
  }

  return true;
}

/**
 * Finds the first free grid position, scanning columns from left to right and
 * rows from top to bottom to preserve NewDeskTab's current placement behavior.
 *
 * @param {Array<Bookmark|BookmarkFolder>} items
 * @param {Object} bounds
 * @param {number} bounds.columns
 * @param {number} bounds.rows
 * @param {number} [bounds.w=1]
 * @param {number} [bounds.h=1]
 * @param {string|null} [bounds.ignoreId=null]
 * @returns {{gx: number, gy: number}|null}
 */
export function findFirstFreeSlot(items, {
  columns,
  rows,
  w = 1,
  h = 1,
  ignoreId = null
}) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
    return null;
  }

  for (let gx = 0; gx <= columns - w; gx += 1) {
    for (let gy = 0; gy <= rows - h; gy += 1) {
      if (isAreaFree(items, gx, gy, w, h, ignoreId)) return { gx, gy };
    }
  }

  return null;
}

/**
 * Checks whether two grid rectangles overlap.
 *
 * @param {number} ax
 * @param {number} ay
 * @param {number} aw
 * @param {number} ah
 * @param {number} bx
 * @param {number} by
 * @param {number} bw
 * @param {number} bh
 * @returns {boolean}
 */
function rectanglesOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  const separated =
    ax + aw <= bx ||
    bx + bw <= ax ||
    ay + ah <= by ||
    by + bh <= ay;

  return !separated;
}
