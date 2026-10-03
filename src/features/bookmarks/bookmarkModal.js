import { getState, waitForPersistence } from '../../state/appStore.js';
import {
  createBookmarkDraft,
  normalizeBookmarkPreset
} from '../../domain/bookmarks/bookmarkModel.js';
import { t } from '../../platform/i18n/i18n.js';
import { findFirstFreeSlot } from '../../shared/grid/gridPlacement.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { initCustomSelect, refreshCustomSelect } from '../../shared/ui/customSelect.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { getMaxVisibleCols, getMaxVisibleRows } from '../grid/gridLayout.js';
import {
  closeModal,
  openModal as openManagedModal,
  registerModal
} from '../../shared/ui/modalManager.js';
import { ensurePanelFits } from '../../shared/ui/viewportMode.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceSelectors.js';
import {
  addBookmark,
  getOccupiedGridItems,
  updateBookmarkById
} from './bookmarkActions.js';
import { createBookmarkEditorPanel } from './bookmarkEditorPanel.js';

const modal = document.getElementById('edit-bookmark-modal');
const modalTitle = modal.querySelector('h2');
const modalHost = document.getElementById('bookmark-modal-form-host');
const modalSave = document.getElementById('edit-bookmark-modal-save');
const modalCancel = document.getElementById('edit-bookmark-modal-cancel');
const densityToggle = document.getElementById('bookmark-modal-density-toggle');

/** @type {'add' | 'edit' | 'preset' | null} */
let mode = null;

/** @type {string|null} */
let editingId = null;

/** @type {ReturnType<typeof createBookmarkEditorPanel>|null} */
let form = null;

/** @type {((preset: BookmarkPreset) => void)|null} */
let applyPreset = null;

/** @type {{getPresets: () => BookmarkPreset[], replacePresets: (presets: BookmarkPreset[]) => void, onPresetsChange?: () => void}|null} */
let presetLibrary = null;
let presetLibraryAbortController = null;
let presetLibrarySelectInstance = null;

let submitting = false;
let registered = false;

/**
 * Initializes the unified bookmark modal.
 */
export function initBookmarkModal() {
  if (registered) return;
  registered = true;

  modalSave.addEventListener('click', handleAccept);
  modalCancel.addEventListener('click', handleCancel);
  densityToggle.addEventListener('click', () => {
    setAddCompactMode(!modal.classList.contains('is-add-compact'));
    requestAnimationFrame(() => form?.elements.name?.focus());
  });

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleAccept();
    }
  });

  document.getElementById('add-bookmark')
    ?.addEventListener('click', openAddBookmark);

  registerModal({
    id: 'bookmark-modal',
    element: modal,
    requiresWideViewport: true,
    closeOnEsc: true,
    closeOnOverlay: true,
    acceptOnEnter: false,
    initialFocus: null
  });
}

/**
 * Opens the modal in add mode with a fresh bookmark draft.
 */
export function openAddBookmark() {
  if (!ensurePanelFits()) return;
  const { data } = getState();
  const draft = createBookmarkDraft({
    preset: data.settings.bookmarkDefault,
    bookmark: { groupId: getActiveWorkspaceId(data) }
  });

  openBookmarkModal('add', draft);
}

/**
 * Opens the modal in edit mode for the given bookmark id.
 *
 * @param {string} bookmarkId
 */
export function openEditBookmark(bookmarkId) {
  if (!ensurePanelFits()) return;
  const state = getState();
  const bookmark = state.data.bookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) return;

  editingId = bookmarkId;
  openBookmarkModal('edit', structuredClone(bookmark));
}

/**
 * Opens the shared editor in appearance-preset mode.
 * The caller owns the draft and decides how applying it is persisted.
 *
 * @param {Partial<BookmarkPreset>} preset
 * @param {Object} options
 * @param {(preset: BookmarkPreset) => void|Promise<void>} options.onApply
 * @param {() => BookmarkPreset[]} options.getPresets
 * @param {(presets: BookmarkPreset[]) => void} options.replacePresets
 * @param {() => void} [options.onPresetsChange]
 */
export function openBookmarkPresetEditor(preset, options = {}) {
  if (!ensurePanelFits()) return;
  const { onApply, getPresets, replacePresets, onPresetsChange } = options;
  if (typeof onApply !== 'function') {
    throw new TypeError('Preset editor requires an onApply callback');
  }
  if (typeof getPresets !== 'function' || typeof replacePresets !== 'function') {
    throw new TypeError('Preset editor requires preset library callbacks');
  }

  editingId = null;
  applyPreset = onApply;
  presetLibrary = { getPresets, replacePresets, onPresetsChange };
  openBookmarkModal('preset', structuredClone(preset));
}

/**
 * @param {'add' | 'edit' | 'preset'} nextMode
 * @param {Object} bookmark
 */
function openBookmarkModal(nextMode, bookmark) {
  mode = nextMode;
  destroyPresetLibraryControls();
  form?.destroy();
  form = createBookmarkEditorPanel({
    host: modalHost,
    idPrefix: 'bookmark-modal-form',
    mode: nextMode === 'add' ? 'create' : nextMode,
    value: bookmark,
    previewName: nextMode === 'preset'
      ? t('settingsModal.bookmark.previewName')
      : undefined,
    previewFaviconUrl: nextMode === 'preset'
      ? chrome.runtime.getURL('assets/icons/icon-128.png')
      : null,
    onChange: updateSaveButtonState
  });

  modalTitle.textContent = t(
    nextMode === 'add'
      ? 'addModal.title'
      : (nextMode === 'preset' ? 'settingsModal.bookmark.editorTitle' : 'editModal.title')
  );
  modalSave.textContent = t(
    nextMode === 'add'
      ? 'buttons.add'
      : (nextMode === 'preset' ? 'buttons.apply' : 'buttons.save')
  );

  setAddCompactMode(nextMode === 'add');
  if (nextMode === 'preset') initPresetLibraryControls();
  updateSaveButtonState();
  form.activateDefaultTab();

  openManagedModal('bookmark-modal', {
    onAccept: handleAccept,
    onCancel: handleCancel,
    initialFocus: form.elements.name ?? form.elements.backgroundColor
  });
}

function initPresetLibraryControls() {
  const library = form?.root.querySelector('[data-bookmark-preset-library]');
  const nameInput = library?.querySelector('[data-preset-name]');
  const select = library?.querySelector('[data-preset-select]');
  const saveButton = library?.querySelector('[data-preset-save]');
  const applyButton = library?.querySelector('[data-preset-apply]');
  const deleteButton = library?.querySelector('[data-preset-delete]');
  if (!library || !nameInput || !select || !saveButton || !applyButton || !deleteButton) return;

  library.hidden = false;
  presetLibraryAbortController = new AbortController();
  presetLibrarySelectInstance = initCustomSelect(select);
  const { signal } = presetLibraryAbortController;

  nameInput.addEventListener('input', () => nameInput.setCustomValidity(''), { signal });
  saveButton.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.setCustomValidity(t('validation.preset.name'));
      nameInput.reportValidity();
      return;
    }

    nameInput.setCustomValidity('');
    const presets = structuredClone(presetLibrary.getPresets());
    const preset = {
      id: crypto.randomUUID(),
      name,
      style: normalizeBookmarkPreset(form.getState())
    };
    presets.push(preset);
    presetLibrary.replacePresets(presets);
    nameInput.value = '';
    renderPresetLibraryOptions(select, applyButton, deleteButton, preset.id);
    presetLibrary.onPresetsChange?.();
  }, { signal });

  applyButton.addEventListener('click', () => {
    const selected = presetLibrary.getPresets().find(preset => preset.id === select.value);
    if (!selected) return;
    form.setValue(normalizeBookmarkPreset(selected.style));
    updateSaveButtonState();
  }, { signal });

  deleteButton.addEventListener('click', () => {
    const presets = presetLibrary.getPresets()
      .filter(preset => preset.id !== select.value);
    presetLibrary.replacePresets(presets);
    renderPresetLibraryOptions(select, applyButton, deleteButton);
    presetLibrary.onPresetsChange?.();
  }, { signal });

  renderPresetLibraryOptions(select, applyButton, deleteButton);
}

function renderPresetLibraryOptions(select, applyButton, deleteButton, selectedId) {
  const presets = presetLibrary.getPresets();
  select.replaceChildren();

  if (!presets.length) {
    select.add(new Option(t('settingsModal.bookmark.presets.empty'), ''));
  } else {
    for (const preset of presets) select.add(new Option(preset.name, preset.id));
    select.value = selectedId && presets.some(preset => preset.id === selectedId)
      ? selectedId
      : presets[0].id;
  }

  select.disabled = presets.length === 0;
  refreshCustomSelect(select);
  applyButton.disabled = presets.length === 0;
  deleteButton.disabled = presets.length === 0;
}

function destroyPresetLibraryControls() {
  presetLibraryAbortController?.abort();
  presetLibraryAbortController = null;
  presetLibrarySelectInstance?.destroy();
  presetLibrarySelectInstance = null;
}

function getCurrentFormState() {
  return form?.getState() ?? {};
}

function hasChanges() {
  return form?.isDirty() ?? false;
}

function updateSaveButtonState() {
  if (mode === 'add') {
    const hasName = getCurrentFormState().name?.trim().length > 0;
    modalSave.disabled = !hasName;
    modalSave.classList.toggle('is-disabled', !hasName);
    modalSave.classList.remove('is-hidden');
    return;
  }

  const changed = hasChanges();
  modalSave.disabled = !changed;
  modalSave.classList.toggle('is-hidden', !changed);
  modalSave.classList.remove('is-disabled');
}

async function handleAccept() {
  if (mode === 'add') {
    await handleAddAccept();
  } else if (mode === 'edit') {
    await handleEditAccept();
  } else {
    await handlePresetAccept();
  }
}

function setAddCompactMode(compact) {
  const isAddMode = mode === 'add';
  const nextCompact = isAddMode && compact;
  if (nextCompact) form?.activateDefaultTab();

  modal.classList.toggle('is-add-compact', nextCompact);
  densityToggle.classList.toggle('is-hidden', !isAddMode);
  densityToggle.setAttribute('aria-expanded', String(isAddMode && !nextCompact));
  densityToggle.textContent = t(
    nextCompact ? 'addModal.advancedOptions' : 'addModal.compactView'
  );

  for (const element of modal.querySelectorAll(
    '.edit-bookmark-modal-tabs, .edit-bookmark-modal-preview-panel, '
      + '[data-tab-panel="general"] .input-action'
  )) {
    element.inert = nextCompact;
    if (nextCompact) element.setAttribute('aria-hidden', 'true');
    else element.removeAttribute('aria-hidden');
  }
}

async function handleAddAccept() {
  if (submitting) return;

  submitting = true;

  try {
    const validation = form.validate();
    if (!validation.isValid) return;
    const bookmark = validation.value;

    const groupItems = getOccupiedGridItems(bookmark.groupId);
    const maxRows = getMaxVisibleRows();
    const maxCols = getMaxVisibleCols();

    const position = findFirstFreeSlot(groupItems, {
      columns: maxCols,
      rows: maxRows
    });

    if (!position) {
      closeBookmarkModal();

      await new Promise(requestAnimationFrame);

      await showAlert(t('alert.bookmarks.no_space'), { type: 'info' });
      return;
    }

    const created = addBookmark({ ...bookmark, ...position });
    await waitForPersistence();

    if (created) {
      flashSuccess('flash.bookmark.added');
    }

    closeBookmarkModal();
  } finally {
    submitting = false;
    if (form.elements.backgroundImage) {
      form.elements.backgroundImage.value = '';
    }
  }
}

async function handleEditAccept() {
  if (!editingId || !hasChanges()) return;

  const validation = form.validate();
  if (!validation.isValid) return;
  const bookmark = updateBookmarkById(editingId, validation.value);
  await waitForPersistence();

  if (bookmark) {
    flashSuccess('flash.bookmark.updated');
  }

  closeBookmarkModal();
}

async function handlePresetAccept() {
  if (!hasChanges() || submitting) return;

  const validation = form.validate();
  if (!validation.isValid) return;

  submitting = true;
  modalSave.disabled = true;

  try {
    await applyPreset?.(validation.value);
    closeBookmarkModal();
  } catch (error) {
    console.error('[BOOKMARK] Could not apply default bookmark style:', error);
    flashError('flash.settings.bookmarkDefaultError');
  } finally {
    submitting = false;
    if (mode === 'preset') updateSaveButtonState();
  }
}

async function handleCancel() {
  if (mode === 'add') {
    if (!hasChanges()) {
      closeBookmarkModal();
      return true;
    }

    const ok = await showAlert(
      t('alert.bookmark.add.cancel'),
      { type: 'confirm' }
    );

    if (!ok) return false;

    resetAddForm();
    closeBookmarkModal();
    return true;
  }

  if (!hasChanges()) {
    closeBookmarkModal();
    return;
  }

  const ok = await showAlert(
    t(mode === 'preset' ? 'alert.settings.bookmark.cancel' : 'alert.bookmark.cancel'),
    { type: 'confirm' }
  );

  if (ok) closeBookmarkModal();
}

function resetAddForm() {
  const { data } = getState();
  form.reset(createBookmarkDraft({
    preset: data.settings.bookmarkDefault,
    bookmark: { groupId: getActiveWorkspaceId(data) }
  }));
}

function closeBookmarkModal() {
  destroyPresetLibraryControls();
  modal.classList.remove('is-add-compact');
  densityToggle.classList.add('is-hidden');
  mode = null;
  editingId = null;
  applyPreset = null;
  presetLibrary = null;
  closeModal('bookmark-modal');
}
