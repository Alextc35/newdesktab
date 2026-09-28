import { DEFAULT_RECYCLE_BIN_STYLE } from '../../domain/recycle-bin/recycleBinDefaults.js';
import { t } from '../../platform/i18n/i18n.js';
import {
  normalizeRecycleBinStyle,
  validateRecycleBinStyle
} from '../../domain/recycle-bin/recycleBinModel.js';
import { updateRecycleBinAppearance } from './recycleBinActions.js';
import { getState, getStorageMode, waitForPersistence } from '../../state/appStore.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { flashSuccess } from '../../shared/ui/flash.js';
import {
  getImageInputValue,
  initLocalImageUpload,
  setImageInputValue,
  setLocalImageSyncNoticeVisibility
} from '../../shared/ui/localImageUpload.js';
import {
  applyRecycleBinAppearance,
  createRecycleBinGlyph
} from './recycleBinAppearance.js';
import { createLockableInputController } from '../../shared/ui/lockableInput.js';
import { closeModal, openModal, registerModal } from '../../shared/ui/modalManager.js';
import { initTabs } from '../../shared/ui/tabs.js';
import { ensurePanelFits } from '../../shared/ui/viewportMode.js';

let initialized = false;
let initialValue = null;
let modal;
let noBackgroundInput;
let backgroundColorInput;
let localColorInput;
let backgroundColorExplicit = false;
let imageInput;
let imageSourceField;
let imageSourceSelect;
let imageUrlField;
let localImageInput;
let localImageField;
let imageUploadInput;
let imageUploadButton;
let imageUploadNotice;
let imageError;
let imageController;
let iconColorInput;
let textColorInput;
let textColorExplicit = false;
let showIconInput;
let showNameInput;
let showCountInput;
let visibleInput;
let preview;
let saveButton;
let resetButton;
let tabs;

export function initRecycleBinEditorModal() {
  if (initialized) return;
  initialized = true;

  modal = document.getElementById('edit-recycle-bin-modal');
  noBackgroundInput = document.getElementById('recycle-bin-editor-no-background');
  backgroundColorInput = document.getElementById('recycle-bin-editor-background-color');
  localColorInput = document.getElementById('recycle-bin-editor-local-color');
  imageInput = document.getElementById('recycle-bin-editor-image');
  imageSourceField = document.getElementById('recycle-bin-editor-image-source-field');
  imageSourceSelect = document.getElementById('recycle-bin-editor-image-source');
  imageUrlField = document.getElementById('recycle-bin-editor-image-url-field');
  localImageInput = document.getElementById('recycle-bin-editor-image-local');
  localImageField = localImageInput.closest('.local-image-field');
  imageUploadInput = document.getElementById('recycle-bin-editor-image-upload-input');
  imageUploadButton = document.getElementById('recycle-bin-editor-image-upload');
  imageUploadNotice = imageUploadButton?.parentElement?.querySelector('.local-image-notice');
  imageError = document.getElementById('recycle-bin-editor-image-error');
  iconColorInput = document.getElementById('recycle-bin-editor-icon-color');
  textColorInput = document.getElementById('recycle-bin-editor-text-color');
  showIconInput = document.getElementById('recycle-bin-editor-show-icon');
  showNameInput = document.getElementById('recycle-bin-editor-show-name');
  showCountInput = document.getElementById('recycle-bin-editor-show-count');
  visibleInput = document.getElementById('recycle-bin-editor-visible');
  preview = document.getElementById('recycle-bin-editor-preview');
  saveButton = document.getElementById('edit-recycle-bin-modal-save');
  resetButton = document.getElementById('recycle-bin-editor-reset');

  tabs = initTabs({
    root: modal,
    tabButtonSelector: '.edit-bookmark-modal-tab-btn',
    tabContentSelector: '.edit-bookmark-modal-tab-content'
  });

  backgroundColorInput.addEventListener('input', () => {
    backgroundColorExplicit = true;
    localColorInput.value = backgroundColorInput.value;
    handleInput();
  });
  localColorInput.addEventListener('input', () => {
    backgroundColorExplicit = true;
    backgroundColorInput.value = localColorInput.value;
    handleInput();
  });
  iconColorInput.addEventListener('input', handleInput);
  textColorInput.addEventListener('input', () => {
    textColorExplicit = true;
    handleInput();
  });
  for (const input of [
    noBackgroundInput,
    showIconInput,
    showNameInput,
    showCountInput,
    visibleInput
  ]) {
    input.addEventListener('change', handleInput);
  }
  imageSourceSelect.addEventListener('change', handleInput);
  imageController = createLockableInputController({
    input: imageInput,
    toggleBtn: document.getElementById('recycle-bin-editor-image-toggle'),
    copyBtn: document.getElementById('recycle-bin-editor-image-copy'),
    clearBtn: document.getElementById('recycle-bin-editor-image-clear'),
    onChange: handleInput
  });
  initLocalImageUpload({
    button: imageUploadButton,
    fileInput: imageUploadInput,
    targetInput: localImageInput,
    clearButton: document.getElementById('recycle-bin-editor-image-local-clear'),
    onChange: () => {
      imageSourceSelect.value = getImageInputValue(localImageInput) ? 'local' : 'url';
      handleInput();
    }
  });
  resetButton.addEventListener('click', handleReset);
  document.getElementById('edit-recycle-bin-modal-cancel').addEventListener('click', handleCancel);
  saveButton.addEventListener('click', handleSave);

  registerModal({
    id: 'recycle-bin-editor',
    element: modal,
    requiresWideViewport: true,
    closeOnEsc: true,
    closeOnOverlay: true,
    acceptOnEnter: true
  });
}

export function openRecycleBinEditor() {
  if (!ensurePanelFits()) return;
  const { recycleBin, settings } = getState().data;
  const style = normalizeRecycleBinStyle(recycleBin);
  initialValue = { ...style, showRecycleBin: settings.showRecycleBin !== false };

  setControlValues(style, initialValue.showRecycleBin);
  setLocalImageSyncNoticeVisibility(imageUploadNotice, getStorageMode());
  clearErrors();
  tabs.activate('recycle-bin-editor-panel-general');
  syncControls();
  renderPreview();
  syncSaveButton();

  openModal('recycle-bin-editor', {
    onAccept: handleSave,
    onCancel: handleCancel,
    initialFocus: visibleInput
  });
}

function handleInput() {
  clearErrors();
  syncControls();
  renderPreview();
  syncSaveButton();
}

function currentValue() {
  return {
    noBackground: noBackgroundInput.checked,
    backgroundColor: backgroundColorExplicit ? backgroundColorInput.value : null,
    backgroundImageUrl: getImageInputValue(imageInput) || null,
    backgroundImageLocal: getImageInputValue(localImageInput) || null,
    backgroundImageSource: imageSourceSelect.value,
    backgroundImageUrlLocked: imageController?.isLocked() ?? false,
    iconColor: iconColorInput.value,
    textColor: textColorExplicit ? textColorInput.value : null,
    showIcon: showIconInput.checked,
    showName: showNameInput.checked,
    showCount: showCountInput.checked,
    showRecycleBin: visibleInput.checked
  };
}

function syncControls() {
  const hasLocalImage = Boolean(getImageInputValue(localImageInput));
  const activeSource = hasLocalImage && imageSourceSelect.value !== 'url' ? 'local' : 'url';
  imageSourceSelect.value = activeSource;
  imageSourceField.classList.toggle('is-hidden', !hasLocalImage);
  imageUrlField.classList.toggle('is-hidden', hasLocalImage && activeSource === 'local');
  localImageField.classList.toggle('is-hidden', !hasLocalImage || activeSource === 'url');
  backgroundColorInput.disabled = noBackgroundInput.checked
    || activeSource !== 'url'
    || (imageController?.isLocked() ?? false);
  localColorInput.disabled = noBackgroundInput.checked || activeSource !== 'local';
  resetButton.disabled = JSON.stringify(currentValue()) === JSON.stringify(defaultValue());
}

function setControlValues(style, showRecycleBin) {
  const value = normalizeRecycleBinStyle(style);
  backgroundColorExplicit = Boolean(value.backgroundColor);
  textColorExplicit = Boolean(value.textColor);
  noBackgroundInput.checked = value.noBackground;
  backgroundColorInput.value = value.backgroundColor || fallbackBackgroundColor();
  localColorInput.value = backgroundColorInput.value;
  imageSourceSelect.value = value.backgroundImageSource;
  setImageInputValue(imageInput, value.backgroundImageUrl);
  setImageInputValue(localImageInput, value.backgroundImageLocal);
  iconColorInput.value = value.iconColor;
  textColorInput.value = value.textColor || fallbackTextColor();
  showIconInput.checked = value.showIcon;
  showNameInput.checked = value.showName;
  showCountInput.checked = value.showCount;
  visibleInput.checked = showRecycleBin;
  imageController.setLocked(value.backgroundImageUrlLocked);
}

function defaultValue() {
  return {
    ...normalizeRecycleBinStyle(DEFAULT_RECYCLE_BIN_STYLE),
    showRecycleBin: true
  };
}

function fallbackBackgroundColor() {
  return usesDarkInterface() ? '#0f172a' : '#f8fafc';
}

function fallbackTextColor() {
  return usesDarkInterface() ? '#f8fafc' : '#273244';
}

function usesDarkInterface() {
  const interfaceTheme = document.documentElement.dataset.interfaceTheme;
  if (interfaceTheme === 'light') return false;
  if (interfaceTheme === 'dark') return true;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
}

function isDirty() {
  return initialValue !== null
    && JSON.stringify(currentValue()) !== JSON.stringify(initialValue);
}

function syncSaveButton() {
  const changed = isDirty();
  saveButton.disabled = !changed;
  saveButton.classList.toggle('is-hidden', !changed);
}

function renderPreview() {
  const value = currentValue();
  const countValue = getState().data.trash.length;
  const card = document.createElement('div');
  card.className = 'recycle-bin recycle-bin-editor-preview-card';
  applyRecycleBinAppearance(card, value);

  const content = document.createElement('div');
  content.className = 'recycle-bin-open';
  const caption = document.createElement('span');
  caption.className = 'recycle-bin-caption';
  const title = document.createElement('strong');
  title.textContent = t('recycleBin.title');
  const count = document.createElement('small');
  count.textContent = t(countValue === 1 ? 'recycleBin.countOne' : 'recycleBin.count', {
    count: countValue
  });
  caption.append(title, count);
  content.append(createRecycleBinGlyph(), caption);
  card.append(content);
  preview.replaceChildren(card);
}

async function handleSave() {
  if (!isDirty()) return;
  const draft = currentValue();
  const result = validateRecycleBinStyle(draft);
  if (!result.isValid) {
    renderErrors(result.errors);
    return;
  }

  saveButton.disabled = true;
  await updateRecycleBinAppearance({
    ...result.value,
    showRecycleBin: draft.showRecycleBin
  });
  await waitForPersistence();
  flashSuccess('flash.recycleBin.updated');
  closeRecycleBinEditor();
}

function handleReset() {
  setControlValues(DEFAULT_RECYCLE_BIN_STYLE, true);
  clearErrors();
  syncControls();
  renderPreview();
  syncSaveButton();
}

async function handleCancel() {
  if (isDirty()) {
    const confirmed = await showAlert(t('alert.recycleBin.cancel'), { type: 'confirm' });
    if (!confirmed) return false;
  }
  closeRecycleBinEditor();
  return true;
}

function closeRecycleBinEditor() {
  initialValue = null;
  closeModal('recycle-bin-editor');
}

function renderErrors(errors) {
  clearErrors();
  if (errors.backgroundImageUrl) {
    imageInput.setAttribute('aria-invalid', 'true');
    imageError.textContent = t(
      `validation.backgroundImageUrl.${errors.backgroundImageUrl}`
    );
    imageError.classList.remove('is-hidden');
  }
}

function clearErrors() {
  imageInput.removeAttribute('aria-invalid');
  imageError.textContent = '';
  imageError.classList.add('is-hidden');
}
