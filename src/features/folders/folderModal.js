import {
  BOOKMARK_FOLDER_NAME_MAX_LENGTH,
  removeBookmarkFromFolder,
  renameBookmarkFolder,
  updateFolderBookmarkPositions
} from './folderActions.js';
import { deleteBookmarksByIds } from '../bookmarks/bookmarkActions.js';
import {
  createFolderBookmarkLayout,
  FOLDER_GRID_CAPACITY,
  FOLDER_GRID_COLUMNS,
  FOLDER_GRID_ROWS
} from '../../domain/folders/folderGrid.js';
import { t } from '../../platform/i18n/i18n.js';
import { getState, subscribe } from '../../state/appStore.js';
import { createItemActionButton } from '../../shared/ui/itemActionButton.js';
import { calculateSmartDragLayout } from '../../shared/grid/smartDragLayout.js';
import { createBookmarkListItem } from '../bookmarks/bookmarkListItem.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { flashInfo, flashSuccess } from '../../shared/ui/flash.js';
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
import { applyFolderAppearance, createFolderVisual } from './folderVisual.js';

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
let empty;
let editToggle;
let customizeButton;
let folderIsEditing = false;
let dragSession = null;
let pendingFolderCommit = null;

export function initFolderModal() {
  if (initialized) return;
  initialized = true;

  modal = document.getElementById('folder-modal');
  modalCard = modal.querySelector('.modal-folder');
  title = document.getElementById('folder-modal-title');
  renameActions = document.getElementById('folder-modal-rename-actions');
  renameAccept = document.getElementById('folder-modal-rename-accept');
  renameCancel = document.getElementById('folder-modal-rename-cancel');
  summary = document.getElementById('folder-modal-summary');
  list = document.getElementById('folder-modal-items');
  empty = document.getElementById('folder-modal-empty');
  editToggle = document.getElementById('folder-modal-edit-toggle');
  customizeButton = document.getElementById('folder-modal-customize');

  document.getElementById('folder-modal-close').addEventListener('click', closeFolderModal);
  editToggle.addEventListener('click', () => toggleFolderEditMode());
  customizeButton.addEventListener('click', () => {
    if (activeFolderId) openFolderEditor(activeFolderId);
  });
  title.addEventListener('dblclick', startInlineFolderRename);
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

  subscribe(() => {
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
  folderIsEditing = false;
  renderFolderContents();
  openModal('folder', { onCancel: closeFolderModal });
}

function closeFolderModal() {
  cancelFolderDrag();
  folderIsEditing = false;
  modal.classList.remove('is-folder-editing');
  activeFolderId = null;
  closeModal('folder');
}

function toggleFolderEditMode() {
  if (!folderIsEditing && !ensurePanelFits()) return;
  setFolderEditMode(!folderIsEditing, { announce: true });
}

function setFolderEditMode(isEditing, { announce = false } = {}) {
  if (folderIsEditing === isEditing) return;
  if (!isEditing) cancelFolderDrag();

  folderIsEditing = isEditing;
  renderFolderContents();

  if (announce) {
    flashInfo(
      isEditing ? 'flash.editMode.enabled' : 'flash.editMode.disabled',
      1000
    );
  }
}

function syncFolderEditUI() {
  modal.classList.toggle('is-folder-editing', folderIsEditing);
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

  const contents = bookmarks.filter(bookmark => bookmark.folderId === folder.id);
  const layout = createFolderBookmarkLayout(contents);
  syncFolderEditUI();
  // The customization action remains visible even when the launcher glyph is hidden.
  const customizeAppearance = { ...folder, showFolder: true };
  customizeButton.replaceChildren(
    createFolderVisual(customizeAppearance, [], { compact: true }),
    createEditIndicatorSvg()
  );
  applyFolderAppearance(customizeButton, customizeAppearance);
  if (!title.isContentEditable) title.textContent = folder.name;
  title.setAttribute('title', t('folder.actions.rename'));
  summary.textContent = t('folder.summary', {
    count: contents.length,
    capacity: FOLDER_GRID_CAPACITY
  });
  list.replaceChildren();
  list.classList.remove('is-folder-grid-settling', 'is-folder-grid-exit-target');
  empty.classList.toggle('is-hidden', contents.length > 0);
  list.classList.toggle('is-list-view', isListView());

  if (isListView()) {
    const ordered = [...contents].sort((a, b) => {
      const first = layout.get(a.id);
      const second = layout.get(b.id);
      return first.gy - second.gy || first.gx - second.gx;
    });
    for (const bookmark of ordered) list.append(createBookmarkListItem(bookmark));
    return;
  }

  for (const bookmark of contents) {
    const position = layout.get(bookmark.id);
    if (position) list.append(createFolderBookmarkItem(bookmark, position));
  }
}

function startInlineFolderRename(event) {
  event.preventDefault();
  event.stopPropagation();
  if (!ensurePanelFits()) return;
  const folder = getState().data.folders.find(item => item.id === activeFolderId);
  if (!folder || title.isContentEditable) return;

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

  const renamed = renameBookmarkFolder(activeFolderId, nextName);
  if (renamed) {
    flashSuccess('flash.folder.renamed');
  } else {
    title.textContent = originalName;
  }
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
    const confirmed = await showAlert(
      t('alert.bookmark.confirmDelete', { name: bookmark.name }),
      { type: 'confirm' }
    );
    if (!confirmed) return;

    if (deleteBookmarksByIds([bookmark.id])) {
      flashSuccess('flash.bookmark.deleted');
    }
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
  const result = removeBookmarkFromFolder(bookmarkId, {
    columns: getMaxVisibleCols(),
    rows: getMaxVisibleRows()
  });
  if (result.reason === 'no-space') {
    await showAlert(t('folder.removeNoSpace'), { type: 'info' });
    return false;
  }
  if (!result.bookmark) return false;

  flashSuccess('flash.folder.bookmarkRemoved');
  return true;
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
