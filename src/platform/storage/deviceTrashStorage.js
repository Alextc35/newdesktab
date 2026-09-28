import { callStorage } from './chromeStorage.js';

/** Chrome-local persistence for recycle-bin contents that must never sync. */
export const DEVICE_TRASH_KEY = 'newdesktabLocalTrash';

/** Removes deleted entries from the payload shared through Sync. */
export function withoutDeviceTrash(data) {
  const shared = structuredClone(data);
  delete shared.trash;
  return shared;
}

/** Persists this device's current recycle-bin contents, including an empty bin. */
export async function saveDeviceTrash(data) {
  const trash = Array.isArray(data?.trash) ? structuredClone(data.trash) : [];
  await callStorage(chrome.storage.local, 'set', { [DEVICE_TRASH_KEY]: trash });
}

/**
 * Overlays this device's recycle-bin contents on synchronized data. Legacy
 * synchronized entries are adopted once so upgrading does not lose them.
 */
export async function restoreDeviceTrash(data) {
  const restored = structuredClone(data);
  const stored = await callStorage(chrome.storage.local, 'get', DEVICE_TRASH_KEY);

  if (Object.hasOwn(stored, DEVICE_TRASH_KEY)) {
    restored.trash = Array.isArray(stored[DEVICE_TRASH_KEY])
      ? structuredClone(stored[DEVICE_TRASH_KEY])
      : [];
    return restored;
  }

  const legacyTrash = Array.isArray(restored.trash)
    ? structuredClone(restored.trash)
    : [];
  await callStorage(chrome.storage.local, 'set', { [DEVICE_TRASH_KEY]: legacyTrash });
  restored.trash = legacyTrash;
  return restored;
}

/** Removes device-only recycle-bin contents during a complete data reset. */
export function clearDeviceTrash() {
  return callStorage(chrome.storage.local, 'remove', DEVICE_TRASH_KEY);
}
