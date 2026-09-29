import { isLocalVideoReference, LOCAL_VIDEO_PROTOCOL } from '../../domain/settings/wallpaperMedia.js';

const DATABASE = 'newdesktab-local-videos';
const STORE = 'videos';
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg']);
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
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
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
