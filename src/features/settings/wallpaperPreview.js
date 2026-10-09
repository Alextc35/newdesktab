import { resolveThemeWallpapers } from '../../shared/ui/pageTheme.js';

/** Owns video readiness, preview navigation and cancellation of stale frames. */
export function createWallpaperPreview({ bgPreview, getTheme, includeFallback }) {
  let previewVideo = document.getElementById('settings-theme-preview-video');
  const previewNavigation = document.getElementById('settings-theme-preview-navigation');
  const previewCount = document.getElementById('settings-theme-preview-count');
  const previewPrevious = document.getElementById('settings-theme-preview-prev');
  const previewNext = document.getElementById('settings-theme-preview-next');
  let previewIndex = 0;
  let previewSourceKey = '';
  let pendingPreviewVideo = null;
  let pendingPreviewKey = '';
  let pendingPreviewColor = '';
  let previewCurrentColor = '';
  let previewRevision = 0;
  const themeTab = bgPreview.closest('#settings-modal-tab-theme');
  function syncPreviewAspectRatio() {
    const viewport = document.getElementById('bookmark-viewport')?.getBoundingClientRect();
    if (!viewport?.width || !viewport?.height) return;
    themeTab.style.setProperty('--theme-wallpaper-preview-ratio',
      String(viewport.width / viewport.height));
  }

  window.addEventListener('resize', syncPreviewAspectRatio);

  /**
   * Updates the theme background preview based on the current draft state.
   *
   * Behavior:
   * - clears previous inline styles
   * - shows the default wallpaper when neither custom mode is selected
   * - otherwise applies the selected background color and optional image
   */
  function cancelPendingPreview() {
    previewRevision += 1;
    if (pendingPreviewVideo) {
      pendingPreviewVideo.pause();
      pendingPreviewVideo.onloadeddata = null;
      pendingPreviewVideo.onerror = null;
      pendingPreviewVideo.remove();
      pendingPreviewVideo = null;
    }
    pendingPreviewKey = '';
    previewVideo.id = 'settings-theme-preview-video';
  }

  function stopPreviewVideo() {
    previewVideo.pause();
    previewVideo.hidden = true;
    previewVideo.classList.remove('is-ready');
    if (previewVideo.hasAttribute('src')) {
      previewVideo.removeAttribute('src');
      previewVideo.load();
    }
  }

  function updatePreview() {
    const draft = getTheme();
    bgPreview.classList.toggle('is-default-bg', draft.backgroundDefault);
    const sources = draft.backgroundDefault || draft.backgroundSolid
      ? [] : resolveThemeWallpapers(draft, { includeFallback: includeFallback() });
    previewNavigation.classList.toggle('is-hidden', sources.length < 2);
    previewIndex = sources.length ? previewIndex % sources.length : 0;
    previewCount.textContent = sources.length ? `${previewIndex + 1} / ${sources.length}` : '';
    const source = sources[previewIndex];
    const color = draft.backgroundSolid
      ? draft.backgroundColor : source?.color ?? draft.backgroundImageColor;
    const key = source ? `${source.type}:${source.url}`
      : draft.backgroundDefault ? 'default' : `solid:${color}`;

    if (source?.type === 'video') {
      if (pendingPreviewKey === key) {
        pendingPreviewColor = color;
        return;
      }
      if (previewSourceKey === key) {
        previewCurrentColor = color;
        bgPreview.style.backgroundColor = color;
        if (!previewVideo.hidden) void previewVideo.play().catch(() => {});
        return;
      }

      cancelPendingPreview();
      const revision = previewRevision;
      const incoming = document.createElement('video');
      incoming.id = 'settings-theme-preview-video';
      incoming.muted = true;
      incoming.autoplay = true;
      incoming.playsInline = true;
      incoming.loop = true;
      previewVideo.removeAttribute('id');
      bgPreview.append(incoming);
      pendingPreviewVideo = incoming;
      pendingPreviewKey = key;
      pendingPreviewColor = color;
      if (!previewSourceKey) bgPreview.style.backgroundColor = '#000000';

      const finish = loaded => {
        if (revision !== previewRevision || pendingPreviewVideo !== incoming) return;
        const oldVideo = previewVideo;
        previewVideo = incoming;
        pendingPreviewVideo = null;
        pendingPreviewKey = '';
        previewSourceKey = key;
        previewCurrentColor = pendingPreviewColor;
        if (loaded) incoming.classList.add('is-ready');
        else {
          incoming.hidden = true;
          bgPreview.style.backgroundColor = pendingPreviewColor;
        }
        const removeOld = () => {
          oldVideo.pause();
          oldVideo.remove();
          if (previewSourceKey !== key || previewVideo !== incoming) return;
          bgPreview.style.backgroundImage = '';
          bgPreview.style.backgroundColor = previewCurrentColor;
        };
        if (loaded && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          setTimeout(removeOld, 220);
        } else removeOld();
      };
      incoming.onloadeddata = () => {
        if (typeof incoming.requestVideoFrameCallback === 'function') {
          incoming.requestVideoFrameCallback(() => finish(true));
        } else finish(true);
      };
      incoming.onerror = () => finish(false);
      incoming.src = source.url;
      void incoming.play().catch(() => {});
      return;
    }

    cancelPendingPreview();
    previewSourceKey = key;
    stopPreviewVideo();
    bgPreview.style.backgroundImage = '';
    if (draft.backgroundDefault) {
      bgPreview.style.backgroundColor = '';
      return;
    }

    bgPreview.style.backgroundColor = color;

    if (source?.type === 'image') {
      bgPreview.style.backgroundImage = `url(${JSON.stringify(source.url)})`;
    }
  }

  function pausePreview() {
    cancelPendingPreview();
    previewVideo.pause();
  }

  for (const [button, offset] of [[previewPrevious, -1], [previewNext, 1]]) {
    button.addEventListener('click', () => {
      const count = resolveThemeWallpapers(getTheme(), { includeFallback: includeFallback() }).length;
      if (count < 2) return;
      previewIndex = (previewIndex + offset + count) % count;
      updatePreview();
    });
  }

  return { update: updatePreview, pause: pausePreview, syncAspectRatio: syncPreviewAspectRatio, resetIndex: () => { previewIndex = 0; } };
}
