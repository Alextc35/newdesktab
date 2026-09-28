import { updateGridItemsByIds } from './gridItemActions.js';
import { getGridItemsInGroup } from './gridSelectors.js';
import {
  GRID_COLS,
  GRID_ROWS
} from '../../shared/grid/gridGeometry.js';
import { getState } from '../../state/appStore.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceSelectors.js';
import { hasOpenModal } from '../../shared/ui/modalManager.js';
import { calculateKeyboardMoveLayout } from '../../shared/grid/smartDragLayout.js';
import { gridItemRegistry } from '../../shared/grid/gridItemRegistry.js';
import { isGridKeyboardNavigationActive } from './gridKeyboardController.js';
import { getSelectedGridItems } from './gridSelection.js';

const ARROW_STEPS = Object.freeze({
  ArrowLeft: { gx: -1, gy: 0 },
  ArrowRight: { gx: 1, gy: 0 },
  ArrowUp: { gx: 0, gy: -1 },
  ArrowDown: { gx: 0, gy: 1 }
});

/**
 * Enables one-cell keyboard movement for any single selected grid item.
 *
 * Plain arrow keys are deliberately reserved for the selected grid item. Form
 * controls, modal dialogs and modified arrow shortcuts retain their native
 * behavior.
 */
export function initGridKeyboardMovement() {
  document.addEventListener('keydown', handleGridItemArrowKey);
}

function handleGridItemArrowKey(event) {
  const step = ARROW_STEPS[event.key];
  if (
    !step
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
    || event.defaultPrevented
    || hasOpenModal()
    || isGridKeyboardNavigationActive()
    || isEditingTextOrControl(document.activeElement)
  ) return;

  const selectedItems = getSelectedGridItems();
  if (selectedItems.length !== 1) return;

  const state = getState();
  if (!state.ui.isEditing) return;

  const selected = selectedItems[0];
  const selectedEntry = gridItemRegistry.entries(state, { view: 'grid' }).find(entry => (
    entry.item.id === selected.id
    && (entry.definition.selectionKind ?? entry.definition.type) === selected.kind
  ));
  const item = selectedEntry?.item;
  if (item?.folderId) return;
  if ((item?.groupId ?? null) !== getActiveWorkspaceId(state.data)) return;
  if (!item) return;

  event.preventDefault();

  const items = getGridItemsInGroup(state.data, item.groupId);
  const topLevelBookmarkIds = new Set(state.data.bookmarks
    .filter(candidate => (
      !candidate.folderId
      && (candidate.groupId ?? null) === (item.groupId ?? null)
    ))
    .map(candidate => candidate.id));
  const movableIds = ['folder', 'widget'].includes(selected.kind)
    ? items
      .filter(candidate => candidate.id !== state.data.recycleBin?.id)
      .map(candidate => candidate.id)
    : topLevelBookmarkIds;
  const layout = calculateKeyboardMoveLayout({
    items,
    draggedId: item.id,
    step,
    movableIds,
    mode: state.data.settings.bookmarkDragMode,
    columns: GRID_COLS,
    rows: GRID_ROWS
  });
  if (!layout.isValid) return;

  const currentById = new Map(items.map(candidate => [candidate.id, candidate]));
  const updates = new Map();
  for (const position of layout.positions) {
    const current = currentById.get(position.id);
    if (
      current
      && (position.gx !== current.gx || position.gy !== current.gy)
    ) updates.set(position.id, { gx: position.gx, gy: position.gy });
  }

  updateGridItemsByIds(updates);
}

function isEditingTextOrControl(element) {
  return Boolean(element?.closest?.(
    'input, textarea, select, [contenteditable="true"]'
  ));
}
