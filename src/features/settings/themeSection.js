import { showAlert } from '../../shared/ui/alertModal.js';
import { createLockableInputController } from '../../shared/ui/lockableInput.js';
import { t } from '../../platform/i18n/i18n.js';
import { DEFAULT_SETTINGS } from '../../domain/settings/settingsDefaults.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { getImageInputValue, setImageInputValue } from '../../shared/ui/localImageUpload.js';
import { deleteLocalImage, getLocalImageName, saveLocalImage } from '../../platform/images/localImages.js';
import { deleteLocalVideo, getLocalVideoName, saveLocalVideo } from '../../platform/images/localVideos.js';
import { inferWallpaperType, MAX_WALLPAPER_ITEMS, normalizeWallpaperInterval, normalizeWallpaperUrl } from '../../domain/settings/wallpaperMedia.js';
import { resolveThemeWallpapers, resolveWallpaperItem } from '../../shared/ui/pageTheme.js';
import { getStorageMode } from '../../state/appStore.js';
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
  const mediaList = document.getElementById('settings-theme-media-list');
  const mediaDetails = document.getElementById('settings-theme-more-wallpapers');
  const mediaUrl = document.getElementById('settings-theme-media-url');
  const mediaAdd = document.getElementById('settings-theme-media-add');
  const mediaUploadInput = document.getElementById('settings-theme-media-upload-input');
  const mediaUploadButton = document.getElementById('settings-theme-media-upload');
  const mediaInterval = document.getElementById('settings-theme-media-interval');
  const previewVideo = document.getElementById('settings-theme-preview-video');
  const previewNavigation = document.getElementById('settings-theme-preview-navigation');
  const previewCount = document.getElementById('settings-theme-preview-count');
  const previewPrevious = document.getElementById('settings-theme-preview-prev');
  const previewNext = document.getElementById('settings-theme-preview-next');
  let previewIndex = 0;
  const uploadedVideos = new Set();
  const uploadedImages = new Set();

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
  const themeTab = bgPreview.closest('#settings-modal-tab-theme');

  function syncPreviewAspectRatio() {
    const viewport = document.getElementById('bookmark-viewport')?.getBoundingClientRect();
    if (!viewport?.width || !viewport?.height) return;
    themeTab.style.setProperty('--theme-wallpaper-preview-ratio',
      String(viewport.width / viewport.height));
  }

  window.addEventListener('resize', syncPreviewAspectRatio);

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

  async function cleanupLocalMedia(previousTheme, savedTheme) {
    const previous = [previousTheme?.backgroundVideo?.local, ...(previousTheme?.backgroundMedia ?? [])
      .filter(item => item.type === 'video').map(item => item.local)];
    const retained = new Set([savedTheme?.backgroundVideo?.local, ...(savedTheme?.backgroundMedia ?? [])
      .filter(item => item.type === 'video').map(item => item.local)]);
    const unused = new Set([...previous, ...uploadedVideos].filter(ref => ref && !retained.has(ref)));
    await Promise.all([...unused].map(deleteLocalVideo));
    uploadedVideos.clear();
    const retainedImages = new Set([savedTheme?.backgroundImageLocal,
      ...(savedTheme?.backgroundMedia ?? []).map(item => item.backgroundImageLocal)]);
    await Promise.all([...uploadedImages]
      .filter(ref => !retainedImages.has(ref)).map(deleteLocalImage));
    uploadedImages.clear();
  }

  async function discardUploadedMedia() {
    await Promise.all([...uploadedVideos].map(deleteLocalVideo));
    await Promise.all([...uploadedImages].map(deleteLocalImage));
    uploadedVideos.clear();
    uploadedImages.clear();
  }

  function mediaLabel(item) {
    if (item.type === 'video') {
      return getLocalVideoName(item.local) ?? item.url ?? t('settingsModal.theme.unavailableLocal');
    }
    return getLocalImageName(item.backgroundImageLocal)
      ?? item.backgroundImageUrl ?? t('settingsModal.theme.unavailableLocal');
  }

  function renderMediaList() {
    mediaList.querySelectorAll('video').forEach(video => video.pause());
    mediaList.replaceChildren();
    const entries = getDraftTheme().backgroundMedia ?? [];
    entries.forEach((item, index) => {
      const updateItem = changes => {
        const next = [...(getDraftTheme().backgroundMedia ?? [])];
        const position = next.findIndex(entry => entry.id === item.id);
        if (position < 0) return;
        next[position] = { ...next[position], ...changes };
        setMedia(next);
      };
      const row = document.createElement('div');
      row.className = 'theme-wallpaper-row';
      const label = document.createElement('span');
      label.className = 'theme-wallpaper-label';
      label.textContent = `${item.type === 'video' ? t('settingsModal.theme.video') : t('settingsModal.theme.image')} · ${mediaLabel(item)}`;
      label.title = mediaLabel(item);
      row.append(label);
      const localReference = item.type === 'video' ? item.local : item.backgroundImageLocal;
      const remoteUrl = item.type === 'video' ? item.url : item.backgroundImageUrl;
      if (localReference && remoteUrl) {
        const source = document.createElement('select');
        source.className = 'theme-wallpaper-source';
        source.setAttribute('aria-label', t('settingsModal.theme.activeSource'));
        for (const [value, text] of [
          ['local', t('localImage.sourceLocal')], ['url', t('localImage.sourceUrl')]
        ]) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          source.append(option);
        }
        source.value = item.type === 'video' ? item.source : item.backgroundImageSource;
        source.addEventListener('change', () => {
          updateItem({ [item.type === 'video' ? 'source' : 'backgroundImageSource']: source.value });
        });
        row.append(source);
      }
      const color = document.createElement('input');
      color.type = 'color';
      color.className = 'theme-wallpaper-color';
      color.value = item.backgroundColor ?? getDraftTheme().backgroundImageColor;
      color.setAttribute('aria-label', t('settingsModal.theme.mediaColor'));
      color.addEventListener('input', () => {
        const next = [...(getDraftTheme().backgroundMedia ?? [])];
        const position = next.findIndex(entry => entry.id === item.id);
        if (position < 0) return;
        next[position] = { ...next[position], backgroundColor: color.value };
        setDraftThemeValue('backgroundMedia', next);
        updatePreview();
        onRequestSaveStateUpdate();
      });
      row.prepend(color);

      const peekButton = document.createElement('button');
      peekButton.type = 'button';
      peekButton.className = 'theme-wallpaper-preview-trigger';
      peekButton.setAttribute('aria-label', t('settingsModal.theme.mediaPreview'));
      const peek = document.createElement('div');
      peek.className = 'theme-wallpaper-peek';
      peek.hidden = true;
      function showPeek() {
        const current = (getDraftTheme().backgroundMedia ?? []).find(entry => entry.id === item.id) ?? item;
        const source = resolveWallpaperItem(current);
        peek.replaceChildren();
        peek.style.backgroundImage = '';
        peek.style.backgroundColor = current.backgroundColor ?? getDraftTheme().backgroundImageColor;
        if (source?.url) {
          if (source.type === 'video') {
            const media = document.createElement('video');
            media.src = source.url;
            media.muted = true;
            media.loop = true;
            media.playsInline = true;
            peek.append(media);
            void media.play().catch(() => {});
          } else {
            peek.style.backgroundImage = `url(${JSON.stringify(source.url)})`;
          }
        } else {
          peek.textContent = t('settingsModal.theme.unavailableLocal');
        }
        peek.hidden = false;
      }
      function hidePeek() {
        peek.querySelector('video')?.pause();
        peek.replaceChildren();
        peek.style.backgroundImage = '';
        peek.hidden = true;
      }
      peekButton.addEventListener('mouseenter', showPeek);
      peekButton.addEventListener('mouseleave', hidePeek);
      peekButton.addEventListener('focus', showPeek);
      peekButton.addEventListener('blur', hidePeek);
      row.append(peekButton, peek);
      for (const [symbol, key, offset] of [
        ['↑', 'moveUp', -1], ['↓', 'moveDown', 1], ['×', 'remove', 0]
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-wallpaper-row-action';
        button.textContent = symbol;
        button.setAttribute('aria-label', t(`settingsModal.theme.${key}`));
        button.disabled = offset !== 0 && (index + offset < 0 || index + offset >= entries.length);
        button.addEventListener('click', () => {
          const next = [...(getDraftTheme().backgroundMedia ?? [])];
          const position = next.findIndex(entry => entry.id === item.id);
          if (position < 0) return;
          if (offset === 0) next.splice(position, 1);
          else [next[position], next[position + offset]] = [next[position + offset], next[position]];
          previewIndex = 0;
          setMedia(next);
        });
        row.append(button);
      }
      mediaList.append(row);
    });
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
    const sources = draft.backgroundDefault || draft.backgroundSolid
      ? [] : resolveThemeWallpapers(draft, { includeFallback: isSyncMode() });
    previewNavigation.classList.toggle('is-hidden', sources.length < 2);
    previewIndex = sources.length ? previewIndex % sources.length : 0;
    previewCount.textContent = sources.length ? `${previewIndex + 1} / ${sources.length}` : '';
    const source = sources[previewIndex];
    if (source?.type === 'video') {
      if (previewVideo.getAttribute('src') !== source.url) previewVideo.src = source.url;
      previewVideo.hidden = false;
      void previewVideo.play().catch(() => {});
    } else {
      previewVideo.pause();
      previewVideo.hidden = true;
      if (previewVideo.hasAttribute('src')) {
        previewVideo.removeAttribute('src');
        previewVideo.load();
      }
    }

    if (draft.backgroundDefault) {
      return;
    }

    bgPreview.style.backgroundColor = draft.backgroundSolid
      ? draft.backgroundColor
      : source?.color ?? draft.backgroundImageColor;

    if (source?.type === 'image') {
      bgPreview.style.backgroundImage = `url(${JSON.stringify(source.url)})`;
    }
  }

  function pausePreview() { previewVideo.pause(); }

  /**
   * Updates visibility for background-image helper controls
   * depending on whether an image exists and whether the field is locked.
   */
  function updateColorState() {
    const draft = getDraftTheme();
    const hasImage = hasImageValue(primaryUrl(draft));
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
    const backgroundImage = bgImageMode.checked && !bgSolid.checked;
    const backgroundSolid = bgSolid.checked && !backgroundImage;
    const imagesDisabled = !backgroundImage;
    const syncMode = isSyncMode();

    syncPrimaryInputs();

    bgSolidColorField.classList.toggle('is-hidden', !backgroundSolid);
    bgColorInput.disabled = !backgroundSolid;
    bgImageControls.classList.toggle('is-hidden', imagesDisabled);
    bgImageUrlField.classList.toggle('is-hidden', !syncMode);
    bgImageColorInput.disabled = imagesDisabled || !syncMode || (bgController?.isLocked() ?? false);
    bgImageInput.disabled = imagesDisabled || !syncMode;
    toggleBtn.disabled = imagesDisabled || !syncMode;
    clearBgImageBtn.disabled = imagesDisabled || !syncMode;
    copyBgImageBtn.disabled = imagesDisabled || !syncMode;
    mediaUrl.disabled = imagesDisabled || additionalUploadPending;
    mediaAdd.disabled = imagesDisabled || additionalUploadPending;
    mediaUploadInput.disabled = imagesDisabled || additionalUploadPending;
    mediaUploadButton.disabled = imagesDisabled || additionalUploadPending;
    mediaInterval.disabled = imagesDisabled;

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
    previewIndex = 0;
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
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        const reference = type === 'video'
          ? await saveLocalVideo(file) : await saveLocalImage(file);
        created.push({ type, reference });
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
      for (const { type, reference } of created) {
        (type === 'video' ? uploadedVideos : uploadedImages).add(reference);
      }
      created.length = 0;
    } catch (error) {
      console.error('[THEME] Could not add local wallpapers:', error);
      flashError('flash.settings.invalidWallpaperFile');
    } finally {
      additionalUploadPending = false;
      await Promise.all(created.map(({ type, reference }) => (
        type === 'video' ? deleteLocalVideo(reference) : deleteLocalImage(reference)
      )));
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

  for (const [button, offset] of [[previewPrevious, -1], [previewNext, 1]]) {
    button.addEventListener('click', () => {
      const count = resolveThemeWallpapers(getDraftTheme(), { includeFallback: isSyncMode() }).length;
      if (count < 2) return;
      previewIndex = (previewIndex + offset + count) % count;
      updatePreview();
    });
  }

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
    previewIndex = 0;
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
