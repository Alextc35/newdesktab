import '../../types/types.js'; // typedefs
import { VERSION } from '../../platform/browser/extensionMetadata.js';
import { resolveBackgroundImage } from '../../platform/images/localImages.js';
import { resolveLocalVideo } from '../../platform/images/localVideos.js';
import { normalizeWallpaperInterval, normalizeWallpaperMedia } from '../../domain/settings/wallpaperMedia.js';

let wallpaperSignature = '';
let wallpaperIndex = 0;
let wallpaperTimer = null;
let wallpaperSources = [];
let wallpaperBaseColor = '#ffffff';

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const video = document.getElementById('page-wallpaper-video');
    if (!video || video.hidden) return;
    if (document.hidden) video.pause();
    else void video.play().catch(() => {});
  });
}

/** Personal wallpapers rotate on this device; the shared URL is a Sync-only fallback. */
export function resolveThemeWallpapers(theme = {}, { includeFallback = false } = {}) {
  const sources = normalizeWallpaperMedia(theme.backgroundMedia)
    .map(resolveWallpaperItem).filter(Boolean);
  if (sources.length) return sources;
  if (!includeFallback) return sources;

  const primaryVideo = theme.backgroundVideo ?? {};
  if (theme.backgroundPrimaryType === 'video') {
    const url = primaryVideo.url;
    if (url) sources.push({ type: 'video', url });
  } else {
    const primary = theme.backgroundImageUrl;
    if (primary) sources.push({ type: 'image', url: primary });
  }
  return sources;
}

export function resolveWallpaperItem(item) {
  if (!item) return null;
  const url = item.type === 'video'
    ? item.source === 'url' ? item.url ?? resolveLocalVideo(item.local)
      : resolveLocalVideo(item.local) ?? item.url
    : resolveBackgroundImage(item);
  return url ? { type: item.type, url, color: item.backgroundColor ?? null } : null;
}

function showWallpaper() {
  const video = document.getElementById('page-wallpaper-video');
  const source = wallpaperSources[wallpaperIndex];
  document.documentElement.style.setProperty('--color-bg-body', source?.color ?? wallpaperBaseColor);
  if (source?.type === 'video' && video) {
    document.documentElement.style.setProperty('--image-bg-body', 'none');
    video.hidden = false;
    if (video.src !== source.url) video.src = source.url;
    void video.play().catch(() => {});
    return;
  }
  if (video) {
    video.pause();
    video.hidden = true;
    if (video.hasAttribute('src')) {
      video.removeAttribute('src');
      video.load();
    }
  }
  document.documentElement.style.setProperty(
    '--image-bg-body',
    source ? `url(${JSON.stringify(source.url)})` : 'none'
  );
}

function setWallpaperRotation(sources, intervalSeconds) {
  const signature = JSON.stringify([sources, intervalSeconds]);
  if (signature !== wallpaperSignature) {
    if (wallpaperTimer !== null) clearInterval(wallpaperTimer);
    wallpaperTimer = null;
    wallpaperSignature = signature;
    wallpaperIndex = 0;
    wallpaperSources = sources;
  }
  showWallpaper();
  if (sources.length > 1 && intervalSeconds > 0 && wallpaperTimer === null) {
    wallpaperTimer = setInterval(() => {
      if (document.hidden) return;
      wallpaperIndex = (wallpaperIndex + 1) % wallpaperSources.length;
      showWallpaper();
    }, intervalSeconds * 1000);
  }
}

/**
 * Applies the page background settings and visible extension version.
 *
 * @param {Partial<Settings>} [settings={}]
 * @returns {void}
 */
export function applyPageTheme(settings = {}, { includeFallback = false } = {}) {
  const root = document.documentElement;
  const theme = settings.theme || {};
  wallpaperBaseColor = theme.backgroundSolid
    ? theme.backgroundColor
    : (theme.backgroundImageColor ?? theme.backgroundColor ?? '#ffffff');

  root.style.setProperty('--version', `"v${VERSION}"`);
  root.style.setProperty(
    '--color-bg-body',
    wallpaperBaseColor
  );

  root.classList.toggle('is-default-bg', Boolean(theme.backgroundDefault));

  if (theme.backgroundDefault || theme.backgroundSolid) {
    setWallpaperRotation([], normalizeWallpaperInterval(theme.backgroundRotationSeconds));
    return;
  }

  setWallpaperRotation(
    resolveThemeWallpapers(theme, { includeFallback }),
    normalizeWallpaperInterval(theme.backgroundRotationSeconds)
  );
}
