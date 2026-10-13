import { GRID_COLS, GRID_ROWS, PADDING } from '../../shared/grid/gridGeometry.js';

export function pickGridRectangle(item) {
  return {
    gx: item.gx,
    gy: item.gy,
    w: item.w,
    h: item.h
  };
}

export function formatGridSize({ w, h }) {
  return `${w} × ${h}`;
}

export function applyContinuousResize(element, { left, top, width, height }) {
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.width = `${width - PADDING}px`;
  element.style.height = `${height - PADDING}px`;
}

export function applyGridGeometry(container, element, geometry) {
  const rowWidth = container.clientWidth / GRID_COLS;
  const rowHeight = container.clientHeight / GRID_ROWS;

  applyPosition(container, element, geometry.gx, geometry.gy);
  element.style.width = `${geometry.w * rowWidth - PADDING}px`;
  element.style.height = `${geometry.h * rowHeight - PADDING}px`;
}

export function findFolderTarget(clientX, clientY, folderTargets) {
  return findRectangleTarget(clientX, clientY, folderTargets);
}

export function findRectangleTarget(clientX, clientY, targets, { includeHandles = true } = {}) {
  return targets
    .find(({ rect, handleRects = [] }) => containsPoint(rect, clientX, clientY)
      || (includeHandles && handleRects.some(bounds => containsPoint(bounds, clientX, clientY))))?.element ?? null;
}

function containsPoint(bounds, x, y) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

/** A 2px margin around a grid junction retains the previous destination. */
export function isAmbiguousGridCorner(x, y, cellWidth, cellHeight) {
  return Math.abs(x - Math.round(x / cellWidth) * cellWidth) < 2
    && Math.abs(y - Math.round(y / cellHeight) * cellHeight) < 2;
}

/** A snapped cell can reach a drop-only item before the cursor reaches its card. */
export function overlapsGridDropTarget(rectangle, targets) {
  return targets.some(({ gridRect }) => gridRect
    && rectangle.gx < gridRect.gx + gridRect.w
    && rectangle.gx + rectangle.w > gridRect.gx
    && rectangle.gy < gridRect.gy + gridRect.h
    && rectangle.gy + rectangle.h > gridRect.gy);
}

/** Moves the dragged card into a compact, stacked pose over its drop target. */
export function applyDropLandingGeometry(container, element, targetRect) {
  const containerRect = container.getBoundingClientRect();
  const sourceWidth = element.offsetWidth;
  const sourceHeight = element.offsetHeight;
  const sourceCenterX = containerRect.left + element.offsetLeft + sourceWidth / 2;
  const sourceCenterY = containerRect.top + element.offsetTop + sourceHeight / 2;
  const horizontalRest = Math.min(14, targetRect.width * .08);
  const verticalLift = Math.min(18, targetRect.height * .12);
  const targetCenterX = targetRect.left + targetRect.width / 2 + horizontalRest;
  const targetCenterY = targetRect.top + targetRect.height / 2 - verticalLift;
  const scale = Math.max(.28, Math.min(
    .66,
    targetRect.width / sourceWidth * .72,
    targetRect.height / sourceHeight * .72
  ));

  element.style.setProperty('--drop-landing-x', `${targetCenterX - sourceCenterX}px`);
  element.style.setProperty('--drop-landing-y', `${targetCenterY - sourceCenterY}px`);
  element.style.setProperty('--drop-landing-scale', scale.toFixed(3));
}

export function clearDropLandingGeometry(element) {
  element.style.removeProperty('--drop-landing-x');
  element.style.removeProperty('--drop-landing-y');
  element.style.removeProperty('--drop-landing-scale');
}

/**
 * Applies grid-based positioning to a bookmark element.
 *
 * Converts grid coordinates (gx, gy) into pixel-based positioning
 * relative to the container dimensions.
 *
 * @param {HTMLElement} container - Grid container element.
 * @param {HTMLElement} div - Bookmark DOM element.
 * @param {number} gx - Grid column position.
 * @param {number} gy - Grid row position.
 * @returns {void}
 */
export function applyPosition(container, div, gx, gy, gridMetrics = null) {
  const rowWidth = gridMetrics?.rowWidth ?? container.clientWidth / GRID_COLS;
  const rowHeight = gridMetrics?.rowHeight ?? container.clientHeight / GRID_ROWS;

  div.style.left = gx * rowWidth + 'px';
  div.style.top = gy * rowHeight + 'px';
}
