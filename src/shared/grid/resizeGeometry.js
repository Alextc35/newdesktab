/** Resize directions supported by generic grid items. */
export const RESIZE_DIRECTIONS = [
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left',
  'top-left'
];

/**
 * Returns the one-cell movement used by a resize-handle click. Holding Shift
 * reverses the edge movement so the rectangle shrinks instead of growing.
 *
 * @param {string} direction
 * @param {number} cellWidth
 * @param {number} cellHeight
 * @param {boolean} [shrink=false]
 * @returns {{deltaX:number, deltaY:number}}
 */
export function getResizeClickDelta(
  direction,
  cellWidth,
  cellHeight,
  shrink = false
) {
  const multiplier = shrink ? -1 : 1;
  return {
    deltaX: direction.includes('left')
      ? -cellWidth * multiplier
      : direction.includes('right') ? cellWidth * multiplier : 0,
    deltaY: direction.includes('top')
      ? -cellHeight * multiplier
      : direction.includes('bottom') ? cellHeight * multiplier : 0
  };
}

/**
 * Calculates continuous pixel edges and their nearest valid grid rectangle.
 * Moving edges are clamped to the grid and can never cross the opposite edge.
 *
 * @param {Object} options
 * @param {string} options.direction
 * @param {number} options.deltaX
 * @param {number} options.deltaY
 * @param {{gx:number, gy:number, w:number, h:number}} options.start
 * @param {number} options.cellWidth
 * @param {number} options.cellHeight
 * @param {number} options.columns
 * @param {number} options.rows
 * @returns {{
 *   pixel: {left:number, top:number, width:number, height:number},
 *   grid: {gx:number, gy:number, w:number, h:number}
 * }}
 */
export function calculateResizeGeometry({
  direction,
  deltaX,
  deltaY,
  start,
  cellWidth,
  cellHeight,
  columns,
  rows
}) {
  const movesLeft = direction.includes('left');
  const movesRight = direction.includes('right');
  const movesTop = direction.includes('top');
  const movesBottom = direction.includes('bottom');

  const startLeft = start.gx * cellWidth;
  const startTop = start.gy * cellHeight;
  const startRight = (start.gx + start.w) * cellWidth;
  const startBottom = (start.gy + start.h) * cellHeight;

  let left = startLeft;
  let top = startTop;
  let right = startRight;
  let bottom = startBottom;

  if (movesLeft) left = clamp(startLeft + deltaX, 0, startRight - cellWidth);
  if (movesRight) right = clamp(startRight + deltaX, startLeft + cellWidth, columns * cellWidth);
  if (movesTop) top = clamp(startTop + deltaY, 0, startBottom - cellHeight);
  if (movesBottom) {
    bottom = clamp(startBottom + deltaY, startTop + cellHeight, rows * cellHeight);
  }

  const grid = { ...start };

  if (movesLeft) {
    const fixedRight = start.gx + start.w;
    grid.gx = clamp(Math.round(left / cellWidth), 0, fixedRight - 1);
    grid.w = fixedRight - grid.gx;
  } else if (movesRight) {
    const rightColumn = clamp(
      Math.round(right / cellWidth),
      start.gx + 1,
      columns
    );
    grid.w = rightColumn - start.gx;
  }

  if (movesTop) {
    const fixedBottom = start.gy + start.h;
    grid.gy = clamp(Math.round(top / cellHeight), 0, fixedBottom - 1);
    grid.h = fixedBottom - grid.gy;
  } else if (movesBottom) {
    const bottomRow = clamp(
      Math.round(bottom / cellHeight),
      start.gy + 1,
      rows
    );
    grid.h = bottomRow - start.gy;
  }

  return {
    pixel: {
      left,
      top,
      width: right - left,
      height: bottom - top
    },
    grid
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(value, maximum));
}
