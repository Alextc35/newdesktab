import { getStorageMode } from '../../state/appStore.js';
import { createLockableInputController } from '../../shared/ui/lockableInput.js';
import {
  getImageInputValue,
  initLocalImageUpload,
  setLocalImageSyncNoticeVisibility,
  setImageInputValue
} from '../../shared/ui/localImageUpload.js';
import { renderBookmarkPreview } from './bookmarkPreview.js';

/**
 * Creates a bookmark editor that keeps form inputs,
 * bookmark state, and live preview in sync.
 *
 * @param {Object} params
 * @param {Object} params.elements - DOM references for form controls and preview.
 * @param {Object} params.bookmark - Initial bookmark state to edit.
 * @param {Function} params.onChange - Callback invoked with a cloned bookmark state.
 * @param {string|null} [params.previewFaviconUrl] - Optional local favicon for the preview.
 * @returns {Object} Public editor API.
 */
export function createBookmarkEditor({ elements, bookmark, onChange, previewFaviconUrl = null }) {
  let syncing = false;
  const abortController = new AbortController();
  const eventOptions = { signal: abortController.signal };
  const {
    preview,
    name,
    url,
    backgroundColor,
    backgroundImageLocalColor,
    backgroundImageSourceField,
    backgroundImageSource,
    backgroundImageUrlField,
    backgroundImage,
    backgroundImageLocal,
    bgLocalClearBtn,
    backgroundFavicon,
    noBackground,
    invertBg,
    showText,
    textColor,
    showFavicon,
    invertIcon,
    urlToggleBtn,
    urlCopyBtn,
    urlClearBtn,
    bgToggleBtn,
    bgCopyBtn,
    bgClearBtn,
    bgUploadBtn,
    bgUploadInput
  } = elements;

  /**
   * Controllers for lockable inputs.
   * They handle lock/unlock, copy, clear, and visual refresh logic.
   */
  let bgController;
  let urlController;

  /* ===============================
     Helpers
  =============================== */

  /**
   * Returns whether the given value contains a non-empty image string.
   *
   * @param {string|null|undefined} value
   * @returns {boolean}
   */
  const hasImage = value => typeof value === "string" && value.trim() !== "";

  /**
   * Re-renders the bookmark preview when a preview container exists.
   */
  const updatePreview = () => {
    if (preview) renderBookmarkPreview(preview, bookmark, { faviconUrl: previewFaviconUrl });
  };

  /**
   * Emits the current bookmark state after updating the preview.
   * A cloned object is returned to avoid leaking the internal reference.
   */
  const emitChange = () => {
    updatePreview();
    onChange?.(structuredClone(bookmark));
  };

  /**
   * Updates enabled/disabled states across related controls
   * based on the current bookmark configuration.
   */
  const updateStates = () => {
    const hasBgImage = hasImage(bookmark.backgroundImageUrl) || hasImage(bookmark.backgroundImageLocal);
    const hasLocalImage = hasImage(bookmark.backgroundImageLocal);
    const activeSource = hasLocalImage && bookmark.backgroundImageSource !== 'url'
      ? 'local'
      : 'url';

    if (backgroundFavicon) backgroundFavicon.disabled = hasBgImage;
    if (backgroundColor) {
      backgroundColor.disabled = bookmark.noBackground
        || activeSource !== 'url'
        || (bgController?.isLocked() ?? false);
    }
    if (backgroundImageLocalColor) {
      backgroundImageLocalColor.disabled = bookmark.noBackground || activeSource !== 'local';
    }
    if (backgroundImageSource) {
      backgroundImageSource.value = activeSource;
      backgroundImageSource.disabled = bookmark.backgroundFavicon;
    }
    backgroundImageSourceField?.classList.toggle('is-hidden', !hasLocalImage);
    backgroundImageUrlField?.classList.toggle(
      'is-hidden',
      hasLocalImage && activeSource === 'local'
    );
    backgroundImageLocal?.closest('.local-image-field')?.classList.toggle(
      'is-hidden',
      !hasLocalImage || activeSource === 'url'
    );
    if (textColor) textColor.disabled = !bookmark.showText;
    if (backgroundImage) backgroundImage.disabled = bookmark.backgroundFavicon;
    if (backgroundImageLocal) backgroundImageLocal.disabled = bookmark.backgroundFavicon;
    if (bgLocalClearBtn) bgLocalClearBtn.disabled = bookmark.backgroundFavicon;
    if (bgUploadBtn) bgUploadBtn.disabled = bookmark.backgroundFavicon;
    if (showFavicon) showFavicon.disabled = bookmark.backgroundFavicon;
    if (invertBg) invertBg.disabled = bookmark.backgroundFavicon || !hasBgImage;
    if (invertIcon) invertIcon.disabled = !bookmark.backgroundFavicon && !bookmark.showFavicon;
    if (url) url.disabled = bookmark.urlLocked;
  };

  /* ===============================
     Lock Controllers
  =============================== */

  /**
   * Creates the lockable controller for the background image input.
   * This keeps the bookmark state synchronized with lock/copy/clear actions.
   */
  if (backgroundImage && bgToggleBtn && !bgController) {
    bgController = createLockableInputController({
      input: backgroundImage,
      toggleBtn: bgToggleBtn,
      copyBtn: bgCopyBtn,
      clearBtn: bgClearBtn,
      initialLocked: bookmark.backgroundImageUrlLocked ?? false,
      signal: abortController.signal,
      onChange: () => {
        if (syncing) return;

        bookmark.backgroundImageUrl = getImageInputValue(backgroundImage) || null;
        bookmark.backgroundImageUrlLocked = bgController?.isLocked() ?? false;

        updateStates();
        emitChange();
      }
    });
  }

  initLocalImageUpload({
    button: bgUploadBtn,
    fileInput: bgUploadInput,
    targetInput: backgroundImageLocal,
    clearButton: bgLocalClearBtn,
    signal: abortController.signal,
    onChange: () => {
      if (syncing) return;
      bookmark.backgroundImageLocal = getImageInputValue(backgroundImageLocal) || null;
      bookmark.backgroundImageSource = bookmark.backgroundImageLocal ? 'local' : 'url';
      updateStates();
      emitChange();
    }
  });
  setLocalImageSyncNoticeVisibility(
    bgUploadBtn?.parentElement?.querySelector('.local-image-notice'),
    getStorageMode()
  );

  /**
   * Creates the lockable controller for the URL input.
   * This keeps the bookmark state synchronized with lock/copy/clear actions.
   */
  if (url && urlToggleBtn && !urlController) {
    urlController = createLockableInputController({
      input: url,
      toggleBtn: urlToggleBtn,
      copyBtn: urlCopyBtn,
      clearBtn: urlClearBtn,
      initialLocked: bookmark.urlLocked ?? false,
      signal: abortController.signal,
      onChange: () => {
        if (syncing) return;

        bookmark.url = url.value.trim() || '';
        bookmark.urlLocked = urlController?.isLocked() ?? false;

        updateStates();
        emitChange();
      }
    });
  }

  /**
   * Refreshes lockable controller UI state when available.
   */
  const refreshBgController = () => bgController?.refresh?.();
  const refreshUrlController = () => urlController?.refresh?.();

  /**
   * Resets the editor with a new bookmark state.
   * This synchronizes lock states first, then re-syncs the full UI.
   *
   * @param {Object} newState
   */
  const reset = (newState = {}) => {
    syncing = true;

    bookmark = structuredClone(newState);

    if (urlController) {
      urlController.setLocked?.(bookmark.urlLocked ?? false);
    }

    if (bgController) {
      bgController.setLocked?.(bookmark.backgroundImageUrlLocked ?? false);
    }

    syncUI();

    syncing = false;
  };

  /* ===============================
     Bind Inputs
  =============================== */

  /**
   * Binds a form control to a bookmark field.
   * Checkbox inputs use `checked`; all other inputs use `value`.
   *
   * @param {HTMLElement} input
   * @param {string} key - Bookmark property to update.
   * @param {string} type - DOM event type to listen for.
   */
  function bindInput(input, key, type = "input") {
    if (!input) return;

    input.addEventListener(type, () => {
      if (syncing) return;

      bookmark[key] = input.type === "checkbox" ? input.checked : input.value;

      updateStates();
      emitChange();
    }, eventOptions);
  }

  function bindBackgroundColor(input, mirror) {
    if (!input) return;

    input.addEventListener('input', () => {
      if (syncing || input.disabled) return;

      bookmark.backgroundColor = input.value;
      if (mirror) mirror.value = input.value;

      updateStates();
      emitChange();
    }, eventOptions);
  }

  bindInput(name, "name");
  bindBackgroundColor(backgroundColor, backgroundImageLocalColor);
  bindBackgroundColor(backgroundImageLocalColor, backgroundColor);
  bindInput(backgroundImageSource, "backgroundImageSource", "change");
  bindInput(backgroundFavicon, "backgroundFavicon", "change");
  bindInput(noBackground, "noBackground", "change");
  bindInput(invertBg, "invertColorBg", "change");
  bindInput(showText, "showText", "change");
  bindInput(textColor, "textColor");
  bindInput(showFavicon, "showFavicon", "change");
  bindInput(invertIcon, "invertColorIcon", "change");

  /* ===============================
     Public API
  =============================== */

  /**
   * Synchronizes the current bookmark state into the UI controls,
   * refreshes dependent control states, and updates the preview.
   */
  const syncUI = () => {
    if (name) name.value = bookmark.name ?? "";
    if (url) url.value = bookmark.url ?? "";
    if (backgroundColor) backgroundColor.value = bookmark.backgroundColor ?? "";
    if (backgroundImageLocalColor) {
      backgroundImageLocalColor.value = bookmark.backgroundColor ?? "";
    }
    if (backgroundImageSource) {
      backgroundImageSource.value = bookmark.backgroundImageSource ?? "url";
    }
    setImageInputValue(backgroundImage, bookmark.backgroundImageUrl);
    setImageInputValue(backgroundImageLocal, bookmark.backgroundImageLocal);
    if (backgroundFavicon) backgroundFavicon.checked = bookmark.backgroundFavicon ?? false;
    if (noBackground) noBackground.checked = bookmark.noBackground ?? false;
    if (invertBg) invertBg.checked = bookmark.invertColorBg ?? false;
    if (showText) showText.checked = bookmark.showText ?? false;
    if (textColor) textColor.value = bookmark.textColor ?? "";
    if (showFavicon) showFavicon.checked = bookmark.showFavicon ?? false;
    if (invertIcon) invertIcon.checked = bookmark.invertColorIcon ?? false;

    updateStates();
    refreshBgController();
    refreshUrlController();
    updatePreview();
  };

  /**
   * Returns a safe cloned snapshot of the current bookmark state.
   *
   * @returns {Object}
   */
  const getState = () => structuredClone(bookmark);

  /**
   * Replaces the current editor state with a new bookmark state.
   *
   * @param {Object} newState
   */
  const setState = newState => reset(newState);

  /**
   * Removes every event listener owned by this editor instance.
   */
  const destroy = () => {
    abortController.abort();
    bgController?.destroy?.();
    urlController?.destroy?.();
    bgController = null;
    urlController = null;
  };

  // Initial sync on editor creation
  syncUI();

  return { syncUI, updatePreview, getState, setState, reset, destroy, bgController, urlController };
}
