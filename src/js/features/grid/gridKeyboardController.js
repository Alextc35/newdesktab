import { getState, toggleEditing } from '../../core/store.js';
import {
  findGridKeyboardRoute,
  getGridItemNavigationAnchor
} from '../../shared/grid/gridKeyboardRoute.js';
import { gridItemRegistry } from '../../shared/grid/gridItemRegistry.js';
import { t } from '../../platform/i18n/i18n.js';
import { flashInfo, flashSuccess } from '../../shared/ui/flash.js';
import { hasOpenModal } from '../../shared/ui/modalManager.js';
import { isListView } from '../../shared/ui/viewportMode.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import {
  clearGridItemSelection,
  getSelectedGridItems,
  toggleGridItemSelection
} from './gridSelection.js';
import { permanentlyDeleteGridItem } from './gridItemActions.js';

const ARROW_DIRECTIONS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown'
]);
const DELETE_KEYS = new Set(['Backspace', 'Delete']);

const OPPOSITE_DIRECTIONS = {
  ArrowLeft: 'ArrowRight',
  ArrowRight: 'ArrowLeft',
  ArrowUp: 'ArrowDown',
  ArrowDown: 'ArrowUp'
};
const MAX_NAVIGATION_HISTORY = 100;
const GRID_NAVIGATION_INTERVAL_MS = 120;
const GRID_REJECTION_DURATION_MS = 420;

let containerRef = null;
let activeItemId = null;
let navigationPoint = null;
let navigationHistory = [];
let cursorRefreshFrame = null;
let pendingDirection = null;
let navigationDelayTimer = null;
let lastNavigationAt = Number.NEGATIVE_INFINITY;
let rejectionTimer = null;

/**
 * Adds keyboard navigation for the visible top-level grid items.
 *
 * Tab toggles the mode, arrow keys move to the closest item in a direction,
 * and Enter opens the focused item. In edit mode, S toggles the bulk
 * selection of bookmarks, folders and widgets. Backspace/Delete sends
 * recoverable items to the recycle bin and permanently removes widgets after
 * confirmation because widget trash entries are not supported yet.
 *
 * @param {HTMLElement|null} container
 */
export function initGridKeyboardNavigation(container) {
  if (!container || containerRef) return;

  containerRef = container;
  containerRef.tabIndex = -1;
  document.addEventListener('keydown', handleGridKeyboardNavigation, { capture: true });
  window.addEventListener('resize', scheduleKeyboardCursorRefresh);
}

/**
 * Whether an item should display the keyboard-focus affordance.
 *
 * @param {string} itemId
 * @returns {boolean}
 */
export function isGridKeyboardActive(itemId) {
  return activeItemId === itemId;
}

/**
 * Whether Tab-based grid navigation currently owns the arrow keys.
 *
 * @returns {boolean}
 */
export function isGridKeyboardNavigationActive() {
  return activeItemId !== null;
}

function handleGridKeyboardNavigation(event) {
  if (
    event.defaultPrevented
    || hasOpenModal()
    || event.altKey
    || event.ctrlKey
    || event.metaKey
  ) return;

  const isGridFocused = document.activeElement === containerRef;
  if (event.key === 'Escape') {
    const hadSelectedItems = getSelectedGridItems().length > 0;
    if (hadSelectedItems) {
      event.preventDefault();
      event.stopPropagation();
      cancelPendingNavigation();
      clearGridItemSelection();
      return;
    }

    if (activeItemId !== null) {
      event.preventDefault();
      event.stopPropagation();
      clearGridKeyboardNavigation();
      flashInfo('flash.selectionMode.disabled');
      return;
    }

    if (!getState().ui.isEditing) return;

    event.preventDefault();
    event.stopPropagation();
    cancelPendingNavigation();
    void toggleEditing().then(isEditing => {
      if (!isEditing) flashInfo('flash.editMode.disabled', 1000);
    });
    return;
  }

  if (event.key === 'Tab') {
    if (activeItemId) {
      event.preventDefault();
      clearGridKeyboardNavigation();
      flashInfo('flash.selectionMode.disabled');
      return;
    }

    if (!isGridFocused && !canStartGridNavigation()) return;
    const items = getVisibleGridItems();
    if (!items.length) return;
    event.preventDefault();
    resetNavigationDelay();
    setActiveItem(items[0].id);
    navigationPoint = getGridItemNavigationAnchor(items[0]);
    navigationHistory = [];
    flashInfo('flash.selectionMode.enabled');
    return;
  }

  if (!isGridFocused || !activeItemId) return;

  const isDeletionKey = DELETE_KEYS.has(event.key) || DELETE_KEYS.has(event.code);
  if (event.shiftKey && !isDeletionKey) return;

  if (ARROW_DIRECTIONS.has(event.key)) {
    event.preventDefault();
    scheduleDirectionalNavigation(event.key);
    return;
  }

  const item = getVisibleGridItems().find(entry => entry.id === activeItemId);

  if (isDeletionKey && getState().ui.isEditing) {
    event.preventDefault();
    event.stopPropagation();
    cancelPendingNavigation();
    if (event.repeat || !item) return;
    if (
      item.selectionKind !== 'widget'
      && (!item.definition.remove || !item.definition.getRemovalConfirmation)
    ) {
      showGridKeyboardRejection();
      return;
    }
    void confirmFocusedGridItemDeletion(item, {
      permanent: event.shiftKey || item.selectionKind === 'widget'
    });
    return;
  }

  if (event.key === 'Enter') {
    cancelPendingNavigation();
    const { ui } = getState();
    if (!item) return;

    if (!ui.isEditing) {
      if (!item.definition.open) return;
      event.preventDefault();
      if (item.definition.clearKeyboardOnOpen) {
        clearGridKeyboardNavigation();
      }
      openGridItem(item);
      return;
    }

    if (!item.definition.edit || !canOpenFocusedItemEditor(item)) return;
    event.preventDefault();
    item.definition.edit(createItemActionContext(item));
    return;
  }

  if (
    event.key.toLowerCase() === 's'
    && !event.repeat
    && getState().ui.isEditing
    && item
  ) {
    event.preventDefault();
    event.stopPropagation();
    cancelPendingNavigation();
    if (!item.definition.selectable) {
      showGridKeyboardRejection();
      return;
    }
    toggleGridItemSelection(item.selectionKind, item.id);
  }
}

async function confirmFocusedGridItemDeletion(item, { permanent = false } = {}) {
  const itemsBeforeDeletion = getVisibleGridItems();
  const deletedItemIndex = itemsBeforeDeletion.findIndex(entry => entry.id === item.id);
  const context = {
    ...createItemActionContext(item),
    permanent
  };
  const confirmation = item.definition.getRemovalConfirmation?.(context)
    ?? t('alert.widget.confirmPermanentDelete');
  const confirmed = await showAlert(
    confirmation,
    { type: 'confirm', requiresWideViewport: true }
  );
  if (!confirmed) {
    if (activeItemId === item.id) setActiveItem(item.id);
    return;
  }

  const deleted = item.definition.remove
    ? await item.definition.remove(context)
    : permanentlyDeleteGridItem('widget', item.id).deleted;
  if (!deleted) return;
  keepGridKeyboardNavigationAfterDeletion(deletedItemIndex);
  const successMessage = item.definition.getRemovalSuccessMessage?.(context) ?? (permanent
    ? 'flash.recycleBin.deletedPermanently'
    : 'flash.recycleBin.moved');
  flashSuccess(successMessage);
}

function keepGridKeyboardNavigationAfterDeletion(deletedItemIndex) {
  const remainingItems = getVisibleGridItems();
  if (!remainingItems.length) {
    clearGridKeyboardNavigation();
    return;
  }

  const nextIndex = deletedItemIndex < 0
    ? 0
    : Math.min(deletedItemIndex, remainingItems.length - 1);
  const nextItem = remainingItems[nextIndex];
  navigationPoint = getGridItemNavigationAnchor(nextItem);
  navigationHistory = [];
  resetNavigationDelay();
  setActiveItem(nextItem.id);
}

function scheduleDirectionalNavigation(direction) {
  const remainingDelay = Math.max(
    0,
    GRID_NAVIGATION_INTERVAL_MS - (Date.now() - lastNavigationAt)
  );

  if (remainingDelay === 0 && navigationDelayTimer === null) {
    moveInDirection(direction);
    return;
  }

  pendingDirection = direction;
  if (navigationDelayTimer !== null) return;

  navigationDelayTimer = window.setTimeout(() => {
    navigationDelayTimer = null;
    const directionToApply = pendingDirection;
    pendingDirection = null;
    if (
      !directionToApply
      || !activeItemId
      || hasOpenModal()
      || document.activeElement !== containerRef
    ) return;
    moveInDirection(directionToApply);
  }, remainingDelay);
}

function moveInDirection(direction) {
  const current = getVisibleGridItems().find(item => item.id === activeItemId);
  const route = current ? findDirectionalRoute(current, direction) : null;
  if (!route) return;

  if (route.reversed) {
    navigationHistory.pop();
  } else {
    navigationHistory.push({
      from: activeItemId,
      to: route.item.id,
      direction,
      fromPoint: navigationPoint,
      toPoint: route.point
    });
    if (navigationHistory.length > MAX_NAVIGATION_HISTORY) {
      navigationHistory.shift();
    }
  }
  lastNavigationAt = Date.now();
  navigationPoint = route.point;
  setActiveItem(route.item.id);
}

function cancelPendingNavigation() {
  if (navigationDelayTimer !== null) {
    clearTimeout(navigationDelayTimer);
    navigationDelayTimer = null;
  }
  pendingDirection = null;
}

function resetNavigationDelay() {
  cancelPendingNavigation();
  lastNavigationAt = Number.NEGATIVE_INFINITY;
}

function canStartGridNavigation() {
  const activeElement = document.activeElement;
  return activeElement === document.body
    || activeElement === document.documentElement
    || activeElement === containerRef;
}

function getVisibleGridItems() {
  const state = getState();
  const listView = isListView();
  const entries = gridItemRegistry.entries(state, {
    view: listView ? 'list' : 'grid'
  });
  const visibleKeys = listView ? getVisibleElementKeys(state) : null;
  const items = entries
    .map(entry => ({
      ...entry.item,
      kind: entry.definition.type,
      selectionKind: entry.definition.selectionKind ?? entry.definition.type,
      definition: entry.definition,
      registryEntry: entry
    }))
    .filter(item => !visibleKeys || visibleKeys.has(gridItemKey(item.kind, item.id)));

  return listView
    ? items
    : items.sort((a, b) => a.gy - b.gy || a.gx - b.gx || a.id.localeCompare(b.id));
}

function getVisibleElementKeys(state) {
  const selector = gridItemRegistry.selectors().join(', ');
  if (!selector) return new Set();
  return new Set([...containerRef.querySelectorAll(selector)]
    .filter(element => !element.hidden)
    .map(element => gridItemRegistry.resolveElement(element, state))
    .filter(Boolean)
    .map(entry => gridItemKey(entry.definition.type, entry.item.id)));
}

function findDirectionalRoute(current, direction) {
  const items = getVisibleGridItems();
  if (isListView()) {
    const index = items.findIndex(item => item.id === current.id);
    if (direction === 'ArrowDown') {
      const item = items[index + 1] ?? null;
      return item ? { item, point: getGridItemNavigationAnchor(item) } : null;
    }
    if (direction === 'ArrowUp') {
      const item = items[index - 1] ?? null;
      return item ? { item, point: getGridItemNavigationAnchor(item) } : null;
    }
    return null;
  }

  const last = navigationHistory.at(-1);
  if (
    last
    && last.to === current.id
    && OPPOSITE_DIRECTIONS[last.direction] === direction
  ) {
    const previous = items.find(item => item.id === last.from);
    if (previous) {
      return {
        item: previous,
        point: last.fromPoint ?? getGridItemNavigationAnchor(previous),
        reversed: true
      };
    }
  }

  return findGridKeyboardRoute(
    items,
    current,
    direction,
    navigationPoint ?? getGridItemNavigationAnchor(current)
  );
}

function openGridItem(item) {
  item.definition.open?.(createItemActionContext(item));
}

function canOpenFocusedItemEditor(item) {
  const selectedItems = getSelectedGridItems();
  if (selectedItems.length > 1) return false;
  return selectedItems.length === 0 || (
    selectedItems[0].id === item.id && selectedItems[0].kind === item.selectionKind
  );
}

function setActiveItem(itemId) {
  clearGridKeyboardRejection();
  activeItemId = itemId;
  containerRef?.focus({ preventScroll: true });

  const state = getState();
  const selector = gridItemRegistry.selectors().join(', ');
  if (selector) {
    containerRef?.querySelectorAll(selector).forEach(element => {
      const entry = gridItemRegistry.resolveElement(element, state);
      element.classList.toggle('is-keyboard-active', entry?.item.id === itemId);
    });
  }
  const activeElement = getGridItemElement(itemId);
  syncKeyboardCursor(activeElement);
  activeElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function clearGridKeyboardNavigation() {
  clearGridKeyboardRejection();
  activeItemId = null;
  navigationPoint = null;
  navigationHistory = [];
  resetNavigationDelay();
  if (cursorRefreshFrame !== null) {
    cancelAnimationFrame(cursorRefreshFrame);
    cursorRefreshFrame = null;
  }
  containerRef?.querySelectorAll('.is-keyboard-active').forEach(element => {
    element.classList.remove('is-keyboard-active');
  });
  containerRef?.classList.remove(
    'has-grid-keyboard-cursor',
    'can-move-grid-keyboard-cursor'
  );
  for (const property of [
    '--grid-keyboard-cursor-x',
    '--grid-keyboard-cursor-y',
    '--grid-keyboard-cursor-width',
    '--grid-keyboard-cursor-height'
  ]) {
    containerRef?.style.removeProperty(property);
  }
  containerRef?.blur();
}

function showGridKeyboardRejection() {
  if (!containerRef) return;
  clearGridKeyboardRejection();
  void containerRef.offsetWidth;
  containerRef.classList.add('is-grid-keyboard-rejected');
  rejectionTimer = window.setTimeout(clearGridKeyboardRejection, GRID_REJECTION_DURATION_MS);
}

function clearGridKeyboardRejection() {
  if (rejectionTimer !== null) {
    clearTimeout(rejectionTimer);
    rejectionTimer = null;
  }
  containerRef?.classList.remove('is-grid-keyboard-rejected');
}

function syncKeyboardCursor(element) {
  if (!containerRef || !element || isListView()) {
    containerRef?.classList.remove(
      'has-grid-keyboard-cursor',
      'can-move-grid-keyboard-cursor'
    );
    return;
  }

  const isCursorVisible = containerRef.classList.contains('has-grid-keyboard-cursor');
  if (!isCursorVisible) {
    containerRef.classList.remove('can-move-grid-keyboard-cursor');
  }

  const containerRect = containerRef.getBoundingClientRect();
  const itemRect = element.getBoundingClientRect();
  containerRef.style.setProperty(
    '--grid-keyboard-cursor-x',
    `${itemRect.left - containerRect.left}px`
  );
  containerRef.style.setProperty(
    '--grid-keyboard-cursor-y',
    `${itemRect.top - containerRect.top}px`
  );
  containerRef.style.setProperty('--grid-keyboard-cursor-width', `${itemRect.width}px`);
  containerRef.style.setProperty('--grid-keyboard-cursor-height', `${itemRect.height}px`);
  containerRef.classList.add('has-grid-keyboard-cursor');

  if (!isCursorVisible) {
    // Commit the cursor at its final geometry before enabling movement transitions.
    // Otherwise it interpolates from the pseudo-element's 0 x 0 defaults.
    void containerRef.offsetWidth;
    containerRef.classList.add('can-move-grid-keyboard-cursor');
  }
}

function scheduleKeyboardCursorRefresh() {
  if (activeItemId === null) return;
  if (cursorRefreshFrame !== null) cancelAnimationFrame(cursorRefreshFrame);
  cursorRefreshFrame = requestAnimationFrame(() => {
    cursorRefreshFrame = null;
    syncKeyboardCursor(getGridItemElement(activeItemId));
  });
}

function getGridItemElement(itemId) {
  const item = getVisibleGridItems().find(entry => entry.id === itemId);
  if (!item) return null;
  return [...(containerRef?.querySelectorAll(item.definition.selector) ?? [])]
    .find(element => item.definition.getElementId(element) === item.id) ?? null;
}

function createItemActionContext(item) {
  return {
    ...item.registryEntry,
    item: item.registryEntry.item,
    state: getState(),
    element: getGridItemElement(item.id)
  };
}

function gridItemKey(kind, itemId) {
  return `${kind}:${itemId}`;
}
