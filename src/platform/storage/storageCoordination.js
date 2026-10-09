import { STORAGE_MODES, STORAGE_MODE_KEY, LEGACY_SYNC_KEYS } from './storageConstants.js';
import { DEVICE_IMAGE_SELECTIONS_KEY } from './deviceImageSelections.js';
import { DEVICE_TRASH_KEY } from './deviceTrashStorage.js';
import { DEVICE_WALLPAPERS_KEY } from './deviceWallpapers.js';
import { SYNC_META_KEY, SYNC_CHUNK_PREFIX } from '../sync/syncTransport.js';

/** Serializes device writes and classifies browser storage notifications. */
export function createStorageCoordination({ getMode, onModeChanged, getDeviceId }) {
  const changeListeners = new Set();
  let lastObservedSyncWriterDeviceId = null;
  function withDeviceLock(operation) {
    if (globalThis.navigator?.locks) {
      return navigator.locks.request('newdesktab-persistence', operation);
    }
    // Non-browser unit harnesses have no shared origin or other pages.
    if (typeof window !== 'undefined') throw new Error('Web Locks are required to save safely.');
    return operation();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === STORAGE_MODES.LOCAL
      && (changes[DEVICE_IMAGE_SELECTIONS_KEY] || changes[DEVICE_TRASH_KEY]
        || changes[DEVICE_WALLPAPERS_KEY])) {
      for (const listener of changeListeners) listener({ areaName, origin: 'same-device' });
    }

    if (areaName === STORAGE_MODES.LOCAL && changes[STORAGE_MODE_KEY]) {
      onModeChanged(changes[STORAGE_MODE_KEY].newValue === STORAGE_MODES.SYNC
        ? STORAGE_MODES.SYNC : STORAGE_MODES.LOCAL);

      for (const listener of changeListeners) {
        listener({ areaName, origin: 'same-device' });
      }
      return;
    }

    if (areaName !== getMode()) return;

    const changedKeys = Object.keys(changes);
    const hasLegacySyncChange = LEGACY_SYNC_KEYS.some(key => changes[key] !== undefined);
    const isApplicationChange = getMode() === STORAGE_MODES.LOCAL
      ? changedKeys.some(key => (
          key === 'schemaVersion' || key === 'bookmarks' || key === 'settings'
          || key === 'folders' || key === 'widgets' || key === 'recycleBin' || key === 'trash'
        ))
      : changes[SYNC_META_KEY] !== undefined
        || hasLegacySyncChange
        || changedKeys.some(key => key.startsWith(SYNC_CHUNK_PREFIX));

    if (!isApplicationChange) return;

    if (changes[SYNC_META_KEY]) {
      const metaWriterDeviceId = changes[SYNC_META_KEY].newValue?.writerDeviceId;
      lastObservedSyncWriterDeviceId = typeof metaWriterDeviceId === 'string'
        ? metaWriterDeviceId
        : null;
    }

    const origin = areaName === STORAGE_MODES.SYNC
      && lastObservedSyncWriterDeviceId !== getDeviceId()
      ? 'other-device'
      : 'same-device';

    for (const listener of changeListeners) listener({ areaName, origin });
  });
  return {
    withDeviceLock,
    observeSyncWriter: writer => { lastObservedSyncWriterDeviceId = writer; },
    subscribe(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    }
  };
}
