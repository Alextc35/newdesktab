import '../../types/types.js'; // typedefs
import {
  addBookmarkToFolder
} from '../folders/folderActions.js';
import { permanentlyDeleteGridItem, updateGridItemsByIds } from './gridItemActions.js';
import { getGridItemsInGroup } from './gridSelectors.js';
import { GRID_COLS, GRID_ROWS, PADDING } from '../../shared/grid/gridGeometry.js';
import { FOLDER_GRID_CAPACITY } from '../../domain/folders/folderGrid.js';
import { isAreaFree } from '../../shared/grid/gridPlacement.js';
import { gridItemRegistry } from '../../shared/grid/gridItemRegistry.js';
import { getState } from '../../state/appStore.js';
import {
  BOOKMARK_RESIZE_MODES,
  normalizeBookmarkResizeMode
} from '../../domain/settings/gridInteractionModes.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { toggleGridItemSelection } from './gridSelection.js';
import {
  calculateResizeGeometry,
  getResizeClickDelta,
  RESIZE_DIRECTIONS
} from '../../shared/grid/resizeGeometry.js';
import { calculateSmartDragLayout } from '../../shared/grid/smartDragLayout.js';
import {
  moveBookmarksToRecycleBin,
  moveFolderToRecycleBin
} from '../recycle-bin/recycleBinActions.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { t } from '../../platform/i18n/i18n.js';

let dragging = false;
let resizing = false;
let cancelGesture = null;
const SMART_MOVE_DURATION = 180;
const SELECTION_CLICK_MAX_DURATION = 300;
const DRAG_HOLD_DELAY = 180;
const smartDragOwners = new WeakMap();

export function cancelGridGesture() {
  cancelGesture?.();
}

/**
 * Enables drag and resize behavior for a persisted grid item.
 *
 * Handles:
 * - Reversible smart dragging with automatic bookmark displacement.
 * - Continuous or one-click resizing from all four sides and corners.
 * - Optional short-click selection for bookmarks, folders and widgets.
 * - State persistence via store updates.
 *
 * @param {HTMLElement} container - Grid container element.
 * @param {HTMLElement} div - Grid item DOM element.
 * @param {GridItem} item - Grid item data object.
 * @param {Object} [options]
 * @param {'bookmark'|'folder'|'recycle-bin'|'widget'} [options.kind='bookmark']
 * @param {boolean} [options.selectable] Defaults to true except for the recycle bin.
 * @returns {void}
 */
export function addGridItemPointerControls(container, div, item, {
  kind = 'bookmark',
  selectable = kind !== 'recycle-bin'
} = {}) {
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;

  let folderTarget = null;
  let recycleBinTarget = null;
  let dragSession = null;
  let itemDragging = false;
  let moved = false;
  let pressStartedAt = 0;
  let dragHoldTimer = null;

  let rowWidth = 0, rowHeight = 0;
  const viewport = container.closest('#bookmark-viewport');
  let startScrollX = 0, startScrollY = 0;

  div.addEventListener('pointerdown', e => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (resizing || dragging) return;

    if (e.target.closest('.item-actions, .resizer')) return;

    if (e.button !== 0) return;

    e.preventDefault();
    dragging = true;
    itemDragging = true;

    startX = e.clientX;
    startY = e.clientY;
    startLeft = div.offsetLeft;
    startTop = div.offsetTop;
    rowWidth = container.clientWidth / GRID_COLS;
    rowHeight = container.clientHeight / GRID_ROWS;
    startScrollX = viewport?.scrollLeft ?? 0;
    startScrollY = viewport?.scrollTop ?? 0;
    pressStartedAt = e.timeStamp;

    moved = false;
    dragSession = createSmartDragSession(container, item, kind);
    cancelGesture = () => finishDrag(false);

    div.setPointerCapture(e.pointerId);
    dragHoldTimer = setTimeout(startDragFeedback, DRAG_HOLD_DELAY);
  });

  div.addEventListener('auxclick', event => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    openGridItemEditor(div);
  });

  div.addEventListener('pointermove', (e) => {
    if (!itemDragging || resizing || !dragSession) return;

    const scrollX = (viewport?.scrollLeft ?? 0) - startScrollX;
    const scrollY = (viewport?.scrollTop ?? 0) - startScrollY;
    const dx = e.clientX - startX + scrollX;
    const dy = e.clientY - startY + scrollY;
    if (!moved) {
      if (Math.hypot(dx, dy) <= 4) return;
      startDragFeedback();
    }

    let newLeft = startLeft + dx;
    let newTop = startTop + dy;

    let newGX = Math.round(newLeft / rowWidth);
    let newGY = Math.round(newTop / rowHeight);

    newGX = Math.max(0, Math.min(newGX, GRID_COLS - item.w));
    newGY = Math.max(0, Math.min(newGY, GRID_ROWS - item.h));

    const nextRecycleBinTarget = kind !== 'recycle-bin'
      ? findRectangleTarget(e.clientX, e.clientY, dragSession.recycleBinTargets)
      : null;
    if (nextRecycleBinTarget) {
      setFolderTarget(null);
      setRecycleBinTarget(nextRecycleBinTarget);
      div.classList.remove('is-invalid');
      return;
    }
    setRecycleBinTarget(null);

    const nextFolderTarget = kind === 'bookmark'
      ? findFolderTarget(e.clientX + scrollX, e.clientY + scrollY, dragSession.folderTargets)
      : null;
    if (nextFolderTarget) {
      setFolderTarget(nextFolderTarget);
      div.classList.remove('is-invalid');
      return;
    }
    setFolderTarget(null);

    const target = { gx: newGX, gy: newGY };
    // Pointer events can fire dozens of times while the pointer remains inside
    // one grid cell. The smart-layout calculation is the expensive part of a
    // drag, so there is no visual or logical work to do until that cell changes.
    if (sameGridPosition(target, dragSession.lastPreviewTarget)) return;

    updateCascadeDirection(dragSession, target);
    dragSession.lastPreviewTarget = target;

    const layout = calculateSmartDragLayout({
      items: dragSession.items,
      draggedId: item.id,
      target,
      movableIds: dragSession.movableIds,
      mode: dragSession.mode,
      cascadeStep: dragSession.cascadeStep,
      previewPositions: dragSession.activeLayout.positions,
      columns: GRID_COLS,
      rows: GRID_ROWS
    });
    if (layout.isValid) {
      dragSession.activeLayout = layout;
      dragSession.dropIsValid = true;
      applySmartDragPreview(container, dragSession, layout);
      div.classList.remove('is-invalid');
    } else {
      dragSession.dropIsValid = false;
      div.classList.add('is-invalid');
    }
  });

  const finishDrag = (commit = true, event = null) => {
    if (!itemDragging || resizing || !dragSession) return;

    clearTimeout(dragHoldTimer);
    dragHoldTimer = null;
    itemDragging = false;
    dragging = false;
    cancelGesture = null;
    if (commit && (recycleBinTarget || folderTarget)) {
      // Hide the card before removing its landing transform. Otherwise the
      // browser can paint one frame back at its original cell before render.
      div.classList.add('is-drop-committed');
    }
    div.classList.remove('is-dragging', 'is-invalid');
    div.style.zIndex = '';
    if (kind === 'folder' && moved) suppressFolderOpen(div);

    const isSelectionClick = commit
      && kind !== 'recycle-bin'
      && selectable
      && !moved
      && event
      && event.timeStamp - pressStartedAt <= SELECTION_CLICK_MAX_DURATION;
    if (isSelectionClick) {
      setFolderTarget(null);
      setRecycleBinTarget(null);
      restoreSmartDragPreview(container, dragSession);
      dragSession = null;
      const selected = toggleGridItemSelection(kind, item.id);
      div.classList.toggle('is-selected', selected);
      return;
    }

    if (!commit) {
      setFolderTarget(null);
      setRecycleBinTarget(null);
      restoreSmartDragPreview(container, dragSession);
      dragSession = null;
      return;
    }

    if (recycleBinTarget) {
      setFolderTarget(null);
      setRecycleBinTarget(null);
      restoreSmartDragPreview(container, dragSession);
      dragSession = null;
      if (kind === 'bookmark') {
        if (moveBookmarksToRecycleBin([item.id]) > 0) {
          flashSuccess('flash.recycleBin.moved');
        } else {
          restoreCancelledGridDrop(div);
        }
      } else if (kind === 'folder') {
        void confirmFolderRecycle(item).then(deleted => {
          if (!deleted) restoreCancelledGridDrop(div);
        });
      } else if (kind === 'widget') {
        void confirmWidgetPermanentRemoval(item).then(deleted => {
          if (!deleted) restoreCancelledGridDrop(div);
        });
      }
      return;
    }

    if (folderTarget) {
      const targetId = folderTarget.dataset.folderId;
      const targetIsFull = getState().data.bookmarks.filter(
        bookmark => bookmark.folderId === targetId
      ).length >= FOLDER_GRID_CAPACITY;
      setFolderTarget(null);
      restoreSmartDragPreview(container, dragSession);
      dragSession = null;
      if (addBookmarkToFolder(item.id, targetId)) {
        flashSuccess('flash.folder.bookmarkAdded');
      } else {
        restoreCancelledGridDrop(div);
        if (targetIsFull) flashError('flash.folder.folderFull');
      }
      return;
    }

    if (!dragSession.dropIsValid) {
      restoreSmartDragPreview(container, dragSession);
      dragSession = null;
      return;
    }

    const changed = commitSmartDragLayout(dragSession);
    if (changed) {
      scheduleSmartPreviewCleanup(dragSession, false);
    } else {
      restoreSmartDragPreview(container, dragSession);
    }
    dragSession = null;
  };

  div.addEventListener('pointerup', event => finishDrag(true, event));
  div.addEventListener('pointercancel', event => finishDrag(false, event));
  div.addEventListener('lostpointercapture', event => finishDrag(false, event));

  function setFolderTarget(nextTarget) {
    if (folderTarget === nextTarget) return;
    folderTarget?.classList.remove('is-drop-target');
    folderTarget = nextTarget;
    folderTarget?.classList.add('is-drop-target');
    div.classList.toggle('is-over-folder', Boolean(folderTarget));
    syncDropLandingPreview();
  }

  function setRecycleBinTarget(nextTarget) {
    if (recycleBinTarget === nextTarget) return;
    recycleBinTarget?.classList.remove('is-drop-target');
    recycleBinTarget = nextTarget;
    recycleBinTarget?.classList.add('is-drop-target');
    div.classList.toggle('is-over-recycle-bin', Boolean(recycleBinTarget));
    syncDropLandingPreview();
  }

  function syncDropLandingPreview() {
    const target = recycleBinTarget ?? folderTarget;
    div.classList.toggle('is-drop-landing', Boolean(target));
    if (!target || !dragSession) {
      clearDropLandingGeometry(div);
      return;
    }

    const targetEntry = [
      ...dragSession.folderTargets,
      ...dragSession.recycleBinTargets
    ].find(entry => entry.element === target);
    const targetRect = targetEntry?.rect ?? target.getBoundingClientRect();
    applyDropLandingGeometry(container, div, targetRect);
  }

  function startDragFeedback() {
    if (!itemDragging || moved) return;
    moved = true;
    div.classList.add('is-dragging');
  }

  const resizeIndicator = document.createElement('span');
  resizeIndicator.className = 'resize-indicator';
  resizeIndicator.setAttribute('aria-hidden', 'true');
  div.appendChild(resizeIndicator);

  RESIZE_DIRECTIONS.forEach(direction => {
    const resizer = document.createElement('div');
    resizer.className = `resizer ${direction}`;
    resizer.setAttribute('aria-hidden', 'true');
    div.appendChild(resizer);

    resizer.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      handleResize(container, e, div, item, direction, resizer, resizeIndicator);
    });
  });
}

function openGridItemEditor(element) {
  const state = getState();
  const entry = gridItemRegistry.resolveElement(element, state);
  entry?.definition.edit?.({
    ...entry,
    item: entry.item,
    state,
    element
  });
}

function createSmartDragSession(container, item, kind) {
  const state = getState();
  const { data } = state;
  const groupId = item.groupId ?? null;
  const items = getGridItemsInGroup(data, groupId);
  const bookmarkIds = new Set(data.bookmarks
    .filter(bookmark => !bookmark.folderId)
    .map(bookmark => bookmark.id));
  const movableIds = items
    .filter(gridItem => {
      if (kind === 'recycle-bin') return true;
      if (gridItem.id === data.recycleBin?.id) return false;
      return kind === 'folder' || kind === 'widget' || bookmarkIds.has(gridItem.id);
    })
    .map(gridItem => gridItem.id);
  const movable = new Set(movableIds);
  const originals = new Map(items
    .filter(item => movable.has(item.id))
    .map(item => [item.id, pickGridPosition(item)]));
  const selector = gridItemRegistry.selectors().join(', ');
  const elements = new Map((selector
    ? Array.from(container.querySelectorAll(selector))
    : [])
    .map(element => [gridItemRegistry.resolveElement(element, state)?.item.id, element])
    .filter(([id]) => id));
  const inheritedTouchedIds = new Set(Array.from(elements)
    .filter(([, element]) => element.classList.contains('is-smart-moving'))
    .map(([id]) => id));
  const owner = {};
  for (const element of elements.values()) smartDragOwners.set(element, owner);
  const currentItem = items.find(gridItem => gridItem.id === item.id) ?? item;
  const gridMetrics = {
    rowWidth: container.clientWidth / GRID_COLS,
    rowHeight: container.clientHeight / GRID_ROWS
  };
  const folderTargets = kind === 'bookmark'
    ? Array.from(elements.values())
      .filter(element => element.matches('.bookmark-folder[data-folder-id]'))
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
    : [];
  const recycleBinTargets = ['bookmark', 'folder', 'widget'].includes(kind)
    ? Array.from(elements.values())
      .filter(element => element.matches('.recycle-bin[data-recycle-bin-id]'))
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
    : [];

  return {
    owner,
    draggedId: item.id,
    mode: data.settings.bookmarkDragMode,
    items,
    movableIds,
    originals,
    elements,
    touchedIds: inheritedTouchedIds,
    lastTarget: pickGridPosition(currentItem),
    lastPreviewTarget: pickGridPosition(currentItem),
    previewPositions: new Map(originals),
    gridMetrics,
    folderTargets,
    recycleBinTargets,
    cascadeStep: null,
    dropIsValid: true,
    activeLayout: {
      isValid: true,
      positions: [{
        id: item.id,
        gx: currentItem.gx,
        gy: currentItem.gy
      }],
      displacedIds: []
    }
  };
}

function applySmartDragPreview(container, session, layout) {
  const positions = new Map(layout.positions.map(position => [position.id, position]));
  const displaced = new Set(layout.displacedIds);

  for (const [id, original] of session.originals) {
    const element = session.elements.get(id);
    if (!element) continue;

    if (id === session.draggedId) {
      const position = positions.get(id) ?? original;
      applyPreviewPosition(container, session, id, element, position);
      continue;
    }

    if (!positions.has(id) && !session.touchedIds.has(id)) continue;

    prepareSmartMovement(element);
    const position = positions.get(id) ?? original;
    applyPreviewPosition(container, session, id, element, position);
    element.classList.toggle('is-smart-displaced', displaced.has(id));
    session.touchedIds.add(id);
  }
}

function restoreSmartDragPreview(container, session) {
  if (!session) return;

  for (const [id, original] of session.originals) {
    if (id !== session.draggedId && !session.touchedIds.has(id)) continue;
    const element = session.elements.get(id);
    if (!element) continue;

    if (id !== session.draggedId) prepareSmartMovement(element);
    applyPreviewPosition(container, session, id, element, original);
    element.classList.remove('is-smart-displaced');
  }

  scheduleSmartPreviewCleanup(session, true);
}

function prepareSmartMovement(element) {
  if (element.classList.contains('is-smart-moving')) return;
  element.classList.add('is-smart-moving');
  element.getBoundingClientRect();
}

function commitSmartDragLayout(session) {
  if (!session) return false;

  const changed = new Map();
  for (const position of session.activeLayout.positions) {
    const original = session.originals.get(position.id);
    if (
      original
      && (position.gx !== original.gx || position.gy !== original.gy)
    ) {
      changed.set(position.id, { gx: position.gx, gy: position.gy });
    }
  }

  if (!changed.size) return false;
  updateGridItemsByIds(changed);
  return true;
}

function updateCascadeDirection(session, target) {
  const dx = target.gx - session.lastTarget.gx;
  const dy = target.gy - session.lastTarget.gy;
  if (dx === 0 && dy === 0) return;

  if (Math.abs(dx) >= Math.abs(dy)) {
    session.cascadeStep = { gx: -Math.sign(dx), gy: 0 };
  } else {
    session.cascadeStep = { gx: 0, gy: -Math.sign(dy) };
  }
  session.lastTarget = target;
}

function sameGridPosition(a, b) {
  return a.gx === b.gx && a.gy === b.gy;
}

function applyPreviewPosition(container, session, id, element, position) {
  const previous = session.previewPositions.get(id);
  if (previous && sameGridPosition(previous, position)) return;

  applyPosition(
    container,
    element,
    position.gx,
    position.gy,
    session.gridMetrics
  );
  session.previewPositions.set(id, { gx: position.gx, gy: position.gy });
}

function suppressFolderOpen(element) {
  element.dataset.suppressFolderOpen = 'true';
  setTimeout(() => delete element.dataset.suppressFolderOpen, 0);
}

function scheduleSmartPreviewCleanup(session, removeInlinePositions) {
  const elements = [
    session.elements.get(session.draggedId),
    ...Array.from(session.touchedIds, id => session.elements.get(id))
  ].filter(Boolean);

  setTimeout(() => {
    for (const element of elements) {
      if (smartDragOwners.get(element) !== session.owner) continue;
      element.classList.remove('is-smart-moving', 'is-smart-displaced');
      if (removeInlinePositions) {
        element.style.removeProperty('left');
        element.style.removeProperty('top');
      }
      smartDragOwners.delete(element);
    }
  }, SMART_MOVE_DURATION);
}

function pickGridPosition(item) {
  return { gx: item.gx, gy: item.gy };
}

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
function handleResize(container, e, div, item, direction, handle, indicator) {
  if (e.button !== 0 || resizing) return;

  resizing = true;
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
    resizing = false;
    cancelGesture = null;
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

  cancelGesture = () => finish(false);

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

function pickGridRectangle(item) {
  return {
    gx: item.gx,
    gy: item.gy,
    w: item.w,
    h: item.h
  };
}

function formatGridSize({ w, h }) {
  return `${w} × ${h}`;
}

function applyContinuousResize(element, { left, top, width, height }) {
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.width = `${width - PADDING}px`;
  element.style.height = `${height - PADDING}px`;
}

function applyGridGeometry(container, element, geometry) {
  const rowWidth = container.clientWidth / GRID_COLS;
  const rowHeight = container.clientHeight / GRID_ROWS;

  applyPosition(container, element, geometry.gx, geometry.gy);
  element.style.width = `${geometry.w * rowWidth - PADDING}px`;
  element.style.height = `${geometry.h * rowHeight - PADDING}px`;
}

function findFolderTarget(clientX, clientY, folderTargets) {
  return findRectangleTarget(clientX, clientY, folderTargets);
}

function findRectangleTarget(clientX, clientY, targets) {
  return targets
    .find(({ rect }) => {
      return clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top
        && clientY <= rect.bottom;
    })?.element ?? null;
}

/** Moves the dragged card into a compact, stacked pose over its drop target. */
function applyDropLandingGeometry(container, element, targetRect) {
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

function clearDropLandingGeometry(element) {
  element.style.removeProperty('--drop-landing-x');
  element.style.removeProperty('--drop-landing-y');
  element.style.removeProperty('--drop-landing-scale');
}

function restoreCancelledGridDrop(element) {
  if (!element.isConnected) return;
  element.classList.add('is-drop-restoring');
  element.classList.remove('is-drop-committed');
  void element.offsetWidth;
  element.classList.add('is-drop-revealed');
  setTimeout(() => {
    element.classList.remove('is-drop-restoring', 'is-drop-revealed');
  }, SMART_MOVE_DURATION);
}

async function confirmFolderRecycle(folder) {
  const bookmarkCount = getState().data.bookmarks.filter(
    bookmark => bookmark.folderId === folder.id
  ).length;
  const confirmed = await showAlert(t('alert.recycleBin.folder', {
    name: folder.name,
    count: bookmarkCount
  }), { type: 'confirm' });
  if (!confirmed) return false;
  const { deleted } = moveFolderToRecycleBin(folder.id);
  if (!deleted) return false;
  flashSuccess('flash.recycleBin.moved');
  return true;
}

async function confirmWidgetPermanentRemoval(widget) {
  const state = getState();
  const definition = gridItemRegistry.get(widget.type);
  const context = { item: widget, state, permanent: true };
  const confirmation = definition?.getRemovalConfirmation?.(context)
    ?? t('alert.widget.confirmPermanentDelete');
  const confirmed = await showAlert(confirmation, {
    type: 'confirm',
    requiresWideViewport: true
  });
  if (!confirmed) return false;

  const deleted = definition?.remove
    ? await definition.remove(context)
    : permanentlyDeleteGridItem('widget', widget.id).deleted;
  if (!deleted) return false;
  const successMessage = definition?.getRemovalSuccessMessage?.(context)
    ?? 'flash.recycleBin.deletedPermanently';
  flashSuccess(successMessage);
  return true;
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
function applyPosition(container, div, gx, gy, gridMetrics = null) {
  const rowWidth = gridMetrics?.rowWidth ?? container.clientWidth / GRID_COLS;
  const rowHeight = gridMetrics?.rowHeight ?? container.clientHeight / GRID_ROWS;

  div.style.left = gx * rowWidth + 'px';
  div.style.top = gy * rowHeight + 'px';
}
