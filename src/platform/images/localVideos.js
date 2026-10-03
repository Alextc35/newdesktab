import { isLocalVideoReference, LOCAL_VIDEO_PROTOCOL } from '../../domain/settings/wallpaperMedia.js';

const DATABASE = 'newdesktab-local-videos';
const STORE = 'videos';
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg']);
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = new Int16Array(128).fill(-1);
for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
  BASE64_LOOKUP[BASE64_ALPHABET.charCodeAt(index)] = index;
}
const urls = new Map();
const names = new Map();

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      let result;
      if (request) {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error);
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function saveLocalVideo(file) {
  if (!(file instanceof File) || !TYPES.has(file.type) || !file.size || file.size > MAX_VIDEO_BYTES) {
    const error = new Error('Choose an MP4, WebM or Ogg video up to 200 MB.');
    error.code = 'LOCAL_VIDEO_INVALID';
    throw error;
  }
  const reference = `${LOCAL_VIDEO_PROTOCOL}${crypto.randomUUID()}`;
  await withStore('readwrite', store => store.put({ blob: file, name: file.name }, reference));
  urls.set(reference, URL.createObjectURL(file));
  names.set(reference, file.name);
  return reference;
}

export async function preloadLocalVideos(data) {
  const entries = data?.settings?.theme?.backgroundMedia ?? [];
  const references = [data?.settings?.theme?.backgroundVideo?.local, ...(Array.isArray(entries)
    ? entries.map(item => item?.local).filter(isLocalVideoReference)
    : [])];
  await preloadLocalVideoReferences(references);
}

export async function preloadLocalVideoReferences(references) {
  for (const reference of references) {
    if (!isLocalVideoReference(reference)) continue;
    if (urls.has(reference)) continue;
    const record = await withStore('readonly', store => store.get(reference));
    if (!(record?.blob instanceof Blob)) continue;
    urls.set(reference, URL.createObjectURL(record.blob));
    names.set(reference, record.name || 'Video');
  }
}

/** Exports only video files referenced by the supplied application data. */
export async function exportReferencedLocalVideos(data) {
  const references = [...collectLocalVideoReferences(data)];
  const videos = {};

  for (const reference of references) {
    const stored = await withStore('readonly', store => store.get(reference));
    if (!(stored?.blob instanceof Blob)
      || !TYPES.has(stored.blob.type)
      || !stored.blob.size
      || stored.blob.size > MAX_VIDEO_BYTES) {
      throw localVideoError('missing');
    }
    const name = typeof stored.name === 'string' ? stored.name.trim() : '';
    if (name.length > 1024) {
      throw localVideoError('missing');
    }

    videos[reference] = {
      dataUrl: await readAsDataUrl(stored.blob),
      ...(name ? { name } : {})
    };
  }

  return videos;
}

/** Restores the videos referenced by a complete backup into this device's IndexedDB. */
export async function restoreReferencedLocalVideos(data, backupVideos) {
  if (backupVideos === undefined) return;
  if (!backupVideos || typeof backupVideos !== 'object' || Array.isArray(backupVideos)) {
    throw localVideoError('invalidBackup');
  }

  const restoredVideos = new Map();
  for (const reference of collectLocalVideoReferences(data)) {
    const stored = backupVideos[reference];
    const name = typeof stored?.name === 'string' ? stored.name.trim() : '';
    if (name.length > 1024) throw localVideoError('invalidBackup');
    const blob = await decodeVideoDataUrl(stored?.dataUrl);
    restoredVideos.set(reference, { blob, name });
  }
  if (!restoredVideos.size) return;

  try {
    await withStore('readwrite', store => {
      for (const [reference, record] of restoredVideos) {
        store.put(record, reference);
      }
      return null;
    });
  } catch (error) {
    if (error?.name === 'QuotaExceededError') throw localVideoError('storageFull');
    throw error;
  }

  for (const [reference, record] of restoredVideos) {
    const previousUrl = urls.get(reference);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    urls.set(reference, URL.createObjectURL(record.blob));
    if (record.name) names.set(reference, record.name);
    else names.delete(reference);
  }
}

export function resolveLocalVideo(reference) {
  return isLocalVideoReference(reference) ? urls.get(reference) ?? null : null;
}

export function getLocalVideoName(reference) {
  return isLocalVideoReference(reference) ? names.get(reference) ?? null : null;
}

export async function deleteLocalVideo(reference) {
  if (!isLocalVideoReference(reference)) return;
  const url = urls.get(reference);
  if (url) URL.revokeObjectURL(url);
  urls.delete(reference);
  names.delete(reference);
  await withStore('readwrite', store => store.delete(reference));
}

/** IndexedDB is separate from chrome.storage.local, so report its usage separately. */
export async function getLocalVideoStorageBytes() {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      let total = 0;
      const transaction = database.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        total += cursor.value?.blob?.size ?? 0;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(total);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function clearLocalVideos() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  names.clear();
  await withStore('readwrite', store => store.clear());
}

function collectLocalVideoReferences(value, references = new Set()) {
  if (isLocalVideoReference(value)) {
    references.add(value);
    return references;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectLocalVideoReferences(entry, references);
    return references;
  }
  if (!value || typeof value !== 'object') return references;
  for (const entry of Object.values(value)) collectLocalVideoReferences(entry, references);
  return references;
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', () => reject(reader.error), { once: true });
    reader.readAsDataURL(blob);
  });
}

async function decodeVideoDataUrl(value) {
  const match = typeof value === 'string'
    ? /^data:(video\/(?:mp4|webm|ogg));base64,([a-z\d+/]*={0,2})$/i.exec(value)
    : null;
  if (!match || match[2].length % 4 !== 0) throw localVideoError('invalidBackup');

  const encoded = match[2];
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const byteLength = (encoded.length / 4) * 3 - padding;
  if (!byteLength || byteLength > MAX_VIDEO_BYTES) throw localVideoError('invalidBackup');

  const bytes = new Uint8Array(byteLength);
  let outputIndex = 0;
  let nextYield = 4 * 1024 * 1024;
  for (let index = 0; index < encoded.length; index += 4) {
    const first = lookupBase64(encoded.charCodeAt(index));
    const second = lookupBase64(encoded.charCodeAt(index + 1));
    const thirdCode = encoded.charCodeAt(index + 2);
    const fourthCode = encoded.charCodeAt(index + 3);
    const third = thirdCode === 61 ? 0 : lookupBase64(thirdCode);
    const fourth = fourthCode === 61 ? 0 : lookupBase64(fourthCode);
    if (first < 0 || second < 0 || third < 0 || fourth < 0) {
      throw localVideoError('invalidBackup');
    }

    bytes[outputIndex++] = (first << 2) | (second >> 4);
    if (thirdCode !== 61) {
      bytes[outputIndex++] = ((second & 15) << 4) | (third >> 2);
      if (fourthCode !== 61) bytes[outputIndex++] = ((third & 3) << 6) | fourth;
    }

    if (outputIndex >= nextYield) {
      await new Promise(resolve => setTimeout(resolve, 0));
      nextYield = outputIndex + 4 * 1024 * 1024;
    }
  }

  return new Blob([bytes], { type: match[1].toLowerCase() });
}

function lookupBase64(code) {
  return code < BASE64_LOOKUP.length ? BASE64_LOOKUP[code] : -1;
}

function localVideoError(code) {
  const error = new Error(`Local video ${code}`);
  error.code = `LOCAL_VIDEO_${code.toUpperCase()}`;
  return error;
}
