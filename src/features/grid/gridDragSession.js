import { getState } from '../../state/appStore.js';
import { gridItemRegistry } from '../../shared/grid/gridItemRegistry.js';
import { GRID_COLS, GRID_ROWS } from '../../shared/grid/gridGeometry.js';
import { calculateSmartDragLayout } from '../../shared/grid/smartDragLayout.js';
import { getGridItemsInGroup } from './gridSelectors.js';
import { updateGridItemsByIds } from './gridItemActions.js';
import { applyPosition } from './gridPointerGeometry.js';
import { SMART_MOVE_DURATION } from './gridGestureState.js';

const smartDragOwners = new WeakMap();

export function createSmartDragSession(container, item, kind) {
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

export function applySmartDragPreview(container, session, layout) {
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

export function restoreSmartDragPreview(container, session) {
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

export function commitSmartDragLayout(session) {
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

export function sameGridPosition(a, b) {
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

export function suppressFolderOpen(element) {
  element.dataset.suppressFolderOpen = 'true';
  setTimeout(() => delete element.dataset.suppressFolderOpen, 0);
}

export function scheduleSmartPreviewCleanup(session, removeInlinePositions) {
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

/** Plans one grid-cell transition independently of pointer event handling. */
export function planSmartDragSession(session, target) {
  updateCascadeDirection(session, target);
  session.lastPreviewTarget = target;
  return calculateSmartDragLayout({
    items: session.items, draggedId: session.draggedId, target,
    movableIds: session.movableIds, mode: session.mode,
    cascadeStep: session.cascadeStep, previewPositions: session.activeLayout.positions,
    columns: GRID_COLS, rows: GRID_ROWS
  });
}
