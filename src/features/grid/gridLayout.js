import { GRID_COLS, GRID_ROWS } from '../../shared/grid/gridGeometry.js';
import { isListView } from '../../shared/ui/viewportMode.js';
import { getState } from '../../state/appStore.js';
import {
  normalizeWindowResizeMode,
  WINDOW_RESIZE_MODES
} from '../../domain/settings/gridInteractionModes.js';

const GRID_REFERENCE_SIZE_KEY = 'newdesktab:responsive-grid-reference';
let cachedGridReferenceSize = null;
const viewportLayouts = new WeakMap();

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
  const windowResizeMode = normalizeWindowResizeMode(getState().data.settings.windowResizeMode);
  const preserveGridSize = !compact && windowResizeMode === WINDOW_RESIZE_MODES.RELATIVE;
  viewport.classList.toggle('is-relative-grid', preserveGridSize);
  const previousLayout = viewportLayouts.get(viewport);
  // Scrollbars must not change the device's reference size as the window resizes.
  const viewportWidth = viewport.offsetWidth;
  const viewportHeight = viewport.offsetHeight;
  let width = viewport.clientWidth;
  let height = viewport.clientHeight;
  if (!compact) {
    const referenceSize = updateGridReferenceSize(viewportWidth, viewportHeight);
    if (preserveGridSize) {
      width = Math.max(width, referenceSize.width);
      height = Math.max(height, referenceSize.height);
    }
  }
  container.style.width = `${width}px`;
  viewport.style.setProperty('--grid-width', `${width}px`);
  container.style.height = compact ? 'auto' : `${height}px`;
  viewport.style.setProperty('--grid-height', compact ? '0px' : `${height}px`);

  const cellW = width / GRID_COLS;
  const cellH = height / GRID_ROWS;

  document.documentElement.style.setProperty('--cell-w', cellW + 'px');
  document.documentElement.style.setProperty('--cell-h', cellH + 'px');

  if (preserveGridSize && (
    !previousLayout?.preserveGridSize
    || previousLayout.viewportWidth !== viewportWidth
    || previousLayout.viewportHeight !== viewportHeight
    || previousLayout.width !== width
    || previousLayout.height !== height
  )) {
    // Read the final client size, including any scrollbars introduced above.
    // Ordinary renders leave manual scrolling alone.
    viewport.scrollLeft = Math.max(0, (width - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (height - viewport.clientHeight) / 2);
  } else if (!preserveGridSize && previousLayout?.preserveGridSize) {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }
  viewportLayouts.set(viewport, {
    preserveGridSize, viewportWidth, viewportHeight, width, height
  });
}

function updateGridReferenceSize(width, height) {
  const previous = readGridReferenceSize() ?? { width, height };
  return saveGridReferenceSize(Math.max(width, previous.width), Math.max(height, previous.height));
}

function saveGridReferenceSize(width, height) {
  cachedGridReferenceSize = { width, height };
  try {
    window.localStorage.setItem(GRID_REFERENCE_SIZE_KEY, JSON.stringify(cachedGridReferenceSize));
  } catch {
    // The in-memory value still preserves the current session if local storage is unavailable.
  }
  return cachedGridReferenceSize;
}

function readGridReferenceSize() {
  if (cachedGridReferenceSize) return cachedGridReferenceSize;
  try {
    const value = JSON.parse(window.localStorage.getItem(GRID_REFERENCE_SIZE_KEY) ?? 'null');
    if (Number.isFinite(value?.width) && value.width > 0
      && Number.isFinite(value?.height) && value.height > 0) {
      cachedGridReferenceSize = value;
    }
  } catch {
    // Ignore malformed or unavailable device-local reference sizes.
  }
  return cachedGridReferenceSize;
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
