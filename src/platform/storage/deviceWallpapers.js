import {
  DEFAULT_WALLPAPER_INTERVAL,
  MAX_WALLPAPER_ITEMS,
  normalizeWallpaperInterval,
  normalizeWallpaperMedia
} from '../../domain/settings/wallpaperMedia.js';
import { callStorage } from './chromeStorage.js';

export const DEVICE_WALLPAPERS_KEY = 'newdesktabDeviceWallpapers';

/** The personal collection and its rotation timing never enter Chrome Sync. */
export function withoutDeviceWallpapers(data) {
  const shared = structuredClone(data);
  shared.settings.theme.backgroundMedia = [];
  shared.settings.theme.backgroundRotationSeconds = DEFAULT_WALLPAPER_INTERVAL;
  delete shared.settings.theme.legacyBackgroundMedia;
  delete shared.settings.theme.legacyBackgroundRotationSeconds;
  return shared;
}

export async function saveDeviceWallpapers(data) {
  const theme = data.settings.theme;
  await callStorage(chrome.storage.local, 'set', {
    [DEVICE_WALLPAPERS_KEY]: {
      media: normalizeWallpaperMedia(theme.backgroundMedia),
      rotationSeconds: normalizeWallpaperInterval(theme.backgroundRotationSeconds)
    }
  });
}

/** Makes frozen legacy slots visible to the old per-device image selections. */
export async function prepareLegacyDeviceWallpapers(data) {
  const theme = data.settings.theme;
  if (!Array.isArray(theme.legacyBackgroundMedia) || theme.backgroundMedia?.length) return data;
  const stored = await callStorage(chrome.storage.local, 'get', DEVICE_WALLPAPERS_KEY);
  if (Object.hasOwn(stored, DEVICE_WALLPAPERS_KEY)) return data;
  const prepared = structuredClone(data);
  prepared.settings.theme.backgroundMedia = normalizeWallpaperMedia(theme.legacyBackgroundMedia);
  return prepared;
}

/** Copies a pre-migration shared collection once, then keeps each device independent. */
export async function restoreDeviceWallpapers(data) {
  const restored = structuredClone(data);
  const theme = restored.settings.theme;
  const stored = await callStorage(chrome.storage.local, 'get', DEVICE_WALLPAPERS_KEY);
  const ownsCollection = Object.hasOwn(stored, DEVICE_WALLPAPERS_KEY);
  const collection = ownsCollection ? stored[DEVICE_WALLPAPERS_KEY] : {
    media: theme.backgroundMedia?.length ? theme.backgroundMedia
      : theme.legacyBackgroundMedia ?? theme.backgroundMedia,
    rotationSeconds: theme.legacyBackgroundRotationSeconds ?? theme.backgroundRotationSeconds
  };
  const media = normalizeWallpaperMedia(collection?.media);
  const hasLegacyCollection = media.length > 0
    || normalizeWallpaperInterval(collection?.rotationSeconds) !== DEFAULT_WALLPAPER_INTERVAL;
  let migratedPrimary = false;

  // Old versions allowed the primary wallpaper to be a local file. Move it
  // into this device's personal collection while keeping its URL as fallback.
  if (!ownsCollection) {
    const primary = theme.backgroundPrimaryType === 'video'
      ? { type: 'video', reference: theme.backgroundVideo?.local }
      : { type: 'image', reference: theme.backgroundImageLocal };
    if (primary.reference && media.length < MAX_WALLPAPER_ITEMS) {
      migratedPrimary = true;
      media.unshift(primary.type === 'video'
        ? { id: crypto.randomUUID(), type: 'video', url: null,
          local: primary.reference, source: 'local' }
        : { id: crypto.randomUUID(), type: 'image', backgroundImageUrl: null,
          backgroundImageLocal: primary.reference, backgroundImageSource: 'local' });
    }
  }

  theme.backgroundMedia = normalizeWallpaperMedia(media);
  theme.backgroundRotationSeconds = normalizeWallpaperInterval(collection?.rotationSeconds);
  theme.backgroundImageLocal = null;
  theme.backgroundImageSource = 'url';
  theme.backgroundVideo = { ...theme.backgroundVideo, local: null, source: 'url' };
  delete theme.legacyBackgroundMedia;
  delete theme.legacyBackgroundRotationSeconds;

  if (!ownsCollection && (hasLegacyCollection || migratedPrimary)) {
    await saveDeviceWallpapers(restored);
  }
  return restored;
}

export function clearDeviceWallpapers() {
  return callStorage(chrome.storage.local, 'remove', DEVICE_WALLPAPERS_KEY);
}
