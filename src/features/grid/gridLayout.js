import { GRID_COLS, GRID_ROWS } from '../../shared/grid/gridGeometry.js';
import { isListView } from '../../shared/ui/viewportMode.js';
import { getSettings } from '../../state/appStore.js';
import {
  createDeviceGridScrollStore,
  resolveDeviceGridScroll
} from '../../platform/storage/deviceGridScroll.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceSelectors.js';
import {
  normalizeWindowResizeMode,
  WINDOW_RESIZE_MODES
} from '../../domain/settings/gridInteractionModes.js';

const GRID_REFERENCE_SIZE_KEY = 'newdesktab:responsive-grid-reference';
let cachedGridReferenceSize = null;
const viewportLayouts = new WeakMap();
const trackedViewports = new WeakSet();
const gridScrollPositions = createDeviceGridScrollStore();

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
  const settings = getSettings();
  const workspaceId = getActiveWorkspaceId({ settings });
  const windowResizeMode = normalizeWindowResizeMode(settings.windowResizeMode);
  const preserveGridSize = !compact && windowResizeMode === WINDOW_RESIZE_MODES.RELATIVE;
  const previousLayout = viewportLayouts.get(viewport);
  // The old surface is still mounted here. Flush its last pan before changing
  // workspace/mode, even when its scroll event has not run yet.
  rememberGridScroll(viewport, previousLayout, previousLayout?.preserveGridSize,
    previousLayout?.workspaceId);
  trackGridScroll(viewport);
  container.classList.toggle('is-list-view', compact);
  document.documentElement.classList.toggle('is-list-view', compact);
  viewport.classList.toggle('is-relative-grid', preserveGridSize);
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
    || previousLayout.resizing
    || previousLayout.workspaceId !== workspaceId
    || previousLayout.viewportWidth !== viewportWidth
    || previousLayout.viewportHeight !== viewportHeight
    || previousLayout.width !== width
    || previousLayout.height !== height
  )) {
    // Clamp the displayed position without replacing a saved pan with that clamp.
    // A workspace without a manual position keeps the original centered behavior.
    let saved = gridScrollPositions.read(workspaceId);
    const maxX = Math.max(0, width - viewport.clientWidth);
    const maxY = Math.max(0, height - viewport.clientHeight);
    if (saved && (saved.maxX === undefined || saved.maxY === undefined)) {
      // Older records contain XY only; keep that exact pan and learn its basis.
      saved = { ...saved, maxX: saved.maxX ?? maxX, maxY: saved.maxY ?? maxY };
      gridScrollPositions.save(workspaceId, saved);
    }
    const position = resolveDeviceGridScroll(saved, { maxX, maxY });
    viewport.scrollLeft = position.x;
    viewport.scrollTop = position.y;
  } else if (!preserveGridSize && previousLayout?.preserveGridSize) {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }
  viewportLayouts.set(viewport, {
    preserveGridSize, workspaceId, viewportWidth, viewportHeight, width, height,
    clientWidth: viewport.clientWidth, clientHeight: viewport.clientHeight,
    scrollX: viewport.scrollLeft, scrollY: viewport.scrollTop
  });
}

function trackGridScroll(viewport) {
  if (trackedViewports.has(viewport)) return;
  trackedViewports.add(viewport);
  window.addEventListener('resize', () => {
    const layout = viewportLayouts.get(viewport);
    if (layout) layout.resizing = true;
  });
  viewport.addEventListener('scroll', () => {
    const settings = getSettings();
    const preserveGridSize = !isListView()
      && normalizeWindowResizeMode(settings.windowResizeMode) === WINDOW_RESIZE_MODES.RELATIVE;
    rememberGridScroll(viewport, viewportLayouts.get(viewport), preserveGridSize,
      getActiveWorkspaceId({ settings }));
  }, { passive: true });
}

function rememberGridScroll(viewport, layout, preserveGridSize, workspaceId) {
  if (!preserveGridSize || !layout?.preserveGridSize || layout.resizing || layout.workspaceId !== workspaceId
    || layout.viewportWidth !== viewport.offsetWidth || layout.viewportHeight !== viewport.offsetHeight
    || layout.clientWidth !== viewport.clientWidth || layout.clientHeight !== viewport.clientHeight) return;
  const x = viewport.scrollLeft;
  const y = viewport.scrollTop;
  if (x === layout.scrollX && y === layout.scrollY) return;
  const maxX = Math.max(0, layout.width - layout.clientWidth);
  const maxY = Math.max(0, layout.height - layout.clientHeight);
  const position = gridScrollPositions.read(workspaceId) ?? {
    x: layout.scrollX, y: layout.scrollY, maxX, maxY
  };
  // A vertical move must not overwrite an X anchor that is currently clamped.
  if (x !== layout.scrollX) {
    position.x = x;
    position.maxX = maxX;
  }
  if (y !== layout.scrollY) {
    position.y = y;
    position.maxY = maxY;
  }
  gridScrollPositions.save(workspaceId, position);
  layout.scrollX = x;
  layout.scrollY = y;
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
