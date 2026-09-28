import { getState } from '../../core/store.js';
import { t } from '../../platform/i18n/i18n.js';
import {
  clearGridKeyboardNavigation
} from './gridKeyboardController.js';
import { createListSearch } from '../search/listSearch.js';
import { applyGridItemPosition } from './gridItemLayout.js';
import { updateGridSize } from './gridLayout.js';
import { isListView } from '../../shared/ui/viewportMode.js';
import { gridItemRegistry } from '../../shared/grid/gridItemRegistry.js';
import {
  getActiveWorkspaceId,
  getWorkspaceById
} from '../workspaces/workspaceSelectors.js';

const listSearchStates = new WeakMap();

/** Renders registered item types for the active workspace. */
export function renderGrid(container) {
  if (!container) return;
  const state = getState();
  updateGridSize(container);

  if (isListView()) {
    renderList(container, state);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of gridItemRegistry.entries(state)) {
    fragment.append(entry.definition.render({
      ...entry,
      view: 'grid',
      container,
      state
    }));
  }
  container.replaceChildren(fragment);
}

/** Resizes cards without rebuilding their feature-owned content. */
export function resizeGridView(container) {
  if (!container) return;
  if (container.classList.contains('is-list-view') !== isListView()) {
    renderGrid(container);
    return;
  }

  updateGridSize(container);
  if (isListView()) return;

  const state = getState();
  for (const element of container.children) {
    const entry = gridItemRegistry.resolveElement(element, state);
    if (!entry) continue;
    element.classList.remove('is-smart-moving', 'is-smart-displaced');
    for (const property of ['left', 'top', 'width', 'height']) {
      element.style.removeProperty(property);
    }
    applyGridItemPosition(container, element, entry.item);
  }
}

/** Adds edit controls through each registered feature adapter. */
export function enableGridEditing(container) {
  if (!container || isListView()) return;
  const state = getState();

  for (const element of container.children) {
    const entry = gridItemRegistry.resolveElement(element, state);
    if (!entry?.definition.enableEditing) continue;
    entry.definition.enableEditing(container, element, entry.item, entry);
  }
}

function renderList(container, state) {
  const groupId = getActiveWorkspaceId(state.data);
  let searchState = listSearchStates.get(container);
  const oldSearch = container.querySelector('#bookmark-list-search');
  const restoreSearchFocus = oldSearch && document.activeElement === oldSearch;
  const selection = restoreSearchFocus
    ? [oldSearch.selectionStart, oldSearch.selectionEnd]
    : null;
  searchState?.destroy?.();
  if (!searchState || searchState.groupId !== groupId) {
    searchState = { groupId, query: '' };
    listSearchStates.set(container, searchState);
  }

  const header = document.createElement('header');
  header.className = 'bookmark-list-header';
  const heading = document.createElement('h1');
  heading.textContent = getWorkspaceById(state.data, groupId)?.name || t('workspace.main');
  const caption = document.createElement('small');
  caption.textContent = t('view.list');
  header.append(heading, caption);

  const list = document.createElement('ul');
  list.className = 'bookmark-list-items';
  for (const entry of gridItemRegistry.entries(state, { view: 'list' })) {
    list.append(entry.definition.render({
      ...entry,
      view: 'list',
      container,
      state
    }));
  }

  const search = createListSearch({
    list,
    query: searchState.query,
    onFocus: clearGridKeyboardNavigation,
    onChange: query => {
      searchState.query = query;
      clearGridKeyboardNavigation();
    }
  });
  searchState.destroy = search.destroy;
  container.replaceChildren(header, search.element, list, search.empty);
  if (container.querySelector('.is-keyboard-active[hidden]')) clearGridKeyboardNavigation();
  if (restoreSearchFocus) {
    search.input.focus({ preventScroll: true });
    search.input.setSelectionRange(...selection);
  }
}
