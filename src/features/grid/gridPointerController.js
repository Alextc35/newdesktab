import '../../types/types.js'; // typedefs
import {
  addBookmarkToFolder
} from '../folders/folderActions.js';
import { permanentlyDeleteGridItem } from './gridItemActions.js';
import { GRID_COLS, GRID_ROWS } from '../../shared/grid/gridGeometry.js';
import { FOLDER_GRID_CAPACITY } from '../../domain/folders/folderGrid.js';
import { gridItemRegistry } from '../../shared/grid/gridItemRegistry.js';
import { getState } from '../../state/appStore.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { runPersistedAction } from '../persistence/persistedAction.js';
import { toggleGridItemSelection } from './gridSelection.js';
import { RESIZE_DIRECTIONS } from '../../shared/grid/resizeGeometry.js';
import { gridGesture, SMART_MOVE_DURATION } from './gridGestureState.js';
import { handleResize } from './gridResizeGesture.js';
import { createSmartDragSession, applySmartDragPreview, applyInvalidSmartDragPreview, restoreSmartDragPreview, commitSmartDragLayout,
  sameGridPosition, suppressFolderOpen, scheduleSmartPreviewCleanup, planSmartDragSession } from './gridDragSession.js';
import { findFolderTarget, findRectangleTarget, overlapsGridDropTarget, isAmbiguousGridCorner, applyDropLandingGeometry, clearDropLandingGeometry } from './gridPointerGeometry.js';
import {
  moveBookmarksToRecycleBin,
  moveFolderToRecycleBin
} from '../recycle-bin/recycleBinActions.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { t } from '../../platform/i18n/i18n.js';
import { confirmItemRecycle } from './gridItemRemoval.js';

const SELECTION_CLICK_MAX_DURATION = 300;
const DRAG_HOLD_DELAY = 180;

export function cancelGridGesture() {
  gridGesture.cancel?.();
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
  let grabbedColumn = 0, grabbedRow = 0;

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

    if (gridGesture.resizing || gridGesture.dragging) return;

    if (e.target.closest('.item-actions, .resizer')) return;

    if (e.button !== 0) return;

    e.preventDefault();
    gridGesture.dragging = true;
    itemDragging = true;

    startX = e.clientX;
    startY = e.clientY;
    const style = getComputedStyle(div);
    startLeft = parseFloat(style.left);
    startTop = parseFloat(style.top);
    rowWidth = container.clientWidth / GRID_COLS;
    rowHeight = container.clientHeight / GRID_ROWS;
    startScrollX = viewport?.scrollLeft ?? 0;
    startScrollY = viewport?.scrollTop ?? 0;
    pressStartedAt = e.timeStamp;

    moved = false;
    dragSession = createSmartDragSession(container, item, kind);
    grabbedColumn = Math.max(0, Math.min(item.w - 1, Math.floor((e.clientX - dragSession.gridOrigin.left - startLeft) / rowWidth)));
    grabbedRow = Math.max(0, Math.min(item.h - 1, Math.floor((e.clientY - dragSession.gridOrigin.top - startTop) / rowHeight)));
    gridGesture.cancel = () => finishDrag(false);

    div.setPointerCapture(e.pointerId);
    dragHoldTimer = setTimeout(startDragFeedback, DRAG_HOLD_DELAY);
  });

  div.addEventListener('auxclick', event => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey && ['bookmark', 'folder'].includes(kind)) void confirmItemRecycle(kind, item.id);
    else openGridItemEditor(div);
  });

  div.addEventListener('pointermove', (e) => {
    if (!itemDragging || gridGesture.resizing || !dragSession) return;

    const scrollX = (viewport?.scrollLeft ?? 0) - startScrollX;
    const scrollY = (viewport?.scrollTop ?? 0) - startScrollY;
    const dx = e.clientX - startX + scrollX;
    const dy = e.clientY - startY + scrollY;
    if (!moved) {
      if (Math.hypot(dx, dy) <= 4) return;
      startDragFeedback();
    }

    // The pointer chooses the cell, including its padding/gaps. Preserve the
    // grabbed cell of a larger item without the half-cell blind zone of rounding.
    let newGX = Math.floor((e.clientX + scrollX - dragSession.gridOrigin.left) / rowWidth) - grabbedColumn;
    let newGY = Math.floor((e.clientY + scrollY - dragSession.gridOrigin.top) / rowHeight) - grabbedRow;

    newGX = Math.max(0, Math.min(newGX, GRID_COLS - item.w));
    newGY = Math.max(0, Math.min(newGY, GRID_ROWS - item.h));

    if (isAmbiguousGridCorner(e.clientX + scrollX - dragSession.gridOrigin.left,
      e.clientY + scrollY - dragSession.gridOrigin.top, rowWidth, rowHeight)
      && !findRectangleTarget(e.clientX + scrollX, e.clientY + scrollY,
        [...dragSession.recycleBinTargets, ...dragSession.folderTargets], { includeHandles: false })) {
      // The exact junction belongs to no clear destination. Retain the current
      // layout and landing feedback until the cursor makes a small clear choice.
      return;
    }

    const wasOverDropTarget = Boolean(recycleBinTarget || folderTarget);
    const nextRecycleBinTarget = kind !== 'recycle-bin'
      ? findRectangleTarget(e.clientX + scrollX, e.clientY + scrollY, dragSession.recycleBinTargets)
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
    if (overlapsGridDropTarget({ ...target, w: item.w, h: item.h }, dragSession.recycleBinTargets)
      || overlapsGridDropTarget({ ...target, w: item.w, h: item.h }, dragSession.folderTargets)) {
      // Keep the last legal layout until the cursor actually enters the drop
      // target. Never paint a rejected card on top of a bin or folder by snapping.
      if (wasOverDropTarget || !dragSession.dropIsValid || !sameGridPosition(target, dragSession.lastPreviewTarget)) {
        applySmartDragPreview(container, dragSession, dragSession.activeLayout);
      }
      dragSession.lastPreviewTarget = target;
      dragSession.dropIsValid = true;
      div.classList.remove('is-invalid');
      return;
    }
    // Pointer events can fire dozens of times while the pointer remains inside
    // one grid cell. The smart-layout calculation is the expensive part of a
    // drag. Leaving a folder/trash target also needs validation, even when the
    // snapped cell is unchanged, because landing feedback cleared the warning.
    if (!wasOverDropTarget && sameGridPosition(target, dragSession.lastPreviewTarget)) return;

    const layout = planSmartDragSession(dragSession, target);
    if (layout.isValid) {
      dragSession.activeLayout = layout;
      dragSession.dropIsValid = true;
      applySmartDragPreview(container, dragSession, layout);
      div.classList.remove('is-invalid');
    } else {
      dragSession.dropIsValid = false;
      applyInvalidSmartDragPreview(container, dragSession, target);
      div.classList.add('is-invalid');
    }
  });

  const finishDrag = (commit = true, event = null) => {
    if (!itemDragging || gridGesture.resizing || !dragSession) return;

    clearTimeout(dragHoldTimer);
    dragHoldTimer = null;
    itemDragging = false;
    gridGesture.dragging = false;
    gridGesture.cancel = null;
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
        void runPersistedAction(`drop-trash:${item.id}`, () => moveBookmarksToRecycleBin([item.id]), count => {
          if (count > 0) flashSuccess('flash.recycleBin.moved');
          else restoreCancelledGridDrop(div);
        });
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
      void runPersistedAction(`drop-folder:${item.id}`, () => addBookmarkToFolder(item.id, targetId), added => {
        if (added) flashSuccess('flash.folder.bookmarkAdded');
        else {
          restoreCancelledGridDrop(div);
          if (targetIsFull) flashError('flash.folder.folderFull');
        }
      });
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
    const cachedRect = targetEntry?.rect;
    const scrollX = (viewport?.scrollLeft ?? 0) - startScrollX;
    const scrollY = (viewport?.scrollTop ?? 0) - startScrollY;
    const targetRect = cachedRect ? {
      left: cachedRect.left - scrollX, top: cachedRect.top - scrollY,
      width: cachedRect.width, height: cachedRect.height
    } : target.getBoundingClientRect();
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
  let deleted = false;
  await runPersistedAction(`drop-trash:${folder.id}`, () => moveFolderToRecycleBin(folder.id), result => {
    deleted = result.deleted;
    if (deleted) flashSuccess('flash.recycleBin.moved');
  });
  return deleted;
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

  let removed = false;
  await runPersistedAction(`drop-delete:${widget.id}`, async () => definition?.remove
    ? await definition.remove(context)
    : permanentlyDeleteGridItem('widget', widget.id).deleted, deleted => {
    if (!deleted) return false;
    const successMessage = definition?.getRemovalSuccessMessage?.(context)
      ?? 'flash.recycleBin.deletedPermanently';
    flashSuccess(successMessage);
    removed = true;
  });
  return removed;
}
