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

export function findRectangleTarget(clientX, clientY, targets) {
  return targets
    .find(({ rect }) => {
      return clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top
        && clientY <= rect.bottom;
    })?.element ?? null;
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
