import {
  BOOKMARK_FOLDER_NAME_MAX_LENGTH,
  moveFolderEntry,
  removeBookmarkFromFolder,
  removeFolderFromParent,
  renameBookmarkFolder,
  updateFolderBookmarkPositions
} from './folderActions.js';
import { confirmItemRecycle } from '../grid/gridItemRemoval.js';
import {
  createFolderBookmarkLayout,
  FOLDER_GRID_CAPACITY,
  FOLDER_GRID_COLUMNS,
  FOLDER_GRID_ROWS
} from '../../domain/folders/folderGrid.js';
import { FOLDER_PAGE_SIZE, getFolderAncestors, getFolderContentsPage } from '../../domain/folders/folderContents.js';
import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { getState, subscribe } from '../../state/appStore.js';
import { debug } from '../../shared/diagnostics/debug.js';
import { createItemActionButton } from '../../shared/ui/itemActionButton.js';
import { calculateSmartDragLayout } from '../../shared/grid/smartDragLayout.js';
import { createBookmarkListItem } from '../bookmarks/bookmarkListItem.js';
import { createFolderListItem } from './folderListItem.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { flashInfo, flashSuccess } from '../../shared/ui/flash.js';
import { runPersistedAction } from '../persistence/persistedAction.js';
import { getMaxVisibleCols, getMaxVisibleRows } from '../grid/gridLayout.js';
import {
  closeModal,
  isModalSuspended,
  openModal,
  registerModal
} from '../../shared/ui/modalManager.js';
import { createEditIndicatorSvg } from '../../shared/ui/svgIcons.js';
import { ensurePanelFits, isListView } from '../../shared/ui/viewportMode.js';
import { createBookmarkElement } from '../bookmarks/bookmarkCard.js';
import { openEditBookmark } from '../bookmarks/bookmarkModal.js';
import { openFolderEditor } from './folderEditorModal.js';
import { createFolderVisual } from './folderVisual.js';
import {
  applyFolderAppearance,
  applyFolderContentsAppearance
} from './folderAppearance.js';

const FOLDER_MOVE_DURATION = 220;
let initialized = false;
let activeFolderId = null;
let modal;
let modalCard;
let title;
let renameActions;
let renameAccept;
let renameCancel;
let summary;
let list;
let editToggle;
let customizeButton;
let navigation;
let searchInput;
let searchRow;
let pagination;
let previousPage;
let nextPage;
let pageLabel;
let currentPage = 0;
let folderIsEditing = false;
let selectedEntryId = null;
let reorderToolbar;
let selectedEntryName;
let moveUpButton;
let moveDownButton;
let reorderPending = false;
let dragSession = null;
let pendingFolderCommit = null;

export function initFolderModal() {
  if (initialized) return;
  initialized = true;

  modal = document.getElementById('folder-modal');
  modalCard = modal.querySelector('.modal-folder');
  title = document.getElementById('folder-modal-title');
  title.tabIndex = -1;
  renameActions = document.getElementById('folder-modal-rename-actions');
  renameAccept = document.getElementById('folder-modal-rename-accept');
  renameCancel = document.getElementById('folder-modal-rename-cancel');
  summary = document.getElementById('folder-modal-summary');
  list = document.getElementById('folder-modal-items');
  editToggle = document.getElementById('folder-modal-edit-toggle');
  customizeButton = document.getElementById('folder-modal-customize');
  initFolderNavigation();

  editToggle.addEventListener('click', () => toggleFolderEditMode());
  customizeButton.addEventListener('click', () => {
    if (activeFolderId) openFolderEditor(activeFolderId);
  });
  title.addEventListener('click', startInlineFolderRename);
  title.addEventListener('blur', () => {
    if (!isModalSuspended('folder')) finishInlineFolderRename();
  });
  title.addEventListener('keydown', event => {
    if (!title.isContentEditable) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      finishInlineFolderRename();
      title.blur();
      return;
    }

    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    finishInlineFolderRename({ cancel: true });
    title.blur();
  });
  title.addEventListener('beforeinput', event => {
    if (['insertParagraph', 'insertLineBreak'].includes(event.inputType)) {
      event.preventDefault();
    }
  });
  title.addEventListener('input', enforceInlineFolderNameLimit);
  renameActions.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
  });
  renameAccept.addEventListener('click', event => {
    event.stopPropagation();
    finishInlineFolderRename();
    title.blur();
  });
  renameCancel.addEventListener('click', event => {
    event.stopPropagation();
    finishInlineFolderRename({ cancel: true });
    title.blur();
  });
  modal.addEventListener('pointerdown', event => {
    if (
      title.isContentEditable
      && !title.contains(event.target)
      && !renameActions.contains(event.target)
    ) {
      finishInlineFolderRename();
    }
  }, true);
  window.addEventListener('resize', () => {
    if (!activeFolderId) return;
    cancelFolderDrag();
    renderFolderContents();
  });
  registerModal({
    id: 'folder',
    element: modal,
    requiresWideViewport: () => folderIsEditing || title.isContentEditable,
    closeOnEsc: true,
    closeOnOverlay: true
  });

  subscribe((state, previous) => {
    if (activeFolderId && (!previous || ['bookmarks', 'folders', 'settings']
      .some(key => state.data[key] !== previous.data[key]))) renderFolderContents();
  });
  subscribeLanguageChange(() => {
    if (activeFolderId) renderFolderContents();
  });
}

export function openFolderModal(folderId) {
  if (isModalSuspended('folder')) {
    flashInfo('flash.viewport.suspended');
    return;
  }
  const folder = getState().data.folders.find(item => item.id === folderId);
  if (!folder) return;

  activeFolderId = folderId;
  currentPage = 0;
  searchInput.value = '';
  folderIsEditing = false;
  selectedEntryId = null;
  renderFolderContents();
  list.parentElement.scrollTop = 0;
  openModal('folder', { onCancel: closeFolderModal });
  if (!isListView()) editToggle.focus({ preventScroll: true });
}

function closeFolderModal() {
  cancelFolderDrag();
  folderIsEditing = false;
  modal.classList.remove('is-folder-editing');
  activeFolderId = null;
  closeModal('folder');
}

function initFolderNavigation() {
  navigation = document.createElement('nav');
  navigation.className = 'folder-breadcrumbs custom-scrollbar';
  searchRow = document.createElement('div');
  searchRow.className = 'folder-search';
  searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'folder-modal-search';
  searchInput.addEventListener('input', () => {
    cancelFolderDrag();
    currentPage = 0;
    renderFolderContents();
    list.parentElement.scrollTop = 0;
  });
  searchRow.append(searchInput);
  const shell = modalCard.querySelector('.folder-grid-shell');
  shell.classList.add('custom-scrollbar');
  reorderToolbar = document.createElement('div');
  reorderToolbar.className = 'folder-reorder-toolbar';
  reorderToolbar.hidden = true;
  selectedEntryName = document.createElement('span');
  moveUpButton = document.createElement('button');
  moveUpButton.type = 'button';
  moveUpButton.id = 'folder-move-up';
  moveDownButton = document.createElement('button');
  moveDownButton.type = 'button';
  moveDownButton.id = 'folder-move-down';
  moveUpButton.addEventListener('click', () => void moveSelectedEntry(-1));
  moveDownButton.addEventListener('click', () => void moveSelectedEntry(1));
  reorderToolbar.append(selectedEntryName, moveUpButton, moveDownButton);
  shell.before(navigation, searchRow, reorderToolbar);
  pagination = document.createElement('div');
  pagination.className = 'folder-pagination';
  previousPage = document.createElement('button');
  previousPage.type = 'button';
  previousPage.id = 'folder-modal-previous-page';
  nextPage = document.createElement('button');
  nextPage.type = 'button';
  nextPage.id = 'folder-modal-next-page';
  pageLabel = document.createElement('span');
  pageLabel.setAttribute('aria-live', 'polite');
  const changePage = delta => {
    cancelFolderDrag();
    currentPage += delta;
    renderFolderContents();
    list.parentElement.scrollTop = 0;
  };
  previousPage.addEventListener('click', () => changePage(-1));
  nextPage.addEventListener('click', () => changePage(1));
  pagination.append(previousPage, pageLabel, nextPage);
  shell.after(pagination);
}

function navigateToFolder(folderId) {
  finishInlineFolderRename();
  cancelFolderDrag();
  activeFolderId = folderId;
  selectedEntryId = null;
  currentPage = 0;
  searchInput.value = '';
  renderFolderContents();
  list.parentElement.scrollTop = 0;
  title.focus({ preventScroll: true });
}

function renderFolderNavigation(folders, folder) {
  navigation.setAttribute('aria-label', t('folder.navigation'));
  const ancestors = getFolderAncestors(folders, folder.id);
  navigation.hidden = ancestors.length < 2;
  const elements = [];
  if (ancestors.length > 1) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'folder-back';
    back.textContent = `← ${t('folder.back')}`;
    back.addEventListener('click', () => navigateToFolder(ancestors.at(-2).id));
    elements.push(back);
  }
  for (const ancestor of ancestors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = ancestor.name;
    button.title = ancestor.name;
    if (ancestor.id === folder.id) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => navigateToFolder(ancestor.id));
    elements.push(button);
  }
  navigation.replaceChildren(...elements);
}

function toggleFolderEditMode() {
  if (!folderIsEditing && !ensurePanelFits()) return;
  setFolderEditMode(!folderIsEditing, { announce: true });
}

function setFolderEditMode(isEditing, { announce = false } = {}) {
  if (folderIsEditing === isEditing) return;
  if (!isEditing) cancelFolderDrag();

  folderIsEditing = isEditing;
  if (!isEditing) selectedEntryId = null;
  renderFolderContents();

  if (announce) {
    flashInfo(
      isEditing ? 'flash.editMode.enabled' : 'flash.editMode.disabled',
      1000
    );
  }
}

function syncFolderEditUI(listView) {
  modal.classList.toggle('is-folder-editing', folderIsEditing);
  customizeButton.hidden = !folderIsEditing;
  editToggle.hidden = listView;
  editToggle.setAttribute('aria-pressed', String(folderIsEditing));
  editToggle.textContent = t(
    folderIsEditing ? 'folder.editMode.disable' : 'folder.editMode.enable'
  );
}

function renderFolderContents() {
  if (isModalSuspended('folder')) return;
  const { bookmarks, folders } = getState().data;
  const folder = folders.find(item => item.id === activeFolderId);
  if (!folder) {
    if (activeFolderId) closeFolderModal();
    return;
  }

  const trace = debug.start('Render folder contents');
  const contents = bookmarks.filter(bookmark => bookmark.folderId === folder.id);
  const page = getFolderContentsPage({ bookmarks, folders }, folder.id, {
    query: searchInput.value, page: currentPage
  });
  currentPage = page.page;
  const layout = page.layout;
  const listView = isListView();
  const compact = listView || page.hasSubfolders || page.totalCount > FOLDER_GRID_CAPACITY
    || Boolean(searchInput.value) || [...layout.values()].some(position => position.gy >= FOLDER_GRID_ROWS);
  const ordered = compact && folderIsEditing
    ? getFolderContentsPage({ bookmarks, folders }, folder.id, { pageSize: Number.MAX_SAFE_INTEGER }).entries : [];
  const selectedIndex = ordered.findIndex(entry => entry.item.id === selectedEntryId);
  reorderToolbar.hidden = !compact || !folderIsEditing || selectedIndex < 0;
  selectedEntryName.textContent = selectedIndex < 0 ? '' : ordered[selectedIndex].item.name;
  moveUpButton.textContent = `↑ ${t('settingsModal.theme.moveUp')}`;
  moveDownButton.textContent = `↓ ${t('settingsModal.theme.moveDown')}`;
  moveUpButton.disabled = reorderPending || selectedIndex <= 0;
  moveDownButton.disabled = reorderPending || selectedIndex < 0 || selectedIndex >= ordered.length - 1;
  syncFolderEditUI(listView);
  applyFolderContentsAppearance(modalCard, folder);
  // The edit action keeps its glyph even when the launcher artwork is hidden.
  const customizeAppearance = { ...folder, showFolder: true };
  customizeButton.replaceChildren(
    createFolderVisual(customizeAppearance, [], { compact: true }),
    createEditIndicatorSvg()
  );
  applyFolderAppearance(customizeButton, customizeAppearance);
  if (!title.isContentEditable) title.textContent = folder.name;
  title.setAttribute('title', t('folder.actions.rename'));
  summary.textContent = t('folder.contentsCount', { count: page.totalCount });
  renderFolderNavigation(folders, folder);
  searchRow.hidden = page.totalCount <= FOLDER_GRID_CAPACITY && !page.hasSubfolders && !searchInput.value;
  searchInput.placeholder = t('folder.search');
  searchInput.setAttribute('aria-label', t('folder.search'));
  pagination.hidden = page.pages <= 1;
  previousPage.textContent = t('folder.previousPage');
  previousPage.disabled = page.page === 0;
  nextPage.textContent = t('folder.nextPage');
  nextPage.disabled = page.page === page.pages - 1;
  pageLabel.textContent = t('folder.page', { page: page.page + 1, pages: page.pages });
  list.replaceChildren();
  list.classList.remove('is-folder-grid-settling', 'is-folder-grid-exit-target');
  modalCard.classList.toggle('is-empty-list', listView && page.totalCount === 0);
  modalCard.classList.toggle('has-compact-contents', compact);
  list.classList.toggle('is-list-view', compact);

  if (compact) {
    list.replaceChildren(...page.entries.map(createCompactFolderEntry));
    if (!page.matchCount && searchInput.value) {
      const empty = document.createElement('p');
      empty.className = 'folder-search-empty';
      empty.textContent = t('folder.searchEmpty');
      list.append(empty);
    }
    trace.end({ bookmarks: page.totalCount, rendered: page.entries.length, listView: true });
    return;
  }

  list.replaceChildren(...contents.flatMap(bookmark => {
    const position = layout.get(bookmark.id);
    return position ? [createFolderBookmarkItem(bookmark, position)] : [];
  }));
  trace.end({ bookmarks: contents.length, listView });
}

function createCompactFolderEntry({ kind, item }) {
  const row = kind === 'folder'
    ? createFolderListItem({ ...item, showName: true }, { onOpen: () => navigateToFolder(item.id) })
    : createBookmarkListItem(item);
  if (!folderIsEditing) return row;
  row.classList.toggle('is-folder-row-selected', selectedEntryId === item.id);
  const select = document.createElement('input');
  select.type = 'checkbox';
  select.className = 'folder-row-select';
  select.setAttribute('aria-label', item.name);
  select.checked = selectedEntryId === item.id;
  select.addEventListener('change', () => {
    selectedEntryId = select.checked ? item.id : null;
    renderFolderContents();
    focusSelectedRow();
  });
  row.prepend(select);
  row.addEventListener('click', event => {
    if (event.target.closest('button, input, .folder-bookmark-actions')) return;
    event.preventDefault();
    selectedEntryId = item.id;
    renderFolderContents();
    focusSelectedRow();
  });
  row.addEventListener('keydown', event => {
    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    selectedEntryId = item.id;
    void moveSelectedEntry(event.key === 'ArrowUp' ? -1 : 1);
  });
  const actions = document.createElement('span');
  actions.className = 'folder-bookmark-actions';
  const edit = createItemActionButton('✎', 'edit', 'is-dark', () => {
    if (kind === 'folder') openFolderEditor(item.id);
    else openEditBookmark(item.id);
  });
  edit.setAttribute('aria-label', t('folder.actions.editBookmark', { name: item.name }));
  const remove = createItemActionButton('↗', 'remove', 'is-dark', async () => {
    if (kind === 'bookmark') await moveBookmarkToGrid(item.id);
    else await runPersistedAction(`folder-exit:${item.id}`, () => removeFolderFromParent(item.id, {
      columns: getMaxVisibleCols(), rows: getMaxVisibleRows()
    }), result => {
      if (result.reason === 'no-space') void showAlert(t('folder.removeNoSpace'), { type: 'info' });
    });
  });
  remove.setAttribute('aria-label', t('folder.actions.removeBookmark', { name: item.name }));
  const deleteButton = createItemActionButton('🗑', 'delete', 'is-dark', async () => {
    await confirmItemRecycle(kind, item.id);
  });
  deleteButton.classList.add('folder-item-delete');
  deleteButton.setAttribute('aria-label', t('folder.actions.deleteBookmark', { name: item.name }));
  actions.append(edit, deleteButton, remove);
  for (const button of actions.children) button.title = button.getAttribute('aria-label');
  row.append(actions);
  return row;
}

function focusSelectedRow() {
  const row = Array.from(list.children).find(element => (
    (element.dataset.bookmarkId ?? element.dataset.folderId) === selectedEntryId
  ));
  row?.querySelector('.folder-row-select')?.focus({ preventScroll: true });
  return row;
}

async function moveSelectedEntry(direction) {
  if (!selectedEntryId || !folderIsEditing || reorderPending) return;
  reorderPending = true;
  moveUpButton.disabled = moveDownButton.disabled = true;
  try {
    await runPersistedAction(`folder-order:${activeFolderId}`, () => moveFolderEntry(
      activeFolderId, selectedEntryId, direction
    ), result => {
      if (!result.moved) return;
      searchInput.value = '';
      currentPage = Math.floor(result.index / FOLDER_PAGE_SIZE);
    });
  } finally {
    reorderPending = false;
    if (activeFolderId) {
      renderFolderContents();
      focusSelectedRow()?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }
}

function startInlineFolderRename(event) {
  if (title.isContentEditable) return;
  event.preventDefault();
  event.stopPropagation();
  if (!ensurePanelFits()) return;
  const folder = getState().data.folders.find(item => item.id === activeFolderId);
  if (!folder) return;

  title.dataset.originalName = folder.name;
  title.contentEditable = 'true';
  title.classList.add('is-renaming');
  renameActions.classList.remove('is-hidden');
  title.removeAttribute('title');
  title.focus();

  const range = document.createRange();
  range.selectNodeContents(title);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function finishInlineFolderRename({ cancel = false } = {}) {
  if (!title.isContentEditable) return;

  const originalName = title.dataset.originalName ?? '';
  const nextName = title.textContent.trim();
  title.removeAttribute('contenteditable');
  title.classList.remove('is-renaming');
  renameActions.classList.add('is-hidden');
  delete title.dataset.originalName;
  title.setAttribute('title', t('folder.actions.rename'));

  if (cancel || !nextName || nextName === originalName) {
    title.textContent = originalName;
    return;
  }

  void runPersistedAction(`folder-rename:${activeFolderId}`, () => renameBookmarkFolder(activeFolderId, nextName), renamed => {
    if (renamed) {
      flashSuccess('flash.folder.renamed');
    } else {
      title.textContent = originalName;
    }
  });
}

function enforceInlineFolderNameLimit() {
  if (
    !title.isContentEditable
    || title.textContent.length <= BOOKMARK_FOLDER_NAME_MAX_LENGTH
  ) return;

  title.textContent = title.textContent.slice(
    0,
    BOOKMARK_FOLDER_NAME_MAX_LENGTH
  );
  const range = document.createRange();
  range.selectNodeContents(title);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function createFolderBookmarkItem(bookmark, position) {
  const item = createBookmarkElement(
    { ...bookmark, w: 1, h: 1 },
    { isEditing: folderIsEditing }
  );
  item.classList.add('folder-grid-bookmark');
  item.dataset.bookmarkId = bookmark.id;
  item.setAttribute('role', 'listitem');
  applyFolderCell(item, position);
  for (const draggable of item.querySelectorAll('a, img')) {
    draggable.draggable = false;
  }

  if (!folderIsEditing) return item;

  const actions = document.createElement('span');
  actions.className = 'folder-bookmark-actions';
  const edit = createItemActionButton('✎', 'edit', 'is-dark', () => {
    openEditBookmark(bookmark.id);
  });
  edit.setAttribute('aria-label', t('folder.actions.editBookmark', {
    name: bookmark.name
  }));

  const remove = createItemActionButton('↗', 'remove', 'is-dark', async () => {
    await moveBookmarkToGrid(bookmark.id);
  });
  remove.classList.add('folder-item-remove');
  remove.setAttribute('aria-label', t('folder.actions.removeBookmark', {
    name: bookmark.name
  }));

  const deleteButton = createItemActionButton('🗑', 'delete', 'is-dark', async () => {
    await confirmItemRecycle('bookmark', bookmark.id);
  });
  deleteButton.classList.add('folder-item-delete');
  deleteButton.setAttribute('aria-label', t('folder.actions.deleteBookmark', {
    name: bookmark.name
  }));

  actions.append(edit, deleteButton, remove);
  item.append(actions);
  addFolderBookmarkDrag(item, bookmark.id);
  return item;
}

function addFolderBookmarkDrag(item, bookmarkId) {
  item.addEventListener('auxclick', event => {
    if (event.button !== 1 || !event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    void confirmItemRecycle('bookmark', bookmarkId);
  });
  item.addEventListener('pointerdown', event => {
    if (event.button === 1 && event.shiftKey) event.preventDefault();
  });
  item.addEventListener('click', event => {
    if (event.target.closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  item.addEventListener('pointerdown', event => {
    if (
      pendingFolderCommit
      || event.button !== 0
      || event.target.closest('button')
    ) return;

    const bookmarks = getState().data.bookmarks.filter(
      bookmark => bookmark.folderId === activeFolderId
    );
    const layout = createFolderBookmarkLayout(bookmarks);
    const source = layout.get(bookmarkId);
    if (!source) return;
    const items = bookmarks.map(bookmark => ({
      ...bookmark,
      ...layout.get(bookmark.id),
      w: 1,
      h: 1
    }));

    cancelFolderDrag();
    dragSession = {
      pointerId: event.pointerId,
      item,
      bookmarkId,
      folderId: activeFolderId,
      startX: event.clientX,
      startY: event.clientY,
      source,
      target: source,
      lastTarget: source,
      layout,
      items,
      movableIds: items.map(bookmark => bookmark.id),
      mode: getState().data.settings.bookmarkDragMode,
      cascadeStep: null,
      dropIsValid: true,
      activeLayout: {
        isValid: true,
        positions: [{ id: bookmarkId, ...source }],
        displacedIds: []
      },
      elements: new Map(Array.from(
        list.querySelectorAll('[data-bookmark-id]')
      ).map(element => [element.dataset.bookmarkId, element])),
      outsideModal: false,
      active: false
    };
    item.setPointerCapture(event.pointerId);
  });

  item.addEventListener('pointermove', event => {
    const session = dragSession;
    if (!session || session.pointerId !== event.pointerId || session.item !== item) return;

    if (!session.active) {
      const distance = Math.hypot(
        event.clientX - session.startX,
        event.clientY - session.startY
      );
      if (distance < 6) return;
      session.active = true;
      item.classList.add('is-folder-grid-dragging');
    }

    event.preventDefault();
    previewFolderDrag(session, event.clientX, event.clientY);
  });

  item.addEventListener('pointerup', event => finishFolderDrag(event, true));
  item.addEventListener('pointercancel', event => finishFolderDrag(event, false));
  item.addEventListener('lostpointercapture', event => finishFolderDrag(event, false));
}

function previewFolderDrag(session, clientX, clientY) {
  if (isPointerOutsideFolderModal(clientX, clientY)) {
    previewFolderExit(session);
    return;
  }

  if (session.outsideModal) clearFolderExitFeedback(session);
  if (isPointerOutsideFolderGrid(clientX, clientY)) return;

  const metrics = getFolderGridMetrics();
  const gx = Math.max(0, Math.min(
    FOLDER_GRID_COLUMNS - 1,
    Math.floor((clientX - metrics.left - metrics.paddingLeft) / metrics.stepX)
  ));
  const gy = Math.max(0, Math.min(
    FOLDER_GRID_ROWS - 1,
    Math.floor((clientY - metrics.top - metrics.paddingTop + list.scrollTop) / metrics.stepY)
  ));
  if (session.target.gx === gx && session.target.gy === gy) return;

  session.target = { gx, gy };
  updateFolderCascadeDirection(session, session.target);
  const layout = calculateSmartDragLayout({
    items: session.items,
    draggedId: session.bookmarkId,
    target: session.target,
    movableIds: session.movableIds,
    mode: session.mode,
    cascadeStep: session.cascadeStep,
    previewPositions: session.activeLayout.positions,
    columns: FOLDER_GRID_COLUMNS,
    rows: FOLDER_GRID_ROWS
  });

  if (layout.isValid) {
    session.activeLayout = layout;
    session.dropIsValid = true;
    session.item.classList.remove('is-folder-grid-invalid');
    applyFolderDragPreview(session, layout, metrics);
  } else {
    session.dropIsValid = false;
    session.item.classList.add('is-folder-grid-invalid');
    const invalidPreview = createFolderInvalidPreview(session);
    session.activeLayout = invalidPreview;
    applyFolderDragPreview(session, invalidPreview, metrics);
  }
  session.lastPreviewAt = performance.now();
}

function finishFolderDrag(event, commit) {
  const session = dragSession;
  if (!session || session.pointerId !== event.pointerId) return;
  const shouldMoveToGrid = commit && session.outsideModal;
  dragSession = null;
  if (session.item.hasPointerCapture(event.pointerId)) {
    session.item.releasePointerCapture(event.pointerId);
  }

  if (!session.active) return;

  event.preventDefault();
  clearFolderExitFeedback(session);
  session.item.classList.remove('is-folder-grid-dragging', 'is-folder-grid-invalid');

  if (shouldMoveToGrid) {
    resetFolderDragPreview(session);
    void moveBookmarkToGrid(session.bookmarkId);
    return;
  }

  if (commit && session.dropIsValid && hasFolderLayoutChanges(session)) {
    list.classList.add('is-folder-grid-settling');
    const elapsed = performance.now() - (session.lastPreviewAt ?? 0);
    const delay = prefersReducedMotion()
      ? 0
      : Math.max(0, FOLDER_MOVE_DURATION - elapsed);
    pendingFolderCommit = setTimeout(() => {
      pendingFolderCommit = null;
      updateFolderBookmarkPositions(
        session.folderId,
        session.activeLayout.positions
      );
      list.classList.remove('is-folder-grid-settling');
    }, delay);
    return;
  }

  resetFolderDragPreview(session);
}

function cancelFolderDrag() {
  if (!dragSession) return;
  const session = dragSession;
  dragSession = null;
  if (session.item.hasPointerCapture(session.pointerId)) {
    session.item.releasePointerCapture(session.pointerId);
  }
  clearFolderExitFeedback(session);
  session.item.classList.remove('is-folder-grid-dragging', 'is-folder-grid-invalid');
  resetFolderDragPreview(session);
}

async function moveBookmarkToGrid(bookmarkId) {
  let moved = false;
  await runPersistedAction(`folder-exit:${bookmarkId}`, () => removeBookmarkFromFolder(bookmarkId, {
    columns: getMaxVisibleCols(),
    rows: getMaxVisibleRows()
  }), result => {
    if (result.reason === 'no-space') {
      void showAlert(t('folder.removeNoSpace'), { type: 'info' });
      return;
    }
    if (!result.bookmark) return;

    flashSuccess('flash.folder.bookmarkRemoved');
    moved = true;
  });
  return moved;
}

function previewFolderExit(session) {
  if (session.outsideModal) return;

  session.outsideModal = true;
  session.item.classList.add('is-folder-grid-exiting');
  list.classList.add('is-folder-grid-exit-target');
}

function clearFolderExitFeedback(session) {
  session.outsideModal = false;
  session.item.classList.remove('is-folder-grid-exiting');
  list.classList.remove('is-folder-grid-exit-target');
}

function isPointerOutsideFolderGrid(clientX, clientY) {
  const bounds = list.getBoundingClientRect();
  return isPointerOutsideBounds(bounds, clientX, clientY);
}

function isPointerOutsideFolderModal(clientX, clientY) {
  const bounds = modalCard.getBoundingClientRect();
  return isPointerOutsideBounds(bounds, clientX, clientY);
}

function isPointerOutsideBounds(bounds, clientX, clientY) {
  return clientX < bounds.left
    || clientX > bounds.right
    || clientY < bounds.top
    || clientY > bounds.bottom;
}

function applyFolderDragPreview(session, layout, metrics = getFolderGridMetrics()) {
  const positions = new Map(layout.positions.map(position => [position.id, position]));
  const displaced = new Set(layout.displacedIds);

  for (const [bookmarkId, original] of session.layout) {
    const element = session.elements.get(bookmarkId);
    if (!element) continue;
    const position = positions.get(bookmarkId) ?? original;
    const shiftX = (position.gx - original.gx) * metrics.stepX;
    const shiftY = (position.gy - original.gy) * metrics.stepY;
    element.style.setProperty('--folder-shift-x', `${shiftX}px`);
    element.style.setProperty('--folder-shift-y', `${shiftY}px`);
    element.classList.toggle(
      'is-folder-grid-moving',
      shiftX !== 0 || shiftY !== 0
    );
    element.classList.toggle(
      'is-folder-grid-displaced',
      displaced.has(bookmarkId)
    );
  }
}

function resetFolderDragPreview(session) {
  applyFolderDragPreview(session, createFolderBaselineLayout(session));
  const delay = prefersReducedMotion() ? 0 : FOLDER_MOVE_DURATION;
  setTimeout(() => {
    for (const element of session.elements.values()) {
      element.classList.remove(
        'is-folder-grid-moving',
        'is-folder-grid-displaced'
      );
      element.style.removeProperty('--folder-shift-x');
      element.style.removeProperty('--folder-shift-y');
    }
  }, delay);
}

function createFolderBaselineLayout(session) {
  return {
    isValid: true,
    positions: [{ id: session.bookmarkId, ...session.source }],
    displacedIds: []
  };
}

function createFolderInvalidPreview(session) {
  return {
    isValid: false,
    positions: [{ id: session.bookmarkId, ...session.target }],
    displacedIds: []
  };
}

function hasFolderLayoutChanges(session) {
  return session.activeLayout.positions.some(position => {
    const original = session.layout.get(position.id);
    return original
      && (original.gx !== position.gx || original.gy !== position.gy);
  });
}

function updateFolderCascadeDirection(session, target) {
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

function getFolderGridMetrics() {
  const bounds = list.getBoundingClientRect();
  const styles = getComputedStyle(list);
  const gap = Number.parseFloat(styles.columnGap) || 0;
  const rowGap = Number.parseFloat(styles.rowGap) || gap;
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  const cellWidth = (
    list.clientWidth - paddingLeft - paddingRight
      - gap * (FOLDER_GRID_COLUMNS - 1)
  ) / FOLDER_GRID_COLUMNS;
  const cellHeight = (
    list.clientHeight - paddingTop - paddingBottom
      - rowGap * (FOLDER_GRID_ROWS - 1)
  ) / FOLDER_GRID_ROWS;

  return {
    left: bounds.left,
    top: bounds.top,
    paddingLeft,
    paddingTop,
    stepX: cellWidth + gap,
    stepY: cellHeight + rowGap
  };
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function applyFolderCell(element, { gx, gy }) {
  element.style.gridColumn = String(gx + 1);
  element.style.gridRow = String(gy + 1);
}
