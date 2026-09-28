import {
  getLocalImageName,
  saveLocalImage
} from '../../platform/images/localImages.js';
import { isLocalImageReference } from '../images/backgroundImage.js';
import { t } from '../../platform/i18n/i18n.js';
import { flashError } from './flash.js';

const LOCAL_IMAGE_REFERENCE_DATASET_KEY = 'localImageReference';

function hasLocalImageReference(input) {
  return Boolean(input?.dataset[LOCAL_IMAGE_REFERENCE_DATASET_KEY]);
}

function emitImageInput(input) {
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function clearLocalImageInput(input) {
  setImageInputValue(input, '');
  emitImageInput(input);
}

function selectWholeLocalImageInput(input) {
  input.setSelectionRange(0, input.value.length);
}

/**
 * Returns the persisted image value represented by an image input. A local
 * upload shows its filename to the person editing it, while its reference is
 * kept separately and persisted only on this device.
 *
 * @param {HTMLInputElement|null} input
 * @returns {string}
 */
export function getImageInputValue(input) {
  if (!input) return '';
  return input.dataset[LOCAL_IMAGE_REFERENCE_DATASET_KEY] ?? input.value.trim();
}

/**
 * Displays a saved image value in an image input. Local uploads use their
 * original filename instead of exposing the internal storage reference.
 *
 * @param {HTMLInputElement|null} input
 * @param {string|null|undefined} value
 */
export function setImageInputValue(input, value) {
  if (!input) return;

  input.closest('.local-image-field')?.classList.toggle('is-hidden', !isLocalImageReference(value));

  if (isLocalImageReference(value)) {
    input.dataset[LOCAL_IMAGE_REFERENCE_DATASET_KEY] = value;
    input.value = getLocalImageName(value) ?? t('localImage.unnamed');
    return;
  }

  delete input.dataset[LOCAL_IMAGE_REFERENCE_DATASET_KEY];
  input.value = value ?? '';
}

/**
 * Shows the local-image synchronization notice only when settings are stored
 * through Chrome Sync. Local images remain device-only in either mode, but
 * the warning is only relevant when the rest of the data is synchronized.
 *
 * @param {HTMLElement|null} notice
 * @param {'local'|'sync'|null|undefined} storageMode
 */
export function setLocalImageSyncNoticeVisibility(notice, storageMode) {
  notice?.classList.toggle('is-hidden', storageMode !== 'sync');
}

/**
 * Connects uploads to a separate, atomic filename field. The URL fallback is
 * never changed by uploading or removing a local file.
 *
 * @param {Object} options
 * @param {HTMLButtonElement|null} options.button
 * @param {HTMLInputElement|null} options.fileInput
 * @param {HTMLInputElement|null} options.targetInput
 * @param {HTMLButtonElement|null} options.clearButton
 * @param {AbortSignal} [options.signal]
 * @param {() => void} [options.onChange]
 * @returns {void}
 */
export function initLocalImageUpload({
  button,
  fileInput,
  targetInput,
  clearButton,
  signal,
  onChange
}) {
  if (!button || !fileInput || !targetInput) return;

  targetInput.readOnly = true;
  const clear = () => {
    if (targetInput.disabled) return;
    clearLocalImageInput(targetInput);
    button.focus({ preventScroll: true });
  };
  clearButton?.addEventListener('click', clear, { signal });
  targetInput.addEventListener('input', () => onChange?.(), { signal });
  for (const type of ['copy', 'cut', 'paste', 'beforeinput', 'drop']) {
    targetInput.addEventListener(type, event => event.preventDefault(), { signal });
  }
  button.addEventListener('click', () => fileInput.click(), { signal });
  targetInput.addEventListener('focus', () => {
    if (hasLocalImageReference(targetInput)) {
      selectWholeLocalImageInput(targetInput);
    }
  }, { signal });
  targetInput.addEventListener('pointerdown', event => {
    if (!hasLocalImageReference(targetInput)) return;

    event.preventDefault();
    targetInput.focus({ preventScroll: true });
    selectWholeLocalImageInput(targetInput);
  }, { signal });
  targetInput.addEventListener('keydown', event => {
    if (!hasLocalImageReference(targetInput)) return;
    if (['Backspace', 'Delete'].includes(event.key)) {
      event.preventDefault();
      clear();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    selectWholeLocalImageInput(targetInput);
  }, { signal });
  targetInput.addEventListener('select', () => {
    if (!hasLocalImageReference(targetInput)) return;
    if (targetInput.selectionStart === 0 && targetInput.selectionEnd === targetInput.value.length) {
      return;
    }
    selectWholeLocalImageInput(targetInput);
  }, { signal });
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files ?? [];
    fileInput.value = '';
    if (!file) return;

    const initiallyDisabled = button.disabled;
    button.disabled = true;
    try {
      const reference = await saveLocalImage(file);
      if (signal?.aborted) return;
      setImageInputValue(targetInput, reference);
      emitImageInput(targetInput);
    } catch (error) {
      console.error('[LOCAL_IMAGE] Upload failed:', error);
      flashError(getUploadErrorMessage(error));
    } finally {
      button.disabled = initiallyDisabled;
    }
  }, { signal });
}

function getUploadErrorMessage(error) {
  switch (error?.code) {
    case 'LOCAL_IMAGE_INVALID': return 'flash.localImage.invalid';
    case 'LOCAL_IMAGE_TOO_LARGE': return 'flash.localImage.tooLarge';
    case 'LOCAL_IMAGE_STORAGEFULL': return 'flash.localImage.storageFull';
    default: return 'flash.localImage.processing';
  }
}
