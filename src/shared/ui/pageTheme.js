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
let activeWallpaperLayer = null;
let wallpaperTransitioning = false;
let wallpaperTransitionVersion = 0;
const WALLPAPER_FADE_MS = 850;
const WALLPAPER_LOAD_WAIT_MS = 2000;
const VIDEO_LOAD_WAIT_MS = 8000;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    document.querySelectorAll('#page-wallpaper-stage .is-visible video:not([hidden])')
      .forEach(video => {
        if (document.hidden) video.pause();
        else void video.play().catch(() => {});
      });
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

function updatePageBackground(source) {
  const root = document.documentElement;
  root.style.setProperty('--color-bg-body', source?.color ?? wallpaperBaseColor);
  root.style.setProperty('--image-bg-body', source?.type === 'image'
    ? `url(${JSON.stringify(source.url)})` : 'none');
}

function clearWallpaperLayer(layer) {
  const image = layer.querySelector('img');
  const video = layer.querySelector('video');
  image.onload = null;
  image.onerror = null;
  image.hidden = true;
  image.classList.remove('is-ready');
  image.removeAttribute('src');
  video.onloadeddata = null;
  video.onerror = null;
  video.pause();
  video.hidden = true;
  video.classList.remove('is-ready');
  if (video.hasAttribute('src')) {
    video.removeAttribute('src');
    video.load();
  }
  layer.style.backgroundColor = '';
  delete layer.dataset.wallpaperKey;
}

function prepareWallpaperLayer(layer, source, color, key) {
  clearWallpaperLayer(layer);
  layer.style.backgroundColor = color;
  layer.dataset.wallpaperKey = key;
  const media = layer.querySelector(source.type === 'video' ? 'video' : 'img');
  media.hidden = false;
  const ready = new Promise(resolve => {
    const onReady = () => {
      if (layer.dataset.wallpaperKey !== key) return;
      media.classList.add('is-ready');
      resolve(true);
    };
    media[source.type === 'video' ? 'onloadeddata' : 'onload'] = source.type === 'video'
      && typeof media.requestVideoFrameCallback === 'function'
      ? () => media.requestVideoFrameCallback(onReady)
      : onReady;
    media.onerror = () => resolve(false);
  });
  media.src = source.url;
  if (source.type === 'video' && !document.hidden) void media.play().catch(() => {});
  return ready;
}

function syncActiveVideoId(layer) {
  document.querySelectorAll('#page-wallpaper-stage video').forEach(video => video.removeAttribute('id'));
  layer?.querySelector('video')?.setAttribute('id', 'page-wallpaper-video');
}

async function showWallpaper(animate = false) {
  const source = wallpaperSources[wallpaperIndex];
  const firstVideo = source?.type === 'video' && !activeWallpaperLayer;
  updatePageBackground(firstVideo ? { type: 'video', color: '#000000' } : source);
  const layers = [...document.querySelectorAll('#page-wallpaper-stage .page-wallpaper-layer')];
  if (layers.length !== 2) return;
  const version = ++wallpaperTransitionVersion;
  wallpaperTransitioning = false;
  if (!source) {
    layers.forEach(layer => {
      layer.classList.remove('is-visible');
      clearWallpaperLayer(layer);
    });
    activeWallpaperLayer = null;
    syncActiveVideoId(layers[0]);
    return;
  }

  const color = source.color ?? wallpaperBaseColor;
  const key = JSON.stringify([source, color]);
  if (activeWallpaperLayer?.dataset.wallpaperKey === key) {
    layers.filter(layer => layer !== activeWallpaperLayer).forEach(layer => {
      layer.classList.remove('is-visible');
      clearWallpaperLayer(layer);
    });
    syncActiveVideoId(activeWallpaperLayer);
    return;
  }
  const previous = activeWallpaperLayer;
  const next = layers.find(layer => layer !== previous);
  const instant = !animate || !previous
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  next.classList.remove('is-visible');
  next.classList.toggle('is-instant', instant);
  const ready = prepareWallpaperLayer(next, source, firstVideo ? '#000000' : color, key);
  if (firstVideo) void ready.then(() => {
    if (version !== wallpaperTransitionVersion) return;
    updatePageBackground(source);
    next.style.backgroundColor = color;
  });
  document.getElementById('page-wallpaper-stage').append(next);

  if (animate && previous) {
    wallpaperTransitioning = true;
    const loaded = await Promise.race([ready, new Promise(resolve => setTimeout(
      () => resolve(null), source.type === 'video' ? VIDEO_LOAD_WAIT_MS : WALLPAPER_LOAD_WAIT_MS
    ))]);
    if (version !== wallpaperTransitionVersion) return;
    if (source.type === 'video' && loaded === null) {
      wallpaperIndex = (wallpaperIndex - 1 + wallpaperSources.length) % wallpaperSources.length;
      updatePageBackground(wallpaperSources[wallpaperIndex]);
      clearWallpaperLayer(next);
      wallpaperTransitioning = false;
      return;
    }
  }

  if (instant) {
    previous?.classList.remove('is-visible');
    if (previous) clearWallpaperLayer(previous);
    next.classList.add('is-visible');
    activeWallpaperLayer = next;
    syncActiveVideoId(next);
    wallpaperTransitioning = false;
    return;
  }

  void next.offsetWidth;
  next.classList.add('is-visible');
  syncActiveVideoId(next);
  await new Promise(resolve => setTimeout(resolve, WALLPAPER_FADE_MS));
  if (version !== wallpaperTransitionVersion) return;
  previous.classList.remove('is-visible');
  clearWallpaperLayer(previous);
  activeWallpaperLayer = next;
  wallpaperTransitioning = false;
}

function setWallpaperRotation(sources, intervalSeconds) {
  const signature = JSON.stringify([sources, intervalSeconds, wallpaperBaseColor]);
  if (signature !== wallpaperSignature) {
    if (wallpaperTimer !== null) clearInterval(wallpaperTimer);
    wallpaperTimer = null;
    wallpaperSignature = signature;
    wallpaperIndex = 0;
    wallpaperSources = sources;
    void showWallpaper();
  }
  if (sources.length > 1 && intervalSeconds > 0 && wallpaperTimer === null) {
    wallpaperTimer = setInterval(() => {
      if (document.hidden || wallpaperTransitioning) return;
      wallpaperIndex = (wallpaperIndex + 1) % wallpaperSources.length;
      void showWallpaper(true);
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
