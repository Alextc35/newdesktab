import { isLocalImageReference, normalizeBackgroundImage } from '../../shared/images/backgroundImage.js';

export const MAX_WALLPAPER_ITEMS = 24;
export const DEFAULT_WALLPAPER_INTERVAL = 30;
export const LOCAL_VIDEO_PROTOCOL = 'newdesktab-local-video:';
const COLOR_PATTERN = /^#[\da-f]{6}$/i;

/** Direct video files can be recognized without making a network request. */
export function inferWallpaperType(value) {
  try {
    const url = new URL(value);
    const file = url.pathname.toLowerCase();
    const format = url.searchParams.get('format')?.toLowerCase();
    return /\.(?:mp4|webm|ogv|ogg)$/.test(file)
      || ['mp4', 'webm', 'ogv', 'ogg'].includes(format)
      ? 'video' : 'image';
  } catch {
    return 'image';
  }
}

export function normalizeWallpaperColor(value) {
  return typeof value === 'string' && COLOR_PATTERN.test(value) ? value : null;
}

export function normalizePrimaryVideo(value) {
  const source = value && typeof value === 'object' ? value : {};
  const url = normalizeWallpaperUrl(source.url, 'video');
  const local = isLocalVideoReference(source.local) ? source.local : null;
  return { url, local, source: local && source.source !== 'url' ? 'local' : 'url' };
}

export function isLocalVideoReference(value) {
  return typeof value === 'string'
    && new RegExp(`^${LOCAL_VIDEO_PROTOCOL}[\\da-f]{8}(?:-[\\da-f]{4}){3}-[\\da-f]{12}$`, 'i').test(value);
}

export function normalizeWallpaperInterval(value) {
  return Number.isInteger(value) && value >= 5 && value <= 3600
    ? value : DEFAULT_WALLPAPER_INTERVAL;
}

export function normalizeWallpaperUrl(value, type = 'image') {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url || url.length > 4096) return null;
  if (type === 'image' && /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(url)) {
    return url;
  }
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Keeps local-only entries as placeholders so Sync can restore each device's file choice. */
export function normalizeWallpaperMedia(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0, MAX_WALLPAPER_ITEMS).flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const id = typeof item.id === 'string' && item.id.trim()
      ? item.id.trim().slice(0, 100) : `wallpaper-${index}`;
    if (seen.has(id)) return [];
    seen.add(id);
    if (item.type === 'video') {
      const url = normalizeWallpaperUrl(item.url, 'video');
      const local = isLocalVideoReference(item.local) ? item.local : null;
      if (!url && !local && !item.localPlaceholder) return [];
      return [{ id, type: 'video', url, local,
        localPlaceholder: !url,
        backgroundColor: normalizeWallpaperColor(item.backgroundColor),
        source: local && item.source !== 'url' ? 'local' : 'url' }];
    }
    if (item.type !== 'image') return [];
    const image = normalizeBackgroundImage(item);
    const backgroundImageUrl = normalizeWallpaperUrl(image.backgroundImageUrl);
    const backgroundImageLocal = isLocalImageReference(image.backgroundImageLocal)
      ? image.backgroundImageLocal : null;
    return [{
      id,
      type: 'image',
      backgroundImageUrl,
      backgroundImageLocal,
      backgroundColor: normalizeWallpaperColor(item.backgroundColor),
      backgroundImageSource: backgroundImageLocal && image.backgroundImageSource !== 'url'
        ? 'local' : 'url'
    }];
  });
}
