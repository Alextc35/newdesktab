import {
  isLocalImageReference,
  LOCAL_IMAGE_PROTOCOL,
  normalizeBackgroundImage
} from '../../shared/images/backgroundImage.js';
import { callStorage, getStorageBytes } from '../storage/chromeStorage.js';

const LOCAL_IMAGE_STORAGE_PREFIX = 'newdesktabLocalImage:';
const MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024;
const MAX_STORED_IMAGE_BYTES = 1_250_000;
const MAX_IMAGE_DIMENSION = 1920;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

/** @type {Map<string, string>} */
const cachedImages = new Map();
/** @type {Map<string, string>} */
const cachedImageNames = new Map();

/**
 * Resolves a persisted image value for CSS or an image element.
 * Remote URLs are returned unchanged; unavailable local references resolve to
 * null so a synced layout remains usable on another device.
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function resolveImageSource(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return isLocalImageReference(value) ? cachedImages.get(value) ?? null : value;
}

/** Resolves the selected source first and keeps the other image as a fallback. */
export function resolveBackgroundImage(value = {}) {
  const {
    backgroundImageLocal,
    backgroundImageUrl,
    backgroundImageSource
  } = normalizeBackgroundImage(value);
  const local = resolveImageSource(backgroundImageLocal);
  const url = resolveImageSource(backgroundImageUrl);
  return backgroundImageSource === 'url' ? url ?? local : local ?? url;
}

/**
 * Returns the original filename for a locally stored image when it is known
 * on this device. File names are deliberately kept out of synchronized data.
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function getLocalImageName(value) {
  return isLocalImageReference(value) ? cachedImageNames.get(value) ?? null : null;
}

/**
 * Loads only the local files referenced by persisted app data. This avoids
 * reading the whole local-image library when a workspace does not use it.
 *
 * @param {object} data
 * @returns {Promise<void>}
 */
export async function preloadLocalImages(data) {
  const references = collectLocalImageReferences(data);
  const missing = [...references].filter(reference => !cachedImages.has(reference));
  if (!missing.length) return;

  const values = await callStorage(
    chrome.storage.local,
    'get',
    missing.map(getStorageKey)
  );

  for (const reference of missing) {
    const storedImage = values[getStorageKey(reference)];
    const image = getStoredImageData(storedImage);
    if (!isImageDataUrl(image)) continue;

    cachedImages.set(reference, image);
    const name = getStoredImageName(storedImage);
    if (name) cachedImageNames.set(reference, name);
  }
}

/**
 * Optimizes and stores an uploaded image exclusively in chrome.storage.local.
 * The returned reference is kept in the editor draft until its device-local
 * selection is saved. Neither the file nor the selection is sent to Sync.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function saveLocalImage(file) {
  validateImageFile(file);

  const image = await loadImage(file);
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  ({ width, height } = scaleToFit(width, height, MAX_IMAGE_DIMENSION));

  let quality = .84;
  let blob = await renderImage(image, width, height, quality);
  for (let attempt = 0; blob.size > MAX_STORED_IMAGE_BYTES && attempt < 5; attempt += 1) {
    const scale = Math.max(.45, Math.sqrt(MAX_STORED_IMAGE_BYTES / blob.size) * .92);
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
    quality = Math.max(.58, quality - .07);
    blob = await renderImage(image, width, height, quality);
  }

  if (blob.size > MAX_STORED_IMAGE_BYTES) throw localImageError('tooLarge');

  const dataUrl = await readAsDataUrl(blob);
  const reference = `${LOCAL_IMAGE_PROTOCOL}${crypto.randomUUID()}`;
  const key = getStorageKey(reference);
  const quotaBytes = chrome.storage.local.QUOTA_BYTES ?? 10 * 1024 * 1024;
  const usedBytes = await getLocalStorageBytes();
  const storedImage = { dataUrl, name: file.name };
  const additionalBytes = new TextEncoder().encode(key).length
    + new TextEncoder().encode(JSON.stringify(storedImage)).length;

  if (usedBytes + additionalBytes > quotaBytes) throw localImageError('storageFull');

  await callStorage(chrome.storage.local, 'set', { [key]: storedImage });
  cachedImages.set(reference, dataUrl);
  cachedImageNames.set(reference, file.name);
  return reference;
}

/** Removes every image file owned by NewDeskTab from this browser profile. */
export async function clearLocalImages() {
  const values = await callStorage(chrome.storage.local, 'get', null);
  const keys = Object.keys(values).filter(key => key.startsWith(LOCAL_IMAGE_STORAGE_PREFIX));
  if (keys.length) await callStorage(chrome.storage.local, 'remove', keys);
  cachedImages.clear();
  cachedImageNames.clear();
}

function collectLocalImageReferences(value, references = new Set()) {
  if (isLocalImageReference(value)) {
    references.add(value);
    return references;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectLocalImageReferences(entry, references);
    return references;
  }
  if (!value || typeof value !== 'object') return references;

  for (const entry of Object.values(value)) {
    collectLocalImageReferences(entry, references);
  }
  return references;
}

function getStorageKey(reference) {
  return `${LOCAL_IMAGE_STORAGE_PREFIX}${reference.slice(LOCAL_IMAGE_PROTOCOL.length)}`;
}

function isImageDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function getStoredImageData(value) {
  return isImageDataUrl(value) ? value : value?.dataUrl;
}

function getStoredImageName(value) {
  if (typeof value?.name !== 'string') return null;
  const name = value.name.trim();
  return name || null;
}

function validateImageFile(file) {
  if (!(file instanceof File) || !SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw localImageError('invalid');
  }
  if (file.size > MAX_SOURCE_FILE_BYTES) throw localImageError('tooLarge');
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';

  try {
    await new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
      image.src = url;
    });
    return image;
  } catch {
    throw localImageError('invalid');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function scaleToFit(width, height, maxDimension) {
  if (!width || !height) throw localImageError('invalid');
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

async function renderImage(image, width, height, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw localImageError('processing');

  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob) throw localImageError('processing');
  return blob;
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', reject, { once: true });
    reader.readAsDataURL(blob);
  });
}

async function getLocalStorageBytes() {
  if (typeof chrome.storage.local.getBytesInUse === 'function') {
    return callStorage(chrome.storage.local, 'getBytesInUse', null);
  }

  const values = await callStorage(chrome.storage.local, 'get', null);
  return getStorageBytes(values);
}

function localImageError(code) {
  const error = new Error(`Local image ${code}`);
  error.code = `LOCAL_IMAGE_${code.toUpperCase()}`;
  return error;
}
