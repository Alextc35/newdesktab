import { showAlert } from '../../shared/ui/alertModal.js';
import { createLockableInputController } from '../../shared/ui/lockableInput.js';
import { t } from '../../platform/i18n/i18n.js';
import { DEFAULT_SETTINGS } from '../../domain/settings/settingsDefaults.js';
import { flashSuccess } from '../../shared/ui/flash.js';
import {
  getImageInputValue,
  initLocalImageUpload,
  setLocalImageSyncNoticeVisibility,
  setImageInputValue
} from '../../shared/ui/localImageUpload.js';
import { resolveBackgroundImage } from '../../platform/images/localImages.js';
import { getStorageMode } from '../../state/appStore.js';
import {
  getDraftStorageMode,
  getDraftTheme,
  setDraftThemeValue,
  replaceDraftTheme
} from './settingsDraft.js';

/**
 * Initializes the theme section inside the settings modal.
 *
 * This section is responsible for:
 * - syncing draft theme values into the UI
 * - managing background color / image / default background state
 * - handling live preview updates
 * - resetting theme background settings
 *
 * @param {Object} params
 * @param {Function} params.onRequestSaveStateUpdate - Callback used to refresh save-state indicators.
 * @returns {{ syncUI: Function }}
 */
export function initThemeSection({
  onRequestSaveStateUpdate
}) {
  /* ==================================================
     DOM
  ================================================== */

  /**
   * Background mode and appearance controls.
   */
  const bgImageMode = document.getElementById('settings-theme-bg-image-mode');
  const bgSolid = document.getElementById('settings-theme-bg-solid');
  const bgSolidColorField = document.getElementById('settings-theme-bg-solid-color-field');
  const bgColorInput = document.getElementById('settings-theme-bg-color');
  const bgImageControls = document.getElementById('settings-theme-bg-image-controls');
  const bgImageSourceField = document.getElementById('settings-theme-bg-image-source-field');
  const bgImageSourceSelect = document.getElementById('settings-theme-bg-image-source');
  const bgImageUrlField = document.getElementById('settings-theme-bg-image-url-field');
  const bgImageColorInput = document.getElementById('settings-theme-bg-image-color');
  const bgImageInput = document.getElementById('settings-theme-bg-image');
  const bgLocalColorInput = document.getElementById('settings-theme-bg-local-color');
  const bgLocalInput = document.getElementById('settings-theme-bg-local');
  const bgLocalField = bgLocalInput.closest('.local-image-field');
  const clearBgLocalBtn = document.getElementById('settings-theme-clear-bg-local');
  const bgImageUploadInput = document.getElementById('settings-theme-bg-upload-input');
  const bgImageUploadButton = document.getElementById('settings-theme-bg-upload');
  const bgImageUploadNotice = bgImageUploadButton?.parentElement?.querySelector('.local-image-notice');
  const resetBgBtn = document.getElementById('settings-theme-reset-bg');

  /**
   * Lockable background-image controls.
   */
  const clearBgImageBtn = document.getElementById('settings-theme-clear-bg-image');
  const copyBgImageBtn = document.getElementById('settings-theme-copy-bg-image');
  const toggleBtn = document.getElementById('settings-theme-toggle-bg-image');

  /**
   * Theme background preview element.
   */
  const bgPreview = document.getElementById('settings-theme-bg-preview');

  /**
   * Controller used to manage the lockable background-image input.
   */
  let bgController;
  let localImageUploadInitialized = false;

  /* ==================================================
     Internal helpers
  ================================================== */

  /**
   * Returns whether the provided value contains a non-empty image string.
   *
   * @param {string|null|undefined} value
   * @returns {boolean}
   */
  function hasImageValue(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function syncImageColorInputs(value) {
    bgImageColorInput.value = value;
    bgLocalColorInput.value = value;
  }

  function setBackgroundMode(mode) {
    bgImageMode.checked = mode === 'image';
    bgSolid.checked = mode === 'solid';
    setDraftThemeValue('backgroundDefault', mode === 'default');
    setDraftThemeValue('backgroundSolid', mode === 'solid');
  }

  /**
   * Updates the theme background preview based on the current draft state.
   *
   * Behavior:
   * - clears previous inline styles
   * - shows the default wallpaper when neither custom mode is selected
   * - otherwise applies the selected background color and optional image
   */
  function updatePreview() {
    const draft = getDraftTheme();

    bgPreview.style.backgroundColor = '';
    bgPreview.style.backgroundImage = '';
    bgPreview.classList.toggle('is-default-bg', draft.backgroundDefault);

    if (draft.backgroundDefault) {
      return;
    }

    bgPreview.style.backgroundColor = draft.backgroundSolid
      ? draft.backgroundColor
      : draft.backgroundImageColor;

    const backgroundImage = draft.backgroundSolid ? null : resolveBackgroundImage(draft);
    if (backgroundImage) {
      bgPreview.style.backgroundImage = `url(${backgroundImage})`;
    }
  }

  /**
   * Updates visibility for background-image helper controls
   * depending on whether an image exists and whether the field is locked.
   */
  function updateColorState() {
    const draft = getDraftTheme();
    const hasImage = hasImageValue(draft.backgroundImageUrl);
    const isLocked = bgController?.isLocked?.() ?? false;

    clearBgImageBtn.style.display = hasImage && !isLocked ? 'block' : 'none';
    copyBgImageBtn.style.display = hasImage ? 'block' : 'none';
    toggleBtn.style.display = hasImage ? 'block' : 'none';
  }

  /**
   * Updates enabled/disabled states across theme controls
   * according to the current draft values.
   *
   * Rules:
   * - the default and solid backgrounds preserve saved custom images
   * - the color picker stays available as the image's transparent base layer
   * - image controls are visible only while image mode is selected
   * - solid color mode preserves configured images without displaying them
   * - preview is refreshed after state updates
   */
  function updateStates() {
    const draft = getDraftTheme();
    const backgroundImage = bgImageMode.checked && !bgSolid.checked;
    const backgroundSolid = bgSolid.checked && !backgroundImage;
    const imagesDisabled = !backgroundImage;
    const hasLocalImage = hasImageValue(draft.backgroundImageLocal);
    const activeSource = hasLocalImage && draft.backgroundImageSource !== 'url'
      ? 'local'
      : 'url';

    bgSolidColorField.classList.toggle('is-hidden', !backgroundSolid);
    bgColorInput.disabled = !backgroundSolid;
    bgImageControls.classList.toggle('is-hidden', imagesDisabled);
    bgImageSourceField.classList.toggle('is-hidden', !hasLocalImage);
    bgImageSourceSelect.value = activeSource;
    bgImageSourceSelect.disabled = imagesDisabled;
    bgImageUrlField.classList.toggle('is-hidden', hasLocalImage && activeSource === 'local');
    bgLocalField.classList.toggle('is-hidden', !hasLocalImage || activeSource === 'url');
    bgImageColorInput.disabled = imagesDisabled || activeSource !== 'url'
      || (bgController?.isLocked() ?? false);
    bgLocalColorInput.disabled = imagesDisabled || activeSource !== 'local';
    bgImageInput.disabled = imagesDisabled;
    bgLocalInput.disabled = imagesDisabled;
    clearBgLocalBtn.disabled = imagesDisabled;
    bgImageUploadButton.disabled = imagesDisabled;
    toggleBtn.disabled = imagesDisabled;
    clearBgImageBtn.disabled = imagesDisabled;
    copyBgImageBtn.disabled = imagesDisabled;

    updatePreview();
  }

  /* ==================================================
     Public sync (called from modal open)
  ================================================== */

  /**
   * Synchronizes the current draft theme state into the UI.
   *
   * This also initializes the lockable background-image controller
   * the first time the section is synced.
   */
  function syncUI() {
    const draft = getDraftTheme();

    setLocalImageSyncNoticeVisibility(
      bgImageUploadNotice,
      getDraftStorageMode() ?? getStorageMode()
    );

    bgImageMode.checked = !draft.backgroundDefault && !draft.backgroundSolid;
    bgSolid.checked = draft.backgroundSolid || false;
    bgColorInput.value = draft.backgroundColor;
    syncImageColorInputs(draft.backgroundImageColor);
    bgImageSourceSelect.value = draft.backgroundImageSource;
    setImageInputValue(bgImageInput, draft.backgroundImageUrl);
    setImageInputValue(bgLocalInput, draft.backgroundImageLocal);

    if (!bgController) {
      bgController = createLockableInputController({
        input: bgImageInput,
        toggleBtn,
        clearBtn: clearBgImageBtn,
        copyBtn: copyBgImageBtn,
        initialLocked: draft.backgroundImageUrlLocked || false,
        onChange: () => {
          setDraftThemeValue(
            'backgroundImageUrl',
            getImageInputValue(bgImageInput) || null
          );

          setDraftThemeValue(
            'backgroundImageUrlLocked',
            bgController?.isLocked() ?? false
          );

          updateStates();
          updateColorState();
          updatePreview();
          onRequestSaveStateUpdate();
        }
      });
    } else {
      bgController.setLocked(draft.backgroundImageUrlLocked || false);
    }

    if (!localImageUploadInitialized) {
      localImageUploadInitialized = true;
      initLocalImageUpload({
        button: bgImageUploadButton,
        fileInput: bgImageUploadInput,
        targetInput: bgLocalInput,
        clearButton: clearBgLocalBtn,
        onChange: () => {
          const backgroundImageLocal = getImageInputValue(bgLocalInput) || null;
          setDraftThemeValue('backgroundImageLocal', backgroundImageLocal);
          setDraftThemeValue('backgroundImageSource', backgroundImageLocal ? 'local' : 'url');
          updateStates();
          onRequestSaveStateUpdate();
        }
      });
    }

    updateStates();
    updateColorState();
    updatePreview();
  }

  /* ==================================================
     Events
  ================================================== */

  /**
   * Updates the draft background color on input
   * and refreshes preview/save-state indicators.
   */
  bgColorInput.addEventListener('input', () => {
    if (bgColorInput.disabled) return;

    setDraftThemeValue('backgroundColor', bgColorInput.value);

    updatePreview();
    onRequestSaveStateUpdate();
  });

  /**
   * Selects or clears image mode. Clearing it returns to the default theme.
   */
  bgImageMode.addEventListener('change', () => {
    setBackgroundMode(bgImageMode.checked ? 'image' : 'default');
    updateStates();
    onRequestSaveStateUpdate();
  });

  for (const input of [bgImageColorInput, bgLocalColorInput]) {
    input.addEventListener('input', () => {
      if (input.disabled) return;

      syncImageColorInputs(input.value);
      setDraftThemeValue('backgroundImageColor', input.value);

      updatePreview();
      onRequestSaveStateUpdate();
    });
  }

  bgImageSourceSelect.addEventListener('change', () => {
    setDraftThemeValue('backgroundImageSource', bgImageSourceSelect.value);
    updateStates();
    onRequestSaveStateUpdate();
  });

  bgSolid.addEventListener('change', () => {
    setBackgroundMode(bgSolid.checked ? 'solid' : 'default');
    updateStates();
    onRequestSaveStateUpdate();
  });

  /**
   * Resets theme background settings to defaults after confirmation.
   *
   * This also unlocks the background image field and refreshes
   * the full section UI and preview.
   */
  resetBgBtn.addEventListener('click', async () => {
    const ok = await showAlert(
      t('alert.settings.theme.reset'),
      { type: 'confirm' }
    );

    if (!ok) return;

    replaceDraftTheme(DEFAULT_SETTINGS.theme);

    const draft = getDraftTheme();

    bgImageMode.checked = !draft.backgroundDefault && !draft.backgroundSolid;
    bgSolid.checked = draft.backgroundSolid;
    bgColorInput.value = draft.backgroundColor;
    syncImageColorInputs(draft.backgroundImageColor);
    bgImageSourceSelect.value = draft.backgroundImageSource;
    setImageInputValue(bgImageInput, draft.backgroundImageUrl);
    setImageInputValue(bgLocalInput, draft.backgroundImageLocal);

    setDraftThemeValue('backgroundImageUrlLocked', false);

    if (bgController) {
      bgController.setLocked(false);
    }

    updateStates();
    updateColorState();
    updatePreview();
    onRequestSaveStateUpdate();
    flashSuccess('flash.settings.resetBg');
  });

  /* ==================================================
     API
  ================================================== */

  /**
   * Public API for the theme settings section.
   */
  return {
    syncUI
  };
}
