export const LOCAL_IMAGE_PROTOCOL = 'newdesktab-local-image:';

/** Returns whether a value is a device-local image reference. */
export function isLocalImageReference(value) {
  if (typeof value !== 'string' || !value.startsWith(LOCAL_IMAGE_PROTOCOL)) {
    return false;
  }

  const id = value.slice(LOCAL_IMAGE_PROTOCOL.length);
  return /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id);
}

/** Keeps a remote fallback separate from a device-local image selection. */
export function normalizeBackgroundImage(value = {}) {
  const url = typeof value?.backgroundImageUrl === 'string'
    ? value.backgroundImageUrl.trim() || null
    : null;
  const legacyLocal = isLocalImageReference(url);
  const backgroundImageLocal = isLocalImageReference(value?.backgroundImageLocal)
    ? value.backgroundImageLocal
    : legacyLocal ? url : null;
  return {
    backgroundImageUrl: legacyLocal ? null : url,
    backgroundImageLocal,
    backgroundImageSource: backgroundImageLocal && value?.backgroundImageSource !== 'url'
      ? 'local'
      : 'url',
    backgroundImageUrlLocked: !legacyLocal && value?.backgroundImageUrlLocked === true
  };
}
