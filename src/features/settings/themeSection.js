import { showAlert } from '../../shared/ui/alertModal.js';
import { refreshCustomSelect } from '../../shared/ui/customSelect.js';
import { createLockableInputController } from '../../shared/ui/lockableInput.js';
import { t } from '../../platform/i18n/i18n.js';
import {
  openCustomColorPicker
} from '../../shared/ui/colorPicker.js';
import { DEFAULT_SETTINGS } from '../../domain/settings/settingsDefaults.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { getImageInputValue, setImageInputValue } from '../../shared/ui/localImageUpload.js';
import { inferWallpaperType, MAX_WALLPAPER_ITEMS, normalizeWallpaperInterval, normalizeWallpaperUrl } from '../../domain/settings/wallpaperMedia.js';
import { createWallpaperPreview } from './wallpaperPreview.js';
import { createWallpaperFiles } from './wallpaperFiles.js';
import { createWallpaperLibrary } from './wallpaperLibrary.js';
import { getState, getStorageMode } from '../../state/appStore.js';
import {
  getDraftTheme,
  getDraftStorageMode,
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
  const bgImageUrlField = document.getElementById('settings-theme-bg-image-url-field');
  const bgImageColorInput = document.getElementById('settings-theme-bg-image-color');
  const bgImageInput = document.getElementById('settings-theme-bg-image');
  const resetBgBtn = document.getElementById('settings-theme-reset-bg');
  const mediaDetails = document.getElementById('settings-theme-more-wallpapers');
  const wallpaperHint = document.getElementById('settings-theme-wallpaper-hint');
  const mediaUrl = document.getElementById('settings-theme-media-url');
  const mediaAdd = document.getElementById('settings-theme-media-add');
  const mediaUploadInput = document.getElementById('settings-theme-media-upload-input');
  const mediaUploadButton = document.getElementById('settings-theme-media-upload');
  const mediaInterval = document.getElementById('settings-theme-media-interval');

  /**
   * Lockable background-image controls.
   */
  const clearBgImageBtn = document.getElementById('settings-theme-clear-bg-image');
  const copyBgImageBtn = document.getElementById('settings-theme-copy-bg-image');
  const toggleBtn = document.getElementById('settings-theme-toggle-bg-image');
  const bgImagePreviewBtn = document.getElementById('settings-theme-bg-image-preview');
  const bgImagePeek = document.getElementById('settings-theme-bg-image-peek');
  const bgImageInputActions = bgImageInput.closest('.settings-theme-bg-image-input');

  /**
   * Theme background preview element.
   */
  const bgPreview = document.getElementById('settings-theme-bg-preview');
  const bgPreviewColorHint = document.getElementById('settings-theme-preview-color-hint');
  const preview = createWallpaperPreview({ bgPreview, getTheme: getDraftTheme, includeFallback: isSyncMode });
  const { update: updatePreview, pause: pausePreview, syncAspectRatio: syncPreviewAspectRatio } = preview;
  const localFiles = createWallpaperFiles({ getRetainedTheme: () => getState().data.settings.theme });
  const { cleanupLocalMedia, discardUploadedMedia } = localFiles;
  const library = createWallpaperLibrary({
    getTheme: getDraftTheme, setMedia, updatePreview, onRequestSaveStateUpdate,
    resetPreviewIndex: preview.resetIndex
  });
  const { render: renderMediaList, placePeek: placeWallpaperPeek } = library;

  /**
   * Controller used to manage the lockable background-image input.
   */
  let bgController;
  let additionalUploadPending = false;

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

  function primaryUrl(theme = getDraftTheme()) {
    return theme.backgroundPrimaryType === 'video'
      ? theme.backgroundVideo?.url : theme.backgroundImageUrl;
  }

  function isSyncMode() {
    return (getDraftStorageMode() ?? getStorageMode()) === 'sync';
  }

  function syncPrimaryInputs() {
    const url = primaryUrl();
    if (bgImageInput.value !== (url ?? '')) setImageInputValue(bgImageInput, url);
    bgController?.refresh();
  }

  function setPrimaryUrl(value) {
    const type = value ? inferWallpaperType(value) : 'image';
    setDraftThemeValue('backgroundPrimaryType', type);
    if (type === 'video') {
      setDraftThemeValue('backgroundVideo', { url: value || null, local: null, source: 'url' });
    } else {
      setDraftThemeValue('backgroundImageUrl', value || null);
    }
  }

  function syncIntervalSelect(value) {
    mediaInterval.querySelector('[data-custom-interval]')?.remove();
    const interval = normalizeWallpaperInterval(value);
    if (![...mediaInterval.options].some(option => Number(option.value) === interval)) {
      const option = document.createElement('option');
      option.value = String(interval);
      option.textContent = interval === 0 ? t('settingsModal.theme.noRotation')
        : interval < 60 ? `${interval} s`
        : interval < 3600 ? `${interval / 60} min` : `${interval / 3600} h`;
      option.dataset.customInterval = '';
      const nextOption = [...mediaInterval.options]
        .find(existing => Number(existing.value) > interval);
      mediaInterval.insertBefore(option, nextOption ?? null);
    }
    mediaInterval.value = String(interval);
    refreshCustomSelect(mediaInterval);
  }

  function setBackgroundMode(mode) {
    bgImageMode.checked = mode === 'image';
    bgSolid.checked = mode === 'solid';
    setDraftThemeValue('backgroundDefault', mode === 'default');
    setDraftThemeValue('backgroundSolid', mode === 'solid');
  }

  function setMedia(entries) {
    setDraftThemeValue('backgroundMedia', entries);
    renderMediaList();
    updatePreview();
    onRequestSaveStateUpdate();
  }

  function hideBackgroundImagePeek() {
    const video = bgImagePeek.querySelector('video');
    if (video) {
      video.pause();
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    }
    bgImagePeek.replaceChildren();
    bgImagePeek.style.backgroundImage = '';
    delete bgImagePeek.dataset.previewUrl;
    delete bgImagePeek.dataset.placement;
    bgImagePeek.hidden = true;
  }

  function showBackgroundImagePeek() {
    const url = primaryUrl();
    if (!hasImageValue(url)) return;
    if (!bgImagePeek.hidden && bgImagePeek.dataset.previewUrl === url) return;

    hideBackgroundImagePeek();
    bgImagePeek.dataset.previewUrl = url;
    const type = inferWallpaperType(url);
    const color = getDraftTheme().backgroundImageColor;
    bgImagePeek.style.backgroundColor = type === 'video' ? '#000000' : color;

    if (type === 'video') {
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.onloadeddata = () => {
        if (bgImagePeek.contains(video)) video.classList.add('is-ready');
      };
      video.onerror = () => {
        if (bgImagePeek.contains(video)) bgImagePeek.style.backgroundColor = color;
      };
      bgImagePeek.append(video);
      video.src = url;
      void video.play().catch(() => {});
    } else {
      bgImagePeek.style.backgroundImage = `url(${JSON.stringify(url)})`;
    }

    bgImagePeek.hidden = false;
    placeWallpaperPeek(bgImagePeek, bgImageInputActions);
  }

  /**
   * Updates visibility for background-image helper controls
   * depending on whether an image exists and whether the field is locked.
   */
  function updateColorState() {
    const draft = getDraftTheme();
    const hasImage = hasImageValue(primaryUrl(draft));
    const isLocked = bgController?.isLocked?.() ?? false;

    bgImageInputActions.classList.toggle('has-image-value', hasImage);
    bgImageInputActions.classList.toggle('is-url-locked', isLocked);
    bgImagePreviewBtn.style.display = hasImage ? 'grid' : 'none';
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
    const backgroundImage = bgImageMode.checked && !bgSolid.checked;
    const backgroundSolid = bgSolid.checked && !backgroundImage;
    const imagesDisabled = !backgroundImage;
    const syncMode = isSyncMode();

    syncPrimaryInputs();
    wallpaperHint.hidden = !syncMode;

    bgSolidColorField.classList.toggle('is-hidden', !backgroundSolid);
    bgColorInput.disabled = !backgroundSolid;
    bgPreview.classList.toggle('is-solid-color-trigger', backgroundSolid);
    bgPreviewColorHint.hidden = !backgroundSolid;
    if (backgroundSolid) {
      bgPreview.setAttribute('role', 'button');
      bgPreview.setAttribute('aria-label',
        `${t('settingsModal.theme.editSolidColor')}: ${bgColorInput.value.toUpperCase()}`);
      bgPreview.setAttribute('aria-haspopup', 'dialog');
      const pickerId = bgColorInput.getAttribute('aria-controls');
      if (pickerId) bgPreview.setAttribute('aria-controls', pickerId);
      bgPreview.tabIndex = 0;
    } else {
      bgPreview.removeAttribute('role');
      bgPreview.removeAttribute('aria-label');
      bgPreview.removeAttribute('aria-haspopup');
      bgPreview.removeAttribute('aria-controls');
      bgPreview.tabIndex = -1;
    }
    bgImageControls.classList.toggle('is-hidden', imagesDisabled);
    bgImageUrlField.classList.toggle('is-hidden', !syncMode);
    bgImageColorInput.disabled = imagesDisabled || !syncMode || (bgController?.isLocked() ?? false);
    bgImageInput.disabled = imagesDisabled || !syncMode;
    bgImagePreviewBtn.disabled = imagesDisabled || !syncMode;
    toggleBtn.disabled = imagesDisabled || !syncMode;
    clearBgImageBtn.disabled = imagesDisabled || !syncMode;
    copyBgImageBtn.disabled = imagesDisabled || !syncMode;
    mediaUrl.disabled = imagesDisabled || additionalUploadPending;
    mediaAdd.disabled = imagesDisabled || additionalUploadPending;
    mediaUploadInput.disabled = imagesDisabled || additionalUploadPending;
    mediaUploadButton.disabled = imagesDisabled || additionalUploadPending;
    mediaInterval.disabled = imagesDisabled;
    refreshCustomSelect(mediaInterval);

    if (imagesDisabled || !syncMode) hideBackgroundImagePeek();

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
    syncPreviewAspectRatio();

    bgImageMode.checked = !draft.backgroundDefault && !draft.backgroundSolid;
    bgSolid.checked = draft.backgroundSolid || false;
    bgColorInput.value = draft.backgroundColor;
    bgImageColorInput.value = draft.backgroundImageColor;
    syncPrimaryInputs();
    syncIntervalSelect(draft.backgroundRotationSeconds);
    mediaDetails.open = false;
    preview.resetIndex();
    renderMediaList();

    if (!bgController) {
      bgController = createLockableInputController({
        input: bgImageInput,
        toggleBtn,
        clearBtn: clearBgImageBtn,
        copyBtn: copyBgImageBtn,
        initialLocked: draft.backgroundImageUrlLocked || false,
        onChange: () => {
          setPrimaryUrl(getImageInputValue(bgImageInput));

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

    updateStates();
    updateColorState();
    updatePreview();
  }

  /* ==================================================
     Events
  ================================================== */

  bgImagePreviewBtn.addEventListener('mouseenter', showBackgroundImagePeek);
  bgImagePreviewBtn.addEventListener('mouseleave', hideBackgroundImagePeek);
  bgImagePreviewBtn.addEventListener('focus', showBackgroundImagePeek);
  bgImagePreviewBtn.addEventListener('blur', hideBackgroundImagePeek);

  /**
   * Updates the draft background color on input
   * and refreshes preview/save-state indicators.
   */
  bgColorInput.addEventListener('input', () => {
    if (bgColorInput.disabled) return;

    setDraftThemeValue('backgroundColor', bgColorInput.value);
    bgPreview.setAttribute('aria-label',
      `${t('settingsModal.theme.editSolidColor')}: ${bgColorInput.value.toUpperCase()}`);

    updatePreview();
    onRequestSaveStateUpdate();
  });

  function openSolidColorPicker() {
    if (bgColorInput.disabled) return;
    openCustomColorPicker(bgColorInput, {
      anchor: bgPreview,
      returnFocusTo: bgPreview,
      onOpen: () => { bgPreviewColorHint.hidden = true; },
      onClose: () => { bgPreviewColorHint.hidden = bgColorInput.disabled; }
    });
  }

  bgPreview.addEventListener('click', openSolidColorPicker);
  bgPreview.addEventListener('keydown', event => {
    if (bgColorInput.disabled || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openSolidColorPicker();
  });

  /**
   * Selects or clears image mode. Clearing it returns to the default theme.
   */
  bgImageMode.addEventListener('change', () => {
    setBackgroundMode(bgImageMode.checked ? 'image' : 'default');
    updateStates();
    onRequestSaveStateUpdate();
  });

  bgImageColorInput.addEventListener('input', () => {
    if (bgImageColorInput.disabled) return;
    setDraftThemeValue('backgroundImageColor', bgImageColorInput.value);
    updatePreview();
    onRequestSaveStateUpdate();
  });

  bgSolid.addEventListener('change', () => {
    setBackgroundMode(bgSolid.checked ? 'solid' : 'default');
    updateStates();
    onRequestSaveStateUpdate();
  });

  mediaAdd.addEventListener('click', () => {
    const type = inferWallpaperType(mediaUrl.value);
    const url = normalizeWallpaperUrl(mediaUrl.value, type);
    if (!url) {
      flashError('flash.settings.invalidWallpaperUrl');
      return;
    }
    const entries = getDraftTheme().backgroundMedia ?? [];
    if (entries.length >= MAX_WALLPAPER_ITEMS) {
      flashError('flash.settings.wallpaperLimit');
      return;
    }
    const item = type === 'video'
      ? { id: crypto.randomUUID(), type: 'video', url, local: null, source: 'url' }
      : { id: crypto.randomUUID(), type: 'image', backgroundImageUrl: url,
        backgroundImageLocal: null, backgroundImageSource: 'url' };
    setMedia([...entries, item]);
    mediaUrl.value = '';
  });

  mediaUploadButton.addEventListener('click', () => mediaUploadInput.click());
  mediaUploadInput.addEventListener('change', async () => {
    const files = [...(mediaUploadInput.files ?? [])];
    mediaUploadInput.value = '';
    if (!files.length || additionalUploadPending) return;
    const draftAtStart = getDraftTheme();
    if (!draftAtStart) return;
    if ((draftAtStart.backgroundMedia?.length ?? 0) + files.length > MAX_WALLPAPER_ITEMS) {
      flashError('flash.settings.wallpaperLimit');
      return;
    }

    const created = [];
    const saveButton = document.getElementById('settings-modal-save');
    additionalUploadPending = true;
    saveButton.disabled = true;
    updateStates();
    try {
      for (const file of files) {
        created.push(await localFiles.save(file));
        if (getDraftTheme() !== draftAtStart) return;
      }
      const current = getDraftTheme().backgroundMedia ?? [];
      if (current.length + created.length > MAX_WALLPAPER_ITEMS) {
        flashError('flash.settings.wallpaperLimit');
        return;
      }
      const items = created.map(({ type, reference }) => type === 'video'
        ? { id: crypto.randomUUID(), type, url: null, local: reference, source: 'local' }
        : { id: crypto.randomUUID(), type, backgroundImageUrl: null,
          backgroundImageLocal: reference, backgroundImageSource: 'local' });
      setMedia([...current, ...items]);
      localFiles.retain(created);
      created.length = 0;
    } catch (error) {
      console.error('[THEME] Could not add local wallpapers:', error);
      flashError('flash.settings.invalidWallpaperFile');
    } finally {
      additionalUploadPending = false;
      await localFiles.discardCreated(created);
      if (getDraftTheme() === draftAtStart) updateStates();
      onRequestSaveStateUpdate();
    }
  });

  mediaUrl.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      mediaAdd.click();
    }
  });

  mediaInterval.addEventListener('change', () => {
    setDraftThemeValue('backgroundRotationSeconds', Number(mediaInterval.value));
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
    bgImageColorInput.value = draft.backgroundImageColor;
    syncPrimaryInputs();
    syncIntervalSelect(draft.backgroundRotationSeconds);
    preview.resetIndex();
    renderMediaList();

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
    syncUI,
    cleanupLocalMedia,
    discardUploadedMedia,
    isUploading: () => additionalUploadPending,
    pausePreview
  };
}
