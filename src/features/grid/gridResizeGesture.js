import { gridGesture } from './gridGestureState.js';
import { getState } from '../../state/appStore.js';
import { getGridItemsInGroup } from './gridSelectors.js';
import { updateGridItemsByIds } from './gridItemActions.js';
import { GRID_COLS, GRID_ROWS } from '../../shared/grid/gridGeometry.js';
import { isAreaFree } from '../../shared/grid/gridPlacement.js';
import { BOOKMARK_RESIZE_MODES, normalizeBookmarkResizeMode } from '../../domain/settings/gridInteractionModes.js';
import { calculateResizeGeometry, getResizeClickDelta } from '../../shared/grid/resizeGeometry.js';
import { pickGridRectangle, formatGridSize, applyContinuousResize, applyGridGeometry } from './gridPointerGeometry.js';

/**
 * Handles resize interaction for a bookmark or folder.
 *
 * Dynamically recalculates grid position and dimensions while ensuring:
 * - Minimum size constraints.
 * - Grid boundary limits.
 * - Collision-free placement.
 *
 * Persists changes on pointer release.
 *
 * @param {HTMLElement} container - Grid container element.
 * @param {PointerEvent} e - Initial pointer event.
 * @param {HTMLElement} div - Grid item DOM element.
 * @param {Bookmark|BookmarkFolder} item - Grid item data object.
 * @param {string} direction - Side or corner being dragged.
 * @param {HTMLElement} handle - Active resize handle.
 * @param {HTMLElement} indicator - Grid size feedback element.
 * @returns {void}
 */
export function handleResize(container, e, div, item, direction, handle, indicator) {
  if (e.button !== 0 || gridGesture.resizing) return;

  gridGesture.resizing = true;
  div.classList.add('is-resizing');
  handle.classList.add('is-active');

  const startMouseX = e.clientX;
  const startMouseY = e.clientY;
  const viewport = container.closest('#bookmark-viewport');
  const startScrollX = viewport?.scrollLeft ?? 0;
  const startScrollY = viewport?.scrollTop ?? 0;
  const pointerId = e.pointerId;
  const start = pickGridRectangle(item);
  const rowWidth = container.clientWidth / GRID_COLS;
  const rowHeight = container.clientHeight / GRID_ROWS;
  const { data } = getState();
  const resizeMode = normalizeBookmarkResizeMode(data.settings.bookmarkResizeMode);
  // Grid contents do not change until this resize is committed. Capturing them
  // once avoids cloning the complete application state for every pointer move.
  const gridItems = getGridItemsInGroup(data, item.groupId);
  let latestIsValid = true;
  let latestGeometry = calculateResizeGeometry({
    direction,
    deltaX: 0,
    deltaY: 0,
    start,
    cellWidth: rowWidth,
    cellHeight: rowHeight,
    columns: GRID_COLS,
    rows: GRID_ROWS
  });
  let animationFrame = null;
  let active = true;
  let moved = false;

  indicator.textContent = formatGridSize(start);
  handle.setPointerCapture(pointerId);

  const onMove = (ev) => {
    if (!active || ev.pointerId !== pointerId) return;

    const deltaX = ev.clientX - startMouseX + (viewport?.scrollLeft ?? 0) - startScrollX;
    const deltaY = ev.clientY - startMouseY + (viewport?.scrollTop ?? 0) - startScrollY;
    if (Math.hypot(deltaX, deltaY) > 4) moved = true;

    latestGeometry = calculateResizeGeometry({
      direction,
      deltaX,
      deltaY,
      start,
      cellWidth: rowWidth,
      cellHeight: rowHeight,
      columns: GRID_COLS,
      rows: GRID_ROWS
    });

    const { grid } = latestGeometry;
    const isValid = isAreaFree(
      gridItems,
      grid.gx,
      grid.gy,
      grid.w,
      grid.h,
      item.id
    );

    latestIsValid = isValid;
    div.classList.toggle('is-invalid', !isValid);
    indicator.textContent = formatGridSize(grid);
    queueResizeFrame();
  };

  const queueResizeFrame = () => {
    if (animationFrame != null) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        if (resizeMode === BOOKMARK_RESIZE_MODES.SMOOTH) {
          applyContinuousResize(div, latestGeometry.pixel);
        } else {
          applyGridGeometry(container, div, latestGeometry.grid);
        }
    });
  };

  const finish = (commit) => {
    if (!active) return;
    active = false;
    gridGesture.resizing = false;
    gridGesture.cancel = null;
    if (animationFrame != null) cancelAnimationFrame(animationFrame);

    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onCancel);
    handle.removeEventListener('lostpointercapture', onLostPointerCapture);
    if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);

    handle.classList.remove('is-active');
    div.classList.remove('is-resizing', 'is-invalid');

    let target = start;
    if (commit && moved && latestIsValid) target = latestGeometry.grid;
    if (commit && !moved) {
      const clickDelta = getResizeClickDelta(
        direction,
        rowWidth,
        rowHeight,
        e.shiftKey
      );
      const clickTarget = calculateResizeGeometry({
        direction,
        ...clickDelta,
        start,
        cellWidth: rowWidth,
        cellHeight: rowHeight,
        columns: GRID_COLS,
        rows: GRID_ROWS
      }).grid;
      const clickIsValid = isAreaFree(
        gridItems,
        clickTarget.gx,
        clickTarget.gy,
        clickTarget.w,
        clickTarget.h,
        item.id
      );
      if (clickIsValid) target = clickTarget;
    }
    applyGridGeometry(container, div, target);

    if (
      commit && (
        target.gx !== item.gx ||
        target.gy !== item.gy ||
        target.w !== item.w ||
        target.h !== item.h
      )
    ) {
      updateGridItemsByIds(new Map([[item.id, {
        gx: target.gx,
        gy: target.gy,
        w: target.w,
        h: target.h
      }]]));
    }
  };

  gridGesture.cancel = () => finish(false);

  const onUp = ev => {
    if (ev.pointerId === pointerId) finish(true);
  };
  const onCancel = ev => {
    if (ev.pointerId === pointerId) finish(false);
  };
  const onLostPointerCapture = ev => {
    if (ev.pointerId === pointerId) finish(false);
  };

  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onCancel);
  handle.addEventListener('lostpointercapture', onLostPointerCapture);
}
