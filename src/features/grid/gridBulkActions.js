import {
  applyDefaultStylesToGridItems,
  duplicateGridItems,
  moveGridItemsToWorkspace,
  permanentlyDeleteGridItem
} from './gridItemActions.js';
import { moveGridItemsToRecycleBin } from '../recycle-bin/recycleBinActions.js';
import {
  getActiveWorkspaceId,
  getWorkspaces
} from '../workspaces/workspaceSelectors.js';
import { getState, subscribe } from '../../state/appStore.js';
import { gridItemRegistry } from '../../shared/grid/gridItemRegistry.js';
import { t } from '../../platform/i18n/i18n.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { flashSuccess } from '../../shared/ui/flash.js';
import { runPersistedAction } from '../persistence/persistedAction.js';
import { makeToolbarDraggable } from '../../shared/ui/draggableToolbar.js';
import { getMaxVisibleCols, getMaxVisibleRows } from './gridLayout.js';
import {
  clearGridItemSelection,
  getSelectedGridItems,
  pruneGridItemSelection,
  subscribeToGridItemSelection
} from './gridSelection.js';

export function initGridBulkActions() {
  const toolbar = document.getElementById('bulk-actions');
  const count = document.getElementById('bulk-selection-count');
  const groupSelect = document.getElementById('bulk-workspace-select');
  const applyPresetButton = document.getElementById('bulk-apply-preset');
  const duplicateButton = document.getElementById('bulk-duplicate');
  const { resetPosition } = makeToolbarDraggable(
    toolbar,
    document.getElementById('bookmark-viewport')
  );
  let currentState = null;
  let selectionIsVisible = false;

  document.getElementById('bulk-clear').addEventListener('click', clearGridItemSelection);
  applyPresetButton.addEventListener('click', async () => {
    const items = getSelectedGridItems();
    if (!items.length) return;
    await runPersistedAction('bulk-style', () =>
      applyDefaultStylesToGridItems(items, currentState.data.settings.bookmarkDefault), () => {
      clearGridItemSelection();
      flashSuccess('flash.bookmarks.presetApplied');
    });
  });
  duplicateButton.addEventListener('click', async () => {
    const items = getSelectedGridItems();
    if (!items.length) return;

    await runPersistedAction('bulk-duplicate', () => duplicateGridItems(items, {
      columns: getMaxVisibleCols(),
      rows: getMaxVisibleRows(),
      nameSuffix: t('bookmarkActions.copySuffix')
    }), result => {
      clearGridItemSelection();
      if (result.duplicates.length) flashSuccess('flash.bookmarks.duplicatedSelected');
      if (result.skipped) void showAlert(t('alert.bookmarks.duplicateNoSpace', { count: result.skipped }), {
        type: 'info'
      });
    });
  });
  document.getElementById('bulk-delete').addEventListener('click', async () => {
    const items = getSelectedGridItems();
    if (!items.length) return;
    const confirmed = await showAlert(
      getDeleteConfirmation(items, currentState),
      { type: 'confirm', requiresWideViewport: true }
    );
    if (!confirmed) return;
    await runPersistedAction('bulk-delete', async () => {
      const ids = getSelectionIds(items);
      moveGridItemsToRecycleBin(ids);
      await permanentlyDeleteSelectedWidgets(ids.widgetIds);
    }, () => {
      clearGridItemSelection();
      flashSuccess('flash.bookmarks.deletedSelected');
    });
  });
  groupSelect.addEventListener('change', async () => {
    const destinationId = groupSelect.value;
    const sourceId = getActiveWorkspaceId(currentState.data) ?? '';
    const destinationName = groupSelect.selectedOptions[0]?.textContent;
    groupSelect.value = sourceId;
    const items = getSelectedGridItems();
    if (!items.length || destinationId === sourceId || !destinationName) return;
    const confirmed = await showAlert(t(
      items.length === 1
        ? 'alert.bookmarks.confirmMoveOne'
        : 'alert.bookmarks.confirmMoveSelected',
      { count: items.length, workspace: destinationName }
    ), { type: 'confirm', requiresWideViewport: true });
    if (!confirmed) return;

    await runPersistedAction('bulk-move', () => moveGridItemsToWorkspace(items, destinationId || null, {
      columns: getMaxVisibleCols(),
      rows: getMaxVisibleRows()
    }), result => {
      clearGridItemSelection();
      if (result.moved) flashSuccess('flash.bookmarks.moved');
      if (result.skipped) void showAlert(t('alert.bookmarks.moveNoSpace', { count: result.skipped }), {
        type: 'info'
      });
    });
  });

  subscribe(state => {
    currentState = state;
    pruneGridItemSelection({
      bookmarkIds: state.data.bookmarks.map(bookmark => bookmark.id),
      folderIds: state.data.folders.map(folder => folder.id),
      widgetIds: state.data.widgets.map(widget => widget.id)
    });
    groupSelect.replaceChildren(new Option(t('workspace.main'), ''));
    for (const workspace of getWorkspaces(state.data)) {
      groupSelect.add(new Option(workspace.name, workspace.id));
    }
    groupSelect.value = getActiveWorkspaceId(state.data) ?? '';
  });

  subscribeToGridItemSelection(items => {
    const hasSelection = items.length > 0;
    if (hasSelection !== selectionIsVisible) resetPosition();
    selectionIsVisible = hasSelection;

    const selected = new Set(items.map(item => `${item.kind}:${item.id}`));
    document.querySelectorAll('.bookmark[data-bookmark-id]').forEach(element => {
      const isSelected = selected.has(`bookmark:${element.dataset.bookmarkId}`);
      element.classList.toggle('is-selected', isSelected);
    });
    document.querySelectorAll('.bookmark-folder[data-folder-id]').forEach(element => {
      const isSelected = selected.has(`folder:${element.dataset.folderId}`);
      element.classList.toggle('is-selected', isSelected);
    });
    document.querySelectorAll('[data-widget-id]').forEach(element => {
      const isSelected = selected.has(`widget:${element.dataset.widgetId}`);
      element.classList.toggle('is-selected', isSelected);
    });
    const includesWidget = items.some(item => item.kind === 'widget');
    applyPresetButton.disabled = includesWidget;
    duplicateButton.disabled = includesWidget;
    toolbar.classList.toggle('is-hidden', !hasSelection);
    count.textContent = t('bulk.selected', { count: items.length });
  });
}

function getDeleteConfirmation(items, state) {
  const { data } = state;
  if (items.length === 1) {
    const selected = items[0];
    const bookmark = selected.kind === 'bookmark'
      ? data.bookmarks.find(item => item.id === selected.id)
      : null;
    if (bookmark) {
      return t('alert.bookmark.confirmDelete', { name: bookmark.name });
    }
    const folder = selected.kind === 'folder'
      ? data.folders.find(item => item.id === selected.id)
      : null;
    if (folder) {
      const count = data.bookmarks.filter(bookmark => bookmark.folderId === folder.id).length;
      return t('folder.confirmDelete', { name: folder.name, count });
    }
    const widget = selected.kind === 'widget'
      ? data.widgets.find(item => item.id === selected.id)
      : null;
    if (widget) {
      return gridItemRegistry.get(widget.type)?.getRemovalConfirmation?.({
        item: widget,
        state,
        permanent: true
      }) ?? t('alert.widget.confirmPermanentDelete');
    }
  }

  const widgetCount = items.filter(item => item.kind === 'widget').length;
  if (widgetCount) {
    return t('alert.widget.confirmDeleteSelected', {
      count: items.length,
      widgetCount
    });
  }
  return t('alert.bookmarks.confirmDeleteSelected', { count: items.length });
}

function getSelectionIds(items) {
  return {
    bookmarkIds: items.filter(item => item.kind === 'bookmark').map(item => item.id),
    folderIds: items.filter(item => item.kind === 'folder').map(item => item.id),
    widgetIds: items.filter(item => item.kind === 'widget').map(item => item.id)
  };
}

async function permanentlyDeleteSelectedWidgets(widgetIds) {
  for (const widgetId of widgetIds) {
    const state = getState();
    const widget = state.data.widgets.find(item => item.id === widgetId);
    if (!widget) continue;
    const definition = gridItemRegistry.get(widget.type);
    const context = { item: widget, state, permanent: true };
    if (definition?.remove) await definition.remove(context);
    else permanentlyDeleteGridItem('widget', widget.id);
  }
}
