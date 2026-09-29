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

/** Combines the existing single-image choice with additional ordered wallpapers. */
export function resolveThemeWallpapers(theme = {}) {
  const sources = [];
  const primaryVideo = theme.backgroundVideo ?? {};
  if (theme.backgroundPrimaryType === 'video') {
    const url = primaryVideo.source === 'url'
      ? primaryVideo.url ?? resolveLocalVideo(primaryVideo.local)
      : resolveLocalVideo(primaryVideo.local) ?? primaryVideo.url;
    if (url) sources.push({ type: 'video', url });
  } else {
    const primary = resolveBackgroundImage(theme);
    if (primary) sources.push({ type: 'image', url: primary });
  }
  for (const item of normalizeWallpaperMedia(theme.backgroundMedia)) {
    const source = resolveWallpaperItem(item);
    if (source) sources.push(source);
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
  if (sources.length > 1 && wallpaperTimer === null) {
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
export function applyPageTheme(settings = {}) {
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
    resolveThemeWallpapers(theme),
    normalizeWallpaperInterval(theme.backgroundRotationSeconds)
  );
}
