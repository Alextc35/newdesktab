import {
  BOOKMARK_FOLDER_NAME_MAX_LENGTH,
  createBookmarkFolder,
  updateBookmarkFolder
} from './folderActions.js';
import { validateFolderDraft } from '../../domain/folders/folderModel.js';
import { t } from '../../platform/i18n/i18n.js';
import { getState, getStorageMode, waitForPersistence } from '../../state/appStore.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { flashSuccess } from '../../shared/ui/flash.js';
import { getMaxVisibleCols, getMaxVisibleRows } from '../grid/gridLayout.js';
import {
  getImageInputValue,
  initLocalImageUpload,
  setLocalImageSyncNoticeVisibility,
  setImageInputValue
} from '../../shared/ui/localImageUpload.js';
import { createLockableInputController } from '../../shared/ui/lockableInput.js';
import { closeModal, openModal, registerModal } from '../../shared/ui/modalManager.js';
import { initTabs } from '../../shared/ui/tabs.js';
import { ensurePanelFits } from '../../shared/ui/viewportMode.js';
import { applyFolderAppearance, createFolderVisual } from './folderVisual.js';

let initialized = false;
/** @type {'create'|'edit'|null} */
let mode = null;
let activeFolderId = null;
let initialValue = null;
let modal;
let modalTitle;
let nameInput;
let noBackgroundInput;
let colorInput;
let outerColorInput;
let outerColorResetButton;
let outerBackgroundColor = null;
let showFolderInput;
let showPreviewsInput;
let showNameInput;
let showCountInput;
let imageInput;
let imageSourceField;
let imageSourceSelect;
let imageUrlField;
let localImageInput;
let localImageField;
let localColorInput;
let imageUploadInput;
let imageUploadButton;
let imageUploadNotice;
let textColorInput;
let preview;
let saveButton;
let densityToggle;
let nameError;
let imageError;
let imageController;
let submitting = false;

export function initFolderEditorModal() {
  if (initialized) return;
  initialized = true;

  modal = document.getElementById('edit-folder-modal');
  modalTitle = modal.querySelector('h2');
  nameInput = document.getElementById('folder-editor-name');
  noBackgroundInput = document.getElementById('folder-editor-no-background');
  colorInput = document.getElementById('folder-editor-color');
  outerColorInput = document.getElementById('folder-editor-outer-color');
  outerColorResetButton = document.getElementById('folder-editor-outer-color-reset');
  showFolderInput = document.getElementById('folder-editor-show-folder');
  showPreviewsInput = document.getElementById('folder-editor-show-previews');
  showNameInput = document.getElementById('folder-editor-show-name');
  showCountInput = document.getElementById('folder-editor-show-count');
  imageInput = document.getElementById('folder-editor-image');
  imageSourceField = document.getElementById('folder-editor-image-source-field');
  imageSourceSelect = document.getElementById('folder-editor-image-source');
  imageUrlField = document.getElementById('folder-editor-image-url-field');
  localImageInput = document.getElementById('folder-editor-image-local');
  localImageField = localImageInput.closest('.local-image-field');
  localColorInput = document.getElementById('folder-editor-local-color');
  imageUploadInput = document.getElementById('folder-editor-image-upload-input');
  imageUploadButton = document.getElementById('folder-editor-image-upload');
  imageUploadNotice = imageUploadButton?.parentElement?.querySelector('.local-image-notice');
  textColorInput = document.getElementById('folder-editor-text-color');
  preview = document.getElementById('folder-editor-preview');
  saveButton = document.getElementById('edit-folder-modal-save');
  densityToggle = document.getElementById('folder-modal-density-toggle');
  nameError = document.getElementById('folder-editor-name-error');
  imageError = document.getElementById('folder-editor-image-error');

  initTabs({
    root: modal,
    tabButtonSelector: '.edit-bookmark-modal-tab-btn',
    tabContentSelector: '.edit-bookmark-modal-tab-content'
  });

  for (const input of [nameInput, textColorInput]) {
    input.addEventListener('input', handleInput);
  }
  colorInput.addEventListener('input', () => {
    localColorInput.value = colorInput.value;
    handleInput();
  });
  localColorInput.addEventListener('input', () => {
    colorInput.value = localColorInput.value;
    handleInput();
  });
  for (const input of [
    noBackgroundInput, showFolderInput, showPreviewsInput, showNameInput, showCountInput
  ]) {
    input.addEventListener('change', handleInput);
  }
  imageSourceSelect.addEventListener('change', handleInput);
  outerColorInput.addEventListener('input', () => {
    outerBackgroundColor = outerColorInput.value;
    handleInput();
  });
  outerColorResetButton.addEventListener('click', () => {
    outerBackgroundColor = null;
    outerColorInput.value = '#0f172a';
    handleInput();
  });
  imageController = createLockableInputController({
    input: imageInput,
    toggleBtn: document.getElementById('folder-editor-image-toggle'),
    copyBtn: document.getElementById('folder-editor-image-copy'),
    clearBtn: document.getElementById('folder-editor-image-clear'),
    onChange: handleInput
  });
  initLocalImageUpload({
    button: imageUploadButton,
    fileInput: imageUploadInput,
    targetInput: localImageInput,
    clearButton: document.getElementById('folder-editor-image-local-clear'),
    onChange: () => {
      imageSourceSelect.value = getImageInputValue(localImageInput) ? 'local' : 'url';
      handleInput();
    }
  });
  document.getElementById('edit-folder-modal-cancel')
    .addEventListener('click', handleCancel);
  saveButton.addEventListener('click', handleSave);
  densityToggle.addEventListener('click', () => {
    setCreateCompactMode(!modal.classList.contains('is-add-compact'));
    requestAnimationFrame(() => nameInput.focus());
  });

  registerModal({
    id: 'folder-editor',
    element: modal,
    requiresWideViewport: true,
    closeOnEsc: true,
    closeOnOverlay: true,
    acceptOnEnter: true
  });
}

/** Opens a compact new-folder draft that can expand into the full editor. */
export function openCreateFolder() {
  if (!ensurePanelFits()) return;

  mode = 'create';
  activeFolderId = null;
  initialValue = editableFolderValue({ name: '' });
  populateForm(initialValue);
  modalTitle.textContent = t('folder.editor.createTitle');
  saveButton.textContent = t('buttons.add');
  setCreateCompactMode(true);
  prepareEditor();

  openModal('folder-editor', {
    onAccept: handleSave,
    onCancel: handleCancel,
    initialFocus: nameInput
  });
}

export function openFolderEditor(folderId) {
  if (!ensurePanelFits()) return;
  const folder = getState().data.folders.find(item => item.id === folderId);
  if (!folder) return;

  mode = 'edit';
  activeFolderId = folderId;
  initialValue = editableFolderValue(folder);
  populateForm(initialValue);
  modalTitle.textContent = t('folder.editor.title');
  saveButton.textContent = t('buttons.save');
  setCreateCompactMode(false);
  prepareEditor();

  openModal('folder-editor', {
    onAccept: handleSave,
    onCancel: handleCancel,
    initialFocus: nameInput
  });
}

function populateForm(value) {
  nameInput.maxLength = BOOKMARK_FOLDER_NAME_MAX_LENGTH;
  nameInput.value = value.name;
  noBackgroundInput.checked = value.noBackground;
  colorInput.value = value.backgroundColor;
  localColorInput.value = value.backgroundColor;
  outerBackgroundColor = value.outerBackgroundColor;
  outerColorInput.value = outerBackgroundColor || '#0f172a';
  showFolderInput.checked = value.showFolder;
  showPreviewsInput.checked = value.showPreviews;
  showNameInput.checked = value.showName;
  showCountInput.checked = value.showCount;
  imageSourceSelect.value = value.backgroundImageSource;
  setImageInputValue(imageInput, value.backgroundImageUrl);
  setImageInputValue(localImageInput, value.backgroundImageLocal);
  textColorInput.value = value.textColor;
  imageController.setLocked(value.backgroundImageUrlLocked);
}

function prepareEditor() {
  setLocalImageSyncNoticeVisibility(imageUploadNotice, getStorageMode());
  clearErrors();
  syncStyleControls();
  activateGeneralTab();
  renderPreview();
  syncSaveButton();
}

function handleInput() {
  clearErrors();
  syncStyleControls();
  renderPreview();
  syncSaveButton();
}

function currentValue() {
  return {
    name: nameInput.value,
    noBackground: noBackgroundInput.checked,
    backgroundColor: colorInput.value,
    outerBackgroundColor,
    showFolder: showFolderInput.checked,
    showPreviews: showFolderInput.checked && showPreviewsInput.checked,
    showName: showNameInput.checked,
    showCount: showCountInput.checked,
    backgroundImageUrl: getImageInputValue(imageInput) || null,
    backgroundImageLocal: getImageInputValue(localImageInput) || null,
    backgroundImageSource: imageSourceSelect.value,
    backgroundImageUrlLocked: imageController?.isLocked() ?? false,
    textColor: textColorInput.value
  };
}

function editableFolderValue(folder) {
  const validation = validateFolderDraft(folder);
  return validation.value;
}

function isDirty() {
  if (!initialValue) return false;
  const current = currentValue();
  return current.name !== initialValue.name
    || current.noBackground !== initialValue.noBackground
    || current.backgroundColor !== initialValue.backgroundColor
    || current.outerBackgroundColor !== initialValue.outerBackgroundColor
    || current.showFolder !== initialValue.showFolder
    || current.showPreviews !== initialValue.showPreviews
    || current.showName !== initialValue.showName
    || current.showCount !== initialValue.showCount
    || current.backgroundImageUrl !== initialValue.backgroundImageUrl
    || current.backgroundImageLocal !== initialValue.backgroundImageLocal
    || current.backgroundImageSource !== initialValue.backgroundImageSource
    || current.backgroundImageUrlLocked !== initialValue.backgroundImageUrlLocked
    || current.textColor !== initialValue.textColor;
}

function syncStyleControls() {
  const hasLocalImage = Boolean(getImageInputValue(localImageInput));
  const activeSource = hasLocalImage && imageSourceSelect.value !== 'url' ? 'local' : 'url';
  imageSourceSelect.value = activeSource;
  imageSourceField.classList.toggle('is-hidden', !hasLocalImage);
  imageUrlField.classList.toggle('is-hidden', hasLocalImage && activeSource === 'local');
  localImageField.classList.toggle('is-hidden', !hasLocalImage || activeSource === 'url');
  colorInput.disabled = noBackgroundInput.checked
    || activeSource !== 'url'
    || (imageController?.isLocked() ?? false);
  localColorInput.disabled = noBackgroundInput.checked || activeSource !== 'local';
  if (!showFolderInput.checked) showPreviewsInput.checked = false;
  showPreviewsInput.disabled = !showFolderInput.checked;
  outerColorResetButton.disabled = outerBackgroundColor === null;
}

function syncSaveButton() {
  if (mode === 'create') {
    const hasName = currentValue().name.trim().length > 0;
    saveButton.disabled = !hasName;
    saveButton.classList.toggle('is-disabled', !hasName);
    saveButton.classList.remove('is-hidden');
    return;
  }

  const changed = isDirty();
  saveButton.disabled = !changed;
  saveButton.classList.toggle('is-hidden', !changed);
  saveButton.classList.remove('is-disabled');
}

function renderPreview() {
  const folder = currentValue();
  const bookmarks = activeFolderId
    ? getState().data.bookmarks.filter(bookmark => bookmark.folderId === activeFolderId)
    : [];
  const count = bookmarks.length;
  const name = folder.name.trim() || t('folder.editor.previewName');
  const card = document.createElement('div');
  card.className = 'folder-editor-preview-card';
  card.setAttribute('role', 'img');
  card.setAttribute('aria-label', `${name}, ${t('folder.count', { count })}`);
  applyFolderAppearance(card, folder);
  card.append(createFolderVisual(folder, bookmarks));

  const caption = document.createElement('span');
  caption.className = 'folder-caption';
  const title = document.createElement('span');
  title.className = 'folder-title';
  title.textContent = name;
  const saved = document.createElement('span');
  saved.className = 'folder-count';
  saved.textContent = t('folder.count', { count });
  caption.append(title, saved);
  card.append(caption);
  preview.replaceChildren(card);
}

async function handleSave() {
  if (submitting) return;
  if (mode === 'create') {
    await handleCreate();
    return;
  }
  if (!activeFolderId || !isDirty()) return;
  const result = validateFolderDraft(currentValue());
  if (!result.isValid) {
    renderErrors(result.errors);
    return;
  }

  const updated = updateBookmarkFolder(activeFolderId, result.value);
  if (!updated) return;
  await waitForPersistence();

  flashSuccess('flash.folder.updated');
  closeFolderEditor();
}

async function handleCreate() {
  const result = validateFolderDraft(currentValue());
  if (!result.isValid) {
    renderErrors(result.errors);
    return;
  }

  submitting = true;
  try {
    const created = createBookmarkFolder(result.value.name, {
      columns: getMaxVisibleCols(),
      rows: getMaxVisibleRows()
    }, result.value);
    if (!created) {
      closeFolderEditor();
      await new Promise(requestAnimationFrame);
      await showAlert(t('folder.noSpace'), { type: 'info' });
      return;
    }

    await waitForPersistence();
    flashSuccess('flash.folder.created');
    closeFolderEditor();
  } finally {
    submitting = false;
    imageUploadInput.value = '';
  }
}

async function handleCancel() {
  if (isDirty()) {
    const confirmed = await showAlert(t(
      mode === 'create' ? 'alert.folder.createCancel' : 'alert.folder.cancel'
    ), { type: 'confirm' });
    if (!confirmed) return false;
  }
  closeFolderEditor();
  return true;
}

function renderErrors(errors) {
  clearErrors();
  if (errors.name) {
    nameInput.setAttribute('aria-invalid', 'true');
    nameError.textContent = t(`validation.folderName.${errors.name}`);
    nameError.classList.remove('is-hidden');
  }
  if (errors.backgroundImageUrl) {
    imageInput.setAttribute('aria-invalid', 'true');
    imageError.textContent = t(
      `validation.backgroundImageUrl.${errors.backgroundImageUrl}`
    );
    imageError.classList.remove('is-hidden');
  }
}

function clearErrors() {
  nameInput.removeAttribute('aria-invalid');
  imageInput.removeAttribute('aria-invalid');
  for (const error of [nameError, imageError]) {
    error.textContent = '';
    error.classList.add('is-hidden');
  }
}

function activateGeneralTab() {
  for (const button of modal.querySelectorAll('.edit-bookmark-modal-tab-btn')) {
    const active = button.dataset.tab === 'folder-editor-panel-general';
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  for (const panel of modal.querySelectorAll('.edit-bookmark-modal-tab-content')) {
    panel.classList.toggle('is-hidden', panel.id !== 'folder-editor-panel-general');
  }
}

function setCreateCompactMode(compact) {
  const isCreateMode = mode === 'create';
  const nextCompact = isCreateMode && compact;
  if (nextCompact) activateGeneralTab();

  modal.classList.toggle('is-add-compact', nextCompact);
  densityToggle.classList.toggle('is-hidden', !isCreateMode);
  densityToggle.setAttribute('aria-expanded', String(isCreateMode && !nextCompact));
  densityToggle.textContent = t(
    nextCompact ? 'addModal.advancedOptions' : 'addModal.compactView'
  );

  for (const element of modal.querySelectorAll(
    '.edit-bookmark-modal-tabs, .edit-bookmark-modal-preview-panel'
  )) {
    element.inert = nextCompact;
    if (nextCompact) element.setAttribute('aria-hidden', 'true');
    else element.removeAttribute('aria-hidden');
  }
}

function closeFolderEditor() {
  modal.classList.remove('is-add-compact');
  densityToggle.classList.add('is-hidden');
  mode = null;
  activeFolderId = null;
  initialValue = null;
  closeModal('folder-editor');
}
