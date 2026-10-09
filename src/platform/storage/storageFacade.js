import '../../types/types.js';
import { migratePersistedData } from './dataSchema.js';
import { mergeChanges } from '../../shared/data/mergeChanges.js';
import { callStorage } from './chromeStorage.js';
import { isSyncTransportKey, SYNC_FORMAT_VERSION, SYNC_META_KEY } from '../sync/syncTransport.js';
import { DATA_SCHEMA_VERSION } from './schemaVersion.js';
import { restoreDeviceImageSelections, saveDeviceImageSelections } from './deviceImageSelections.js';
import { clearDeviceTrash, restoreDeviceTrash, saveDeviceTrash } from './deviceTrashStorage.js';
import { prepareLegacyDeviceWallpapers, restoreDeviceWallpapers, saveDeviceWallpapers } from './deviceWallpapers.js';
import { STORAGE_MODES, STORAGE_MODE_KEY, SYNC_COMPATIBILITY_KEY, DEVICE_ID_KEY, LEGACY_SYNC_KEYS } from './storageConstants.js';
import { createStorageIO } from './storageIO.js';
import { createStorageUsageReader } from './storageUsage.js';
import { createStorageCoordination } from './storageCoordination.js';
import { placeConcurrentAdditions } from './concurrentPlacement.js';
export { STORAGE_MODES } from './storageConstants.js';

/** @type {'local'|'sync'} */
let activeMode = STORAGE_MODES.LOCAL;
let initialized = false;

/** @type {string|null} */
let deviceId = null;

/** @type {SyncCompatibilityBlock|null} */
let syncCompatibility = null;

let lastCommit = null;
const coordination = createStorageCoordination({
  getMode: () => activeMode,
  onModeChanged: mode => { activeMode = mode; },
  getDeviceId: () => deviceId
});
const { withDeviceLock } = coordination;
const { readLocalData, readSyncData, writeLocalData, writeSyncData } = createStorageIO({
  getDeviceId: () => deviceId,
  observeSyncWriter: coordination.observeSyncWriter
});
const getStorageUsage = createStorageUsageReader(() => activeMode);


/**
 * Returns a complete, cloned data object and fills missing nested settings.
 *
 * @param {Partial<PersistedData>|null|undefined} data
 * @returns {PersistedData}
 */
function normalizePersistedData(data) {
  return migratePersistedData(data);
}

function isNewDeskTabSyncKey(key) {
  return isSyncTransportKey(key) || LEGACY_SYNC_KEYS.includes(key);
}

/**
 * Reads lightweight information about the remote NewDeskTab payload without
 * hydrating or migrating it.
 *
 * @returns {Promise<{hasData: boolean, updatedAt: number|null}>}
 */
async function getSyncMetadata() {
  const values = await callStorage(chrome.storage.sync, 'get', null);
  const syncKeys = Object.keys(values).filter(isNewDeskTabSyncKey);
  const updatedAt = values[SYNC_META_KEY]?.updatedAt;

  return {
    hasData: syncKeys.length > 0,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null
  };
}

/**
 * Deletes only NewDeskTab-owned values from synchronized extension storage.
 *
 * @returns {Promise<boolean>} Whether any synchronized values were removed.
 */
async function clearSyncData() {
  const values = await callStorage(chrome.storage.sync, 'get', null);
  const keys = Object.keys(values).filter(isNewDeskTabSyncKey);

  if (keys.length) await callStorage(chrome.storage.sync, 'remove', keys);
  await clearSyncCompatibility();
  return keys.length > 0;
}

/**
 * Reads raw application data from a selected storage area.
 *
 * @param {'local'|'sync'} mode
 * @returns {Promise<Partial<PersistedData>|null>}
 */
function readData(mode) {
  return mode === STORAGE_MODES.SYNC ? readSyncData() : readLocalData();
}

/**
 * Writes application data to a selected storage area.
 *
 * @param {'local'|'sync'} mode
 * @param {PersistedData} data
 * @returns {Promise<void>}
 */
function writeData(mode, data) {
  return mode === STORAGE_MODES.SYNC
    ? writeSyncData(data)
    : writeLocalData(data);
}

/**
 * Initializes the per-device storage preference.
 *
 * @returns {Promise<'local'|'sync'>}
 */
async function initialize() {
  if (initialized) return activeMode;
  return withDeviceLock(initializeLocked);
}

async function initializeLocked() {
  if (initialized) return activeMode;

  const result = await callStorage(
    chrome.storage.local,
    'get',
    [STORAGE_MODE_KEY, SYNC_COMPATIBILITY_KEY, DEVICE_ID_KEY]
  );
  deviceId = typeof result[DEVICE_ID_KEY] === 'string'
    && result[DEVICE_ID_KEY].length > 0
    ? result[DEVICE_ID_KEY]
    : crypto.randomUUID();

  if (result[DEVICE_ID_KEY] !== deviceId) {
    await callStorage(chrome.storage.local, 'set', {
      [DEVICE_ID_KEY]: deviceId
    });
  }

  syncCompatibility = normalizeSyncCompatibility(
    result[SYNC_COMPATIBILITY_KEY]
  );

  if (syncCompatibility) {
    activeMode = STORAGE_MODES.LOCAL;
    if (result[STORAGE_MODE_KEY] !== STORAGE_MODES.LOCAL) {
      await callStorage(chrome.storage.local, 'set', {
        [STORAGE_MODE_KEY]: STORAGE_MODES.LOCAL
      });
    }
  } else {
    activeMode = result[STORAGE_MODE_KEY] === STORAGE_MODES.SYNC
      ? STORAGE_MODES.SYNC
      : STORAGE_MODES.LOCAL;

    if (result[SYNC_COMPATIBILITY_KEY] !== undefined) {
      await callStorage(chrome.storage.local, 'remove', SYNC_COMPATIBILITY_KEY);
    }
  }
  // Persist the initial IDs once: otherwise each new tab invents a different
  // identity for the same starter bookmarks before the first user save.
  if (activeMode === STORAGE_MODES.LOCAL && await readLocalData() === null) {
    await writeLocalData(normalizePersistedData(null));
  }
  initialized = true;

  return activeMode;
}

/**
 * Keeps only compatibility blocks that still require a newer NewDeskTab build.
 * Stale blocks disappear automatically after the extension is upgraded.
 *
 * @param {*} value
 * @returns {SyncCompatibilityBlock|null}
 */
function normalizeSyncCompatibility(value) {
  if (!value || value.reason !== 'newer-sync-data') return null;

  const requiredSchemaVersion = Number.isInteger(value.requiredSchemaVersion)
    ? value.requiredSchemaVersion
    : null;
  const requiredSyncFormatVersion = Number.isInteger(value.requiredSyncFormatVersion)
    ? value.requiredSyncFormatVersion
    : null;
  const stillBlocked = (
    requiredSchemaVersion > DATA_SCHEMA_VERSION
    || requiredSyncFormatVersion > SYNC_FORMAT_VERSION
  );
  if (!stillBlocked) return null;

  return {
    reason: 'newer-sync-data',
    requiredSchemaVersion,
    supportedSchemaVersion: DATA_SCHEMA_VERSION,
    requiredSyncFormatVersion,
    supportedSyncFormatVersion: SYNC_FORMAT_VERSION,
    detectedAt: Number.isFinite(value.detectedAt) ? value.detectedAt : Date.now()
  };
}

/** @param {*} error */
function isNewerSyncDataError(error) {
  return error?.code === 'UNSUPPORTED_DATA_VERSION'
    || error?.code === 'UNSUPPORTED_SYNC_FORMAT';
}

/**
 * Switches this device to its compatible local data without modifying the
 * newer synchronized payload.
 *
 * @param {*} error
 * @returns {Promise<PersistedData>}
 */
async function fallBackToLocalData(error) {
  const localData = normalizePersistedData(await readLocalData());
  syncCompatibility = {
    reason: 'newer-sync-data',
    requiredSchemaVersion: Number.isInteger(error.requiredSchemaVersion)
      ? error.requiredSchemaVersion
      : null,
    supportedSchemaVersion: DATA_SCHEMA_VERSION,
    requiredSyncFormatVersion: Number.isInteger(error.requiredSyncFormatVersion)
      ? error.requiredSyncFormatVersion
      : null,
    supportedSyncFormatVersion: SYNC_FORMAT_VERSION,
    detectedAt: Date.now()
  };

  await callStorage(chrome.storage.local, 'set', {
    [STORAGE_MODE_KEY]: STORAGE_MODES.LOCAL,
    [SYNC_COMPATIBILITY_KEY]: syncCompatibility
  });
  activeMode = STORAGE_MODES.LOCAL;
  return localData;
}

/**
 * Treats a missing payload as a remote Sync deletion. This covers devices
 * which were closed when another device deleted the cloud data: on their next
 * read they restore their device-only trash into the last local snapshot and
 * leave Sync without recreating the deleted payload.
 *
 * @returns {Promise<PersistedData>}
 */
async function fallBackToLocalDataAfterSyncDeletion() {
  let localData = normalizePersistedData(await readLocalData());
  localData = normalizePersistedData(await restoreDeviceTrash(localData));
  await writeLocalData(localData);
  await clearDeviceTrash();
  await callStorage(chrome.storage.local, 'set', {
    [STORAGE_MODE_KEY]: STORAGE_MODES.LOCAL
  });
  activeMode = STORAGE_MODES.LOCAL;
  return localData;
}

async function clearSyncCompatibility() {
  syncCompatibility = null;
  await callStorage(chrome.storage.local, 'remove', SYNC_COMPATIBILITY_KEY);
}

function createSyncCompatibilityError() {
  const error = new Error('Sync requires a newer version of NewDeskTab.');
  error.code = 'SYNC_REQUIRES_NEWER_VERSION';
  return error;
}

/**
 * Promise-based storage facade with per-device Local/Sync selection.
 */
export const storage = {
  initialize,
  getSyncMetadata,
  getUsage: getStorageUsage,
  clearSyncData,

  /** Serializes read/merge/write across pages of this extension on this device. */
  async commit(base, next) {
    await initialize();
    const commit = async () => {
      const latest = await storage.get(null);
      // Reuse the canonical form of our previous write (including timestamps
      // supplied by migration) when the caller still has its original draft.
      const normalizedBase = lastCommit?.mode === activeMode
        && JSON.stringify(lastCommit.input) === JSON.stringify(base)
        ? lastCommit.data
        : normalizePersistedData(base);
      const normalizedNext = normalizePersistedData(next);
      const data = mergeChanges(normalizedBase, normalizedNext, latest);
      const rebased = JSON.stringify(latest) !== JSON.stringify(normalizedBase);
      if (rebased) placeConcurrentAdditions(normalizedBase, latest, data);
      await writeData(activeMode, data);
      lastCommit = { input: structuredClone(next), data: structuredClone(data), mode: activeMode };
      return {
        data,
        rebased
      };
    };
    return withDeviceLock(commit);
  },

  /** @returns {'local'|'sync'} */
  getMode() {
    return activeMode;
  },

  /** @returns {SyncCompatibilityBlock|null} */
  getSyncCompatibility() {
    return syncCompatibility ? structuredClone(syncCompatibility) : null;
  },

  /**
   * Retrieves persisted data from the active area.
   *
   * @param {keyof PersistedData | (keyof PersistedData)[] | null} keys
   * @returns {Promise<PersistedData | Partial<PersistedData>>}
   */
  async get(keys) {
    await initialize();
    const requestedMode = activeMode;
    let persistedData = null;
    let data;

    try {
      persistedData = await readData(requestedMode);
      data = requestedMode === STORAGE_MODES.SYNC && persistedData === null
        ? await fallBackToLocalDataAfterSyncDeletion()
        : normalizePersistedData(persistedData);
    } catch (error) {
      if (requestedMode !== STORAGE_MODES.SYNC || !isNewerSyncDataError(error)) {
        throw error;
      }

      data = await fallBackToLocalData(error);
    }

    if (requestedMode === STORAGE_MODES.SYNC && activeMode === STORAGE_MODES.SYNC) {
      data = normalizePersistedData(await restoreDeviceTrash(data));
    }
    data = await restoreDeviceImageSelections(await prepareLegacyDeviceWallpapers(data));
    data = await restoreDeviceWallpapers(data);

    // Rewrite legacy synchronized payloads once their trash has safely moved
    // to this device. Future reads then avoid downloading those entries.
    if (requestedMode === STORAGE_MODES.SYNC
      && activeMode === STORAGE_MODES.SYNC
      && persistedData
      && Object.hasOwn(persistedData, 'trash')) {
      await writeSyncData(data);
    }

    if (keys === null) return data;

    const requestedKeys = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(requestedKeys.map(key => [key, data[key]]));
  },

  /**
   * Persists bookmarks and/or settings in the active area.
   *
   * @param {Partial<PersistedData>} data
   * @returns {Promise<void>}
   */
  async set(data) {
    await initialize();

    const isComplete = data.bookmarks !== undefined
      && data.folders !== undefined
      && data.widgets !== undefined
      && data.settings !== undefined;
    const nextData = isComplete
      ? normalizePersistedData(data)
      : normalizePersistedData({
          ...(await storage.get(null)),
          ...data
        });

    await writeData(activeMode, nextData);
  },

  /**
   * Removes persisted keys from the active area.
   *
   * @param {keyof PersistedData | (keyof PersistedData)[]} keys
   * @returns {Promise<void>}
   */
  async remove(keys) {
    await initialize();
    const requestedKeys = Array.isArray(keys) ? keys : [keys];
    const current = await storage.get(null);

    for (const key of requestedKeys) delete current[key];
    await writeData(activeMode, normalizePersistedData(current));
  },

  /**
   * Changes the per-device storage mode.
   *
   * Local -> Sync uses existing cloud data when present; otherwise it uploads
   * the current device data. Sync -> Local keeps a local copy of current data.
   * Remote sync data is never deleted when disabling synchronization.
   *
   * @param {'local'|'sync'} mode
   * @param {PersistedData} currentData
   * @returns {Promise<{data: PersistedData, source: 'unchanged'|'existing'|'migrated'}>}
   */
  async changeMode(mode, currentData) {
    await initialize();

    if (!Object.values(STORAGE_MODES).includes(mode)) {
      throw new TypeError(`Unsupported storage mode: ${mode}`);
    }

    if (mode === STORAGE_MODES.SYNC && syncCompatibility) {
      throw createSyncCompatibilityError();
    }

    if (mode === activeMode) {
      return {
        data: normalizePersistedData(currentData),
        source: 'unchanged'
      };
    }

    let nextData = normalizePersistedData(currentData);
    let source = 'migrated';

    if (mode === STORAGE_MODES.SYNC) {
      let existingSyncData;

      try {
        existingSyncData = await readSyncData();
        if (existingSyncData) normalizePersistedData(existingSyncData);
      } catch (error) {
        if (!isNewerSyncDataError(error)) throw error;
        await fallBackToLocalData(error);
        throw createSyncCompatibilityError();
      }

      if (existingSyncData) {
        await saveDeviceImageSelections(nextData);
        await saveDeviceWallpapers(nextData);
        await saveDeviceTrash(nextData);
        nextData = normalizePersistedData(
          await restoreDeviceTrash(normalizePersistedData(existingSyncData))
        );
        nextData = await restoreDeviceImageSelections(
          await prepareLegacyDeviceWallpapers(nextData)
        );
        nextData = await restoreDeviceWallpapers(nextData);
        await writeSyncData(nextData);
        source = 'existing';
      } else {
        await writeSyncData(nextData);
      }
    } else {
      await writeLocalData(nextData);
      await clearDeviceTrash();
    }

    await callStorage(chrome.storage.local, 'set', {
      [STORAGE_MODE_KEY]: mode
    });
    activeMode = mode;

    return { data: nextData, source };
  },

  /**
   * Subscribes to persisted-data changes in the currently active area.
   *
   * @param {(change: {
   *   areaName: 'local'|'sync',
   *   origin: 'same-device'|'other-device'
   * }) => void} listener
   * @returns {() => void}
   */
  subscribe(listener) {
    return coordination.subscribe(listener);
  }
};
