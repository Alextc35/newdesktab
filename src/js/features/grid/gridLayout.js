import { GRID_COLS, GRID_ROWS } from '../../shared/grid/gridGeometry.js';
import { isListView } from '../../shared/ui/viewportMode.js';

/**
 * Updates CSS variables representing grid cell size.
 *
 * Sets:
 * - --cell-w : width of a single grid column in pixels
 * - --cell-h : height of a single grid row in pixels
 *
 * This should be called whenever the container is resized.
 *
 * @param {HTMLElement} container - Grid container element
 */
export function updateGridSize(container) {
  if (!container) return;

  const viewport = container.closest('#bookmark-viewport');
  const compact = isListView();
  container.classList.toggle('is-list-view', compact);
  document.documentElement.classList.toggle('is-list-view', compact);
  const width = viewport.clientWidth;
  container.style.width = `${width}px`;
  viewport.style.setProperty('--grid-width', `${width}px`);
  const height = viewport.clientHeight;
  container.style.height = compact ? 'auto' : `${height}px`;
  viewport.style.setProperty('--grid-height', compact ? '0px' : `${height}px`);

  const cellW = width / GRID_COLS;
  const cellH = height / GRID_ROWS;

  document.documentElement.style.setProperty('--cell-w', cellW + 'px');
  document.documentElement.style.setProperty('--cell-h', cellH + 'px');
}

/**
 * Returns the pixel width of a single grid column.
 *
 * @returns {number}
 */
export function getRowWidth(container) {
  if (!container) return 0;
  return container.clientWidth / GRID_COLS;
}

/**
 * Returns the pixel height of a single grid row.
 *
 * @returns {number}
 */
export function getRowHeight(container) {
  if (!container) return 0;
  return container.clientHeight / GRID_ROWS;
}

/**
 * Returns the maximum number of visible grid rows.
 *
 * @returns {number}
 */
export function getMaxVisibleRows() {
  return GRID_ROWS;
}

/**
 * Returns the maximum number of visible grid columns.
 *
 * @returns {number}
 */
export function getMaxVisibleCols() {
  return GRID_COLS;
}
