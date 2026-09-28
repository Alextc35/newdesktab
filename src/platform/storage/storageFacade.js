import '../../types/types.js'; // typedefs
import { migratePersistedData } from './dataSchema.js';
import { mergeChanges } from '../../shared/data/mergeChanges.js';
import { findFirstFreeSlot, isAreaFree } from '../../shared/grid/gridPlacement.js';
import { GRID_COLS, GRID_ROWS } from '../../shared/grid/gridGeometry.js';
import { DATA_SCHEMA_VERSION } from './schemaVersion.js';
import { callStorage, getStorageBytes } from './chromeStorage.js';
import {
  decodeSyncPayload,
  encodeSyncPayload,
  getSyncChunkKeys,
  isSyncTransportKey,
  SYNC_CHUNK_PREFIX,
  SYNC_FORMAT_VERSION,
  SYNC_META_KEY,
  tryDecodeSyncPayload,
  validateSyncMetadata
} from '../sync/syncTransport.js';
import {
  DEVICE_IMAGE_SELECTIONS_KEY,
  restoreDeviceImageSelections,
  saveDeviceImageSelections,
  withoutDeviceImages
} from './deviceImageSelections.js';
import {
  clearDeviceTrash,
  DEVICE_TRASH_KEY,
  restoreDeviceTrash,
  saveDeviceTrash,
  withoutDeviceTrash
} from './deviceTrashStorage.js';

export const STORAGE_MODES = Object.freeze({
  LOCAL: 'local',
  SYNC: 'sync'
});

const STORAGE_MODE_KEY = 'newdesktabStorageMode';
const SYNC_COMPATIBILITY_KEY = 'newdesktabSyncCompatibility';
const DEVICE_ID_KEY = 'newdesktabDeviceId';
const LOCAL_IMAGE_STORAGE_PREFIX = 'newdesktabLocalImage:';
const LEGACY_SYNC_KEYS = [
  'schemaVersion',
  'bookmarks',
  'folders',
  'widgets',
  'recycleBin',
  'trash',
  'settings'
];
const SYNC_LOCAL_SYSTEM_KEYS = new Set(['schemaVersion', 'settings', 'recycleBin']);
const SYNC_LOCAL_BOOKMARK_KEYS = new Set(['bookmarks', 'folders']);

/** @type {'local'|'sync'} */
let activeMode = STORAGE_MODES.LOCAL;
let initialized = false;

/** @type {string|null} */
let deviceId = null;

/** @type {string|null} */
let lastObservedSyncWriterDeviceId = null;

/** @type {SyncCompatibilityBlock|null} */
let syncCompatibility = null;

/** @type {Set<() => void>} */
const changeListeners = new Set();
let lastCommit = null;

/**
 * Returns a complete, cloned data object and fills missing nested settings.
 *
 * @param {Partial<PersistedData>|null|undefined} data
 * @returns {PersistedData}
 */
function normalizePersistedData(data) {
  return migratePersistedData(data);
}

function emptyStorageBreakdown() {
  return { systemBytes: 0, bookmarkBytes: 0, trashBytes: 0 };
}

function getEntryBytes(key, value) {
  return getStorageBytes({ [key]: value });
}

async function getStorageEntryBytes(area, values) {
  const entries = await Promise.all(Object.entries(values).map(async ([key, value]) => {
    const bytes = typeof area.getBytesInUse === 'function'
      ? await callStorage(area, 'getBytesInUse', key)
      : getEntryBytes(key, value);
    return [key, bytes];
  }));

  return new Map(entries);
}

function getMeasuredEntryBytes(entryBytes, key, value) {
  return entryBytes.get(key) ?? getEntryBytes(key, value);
}

function addBreakdownBytes(breakdown, category, bytes) {
  breakdown[`${category}Bytes`] += bytes;
}

function hasBookmarkData(data) {
  return (Array.isArray(data.bookmarks) && data.bookmarks.length > 0)
    || (Array.isArray(data.folders) && data.folders.length > 0);
}

function hasTrashData(data) {
  return Array.isArray(data.trash) && data.trash.length > 0;
}

function reconcileStorageBreakdown(breakdown, usedBytes) {
  const bookmarkBytes = Math.min(usedBytes, Math.max(0, breakdown.bookmarkBytes));
  const trashBytes = Math.min(
    usedBytes - bookmarkBytes,
    Math.max(0, breakdown.trashBytes)
  );

  return {
    systemBytes: usedBytes - bookmarkBytes - trashBytes,
    bookmarkBytes,
    trashBytes
  };
}

function getLocalImageCategories(values) {
  const categories = new Map();
  const selections = values[DEVICE_IMAGE_SELECTIONS_KEY];
  if (!selections || typeof selections !== 'object' || Array.isArray(selections)) {
    return categories;
  }

  for (const [slot, selection] of Object.entries(selections)) {
    const reference = typeof selection === 'string'
      ? selection
      : selection?.reference;
    if (typeof reference !== 'string' || !reference.startsWith('newdesktab-local-image:')) {
      continue;
    }

    const category = slot.startsWith('trash:')
      ? 'trash'
      : slot === 'theme' ? 'theme'
        : slot.startsWith('folder:') ? 'folder'
          : 'bookmark';
    const previous = categories.get(reference);
    categories.set(reference, !previous || previous === category ? category : 'other');
  }

  return categories;
}

function emptyLocalImageBreakdown() {
  return {
    totalBytes: 0,
    themeBytes: 0,
    bookmarkBytes: 0,
    folderBytes: 0,
    trashBytes: 0,
    otherBytes: 0
  };
}

function getLocalImageBreakdown(values, entryBytes, imageCategories) {
  const breakdown = emptyLocalImageBreakdown();

  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(LOCAL_IMAGE_STORAGE_PREFIX)) continue;

    const reference = `newdesktab-local-image:${key.slice(LOCAL_IMAGE_STORAGE_PREFIX.length)}`;
    const category = imageCategories.get(reference) ?? 'other';
    const bytes = getMeasuredEntryBytes(entryBytes, key, value);
    breakdown.totalBytes += bytes;
    breakdown[`${category}Bytes`] += bytes;
  }

  return breakdown;
}

function getDirectStorageBreakdown(values, entryBytes, {
  includeLocalImages = false,
  deviceTrashOnly = false,
  includeTrash = true
} = {}) {
  const breakdown = emptyStorageBreakdown();
  const containsBookmarks = hasBookmarkData(values);
  const containsDirectTrash = !deviceTrashOnly && hasTrashData(values);
  const containsDeviceTrash = deviceTrashOnly
    && Array.isArray(values[DEVICE_TRASH_KEY])
    && values[DEVICE_TRASH_KEY].length > 0;
  const imageCategories = includeLocalImages
    ? getLocalImageCategories(values)
    : new Map();

  for (const [key, value] of Object.entries(values)) {
    let category = 'system';
    if ((key === 'bookmarks' || key === 'folders') && containsBookmarks) {
      category = 'bookmark';
    } else if (includeTrash && ((key === 'trash' && containsDirectTrash)
      || (key === DEVICE_TRASH_KEY && containsDeviceTrash))) {
      category = 'trash';
    } else if (includeLocalImages && key.startsWith(LOCAL_IMAGE_STORAGE_PREFIX)) {
      const reference = `newdesktab-local-image:${key.slice(LOCAL_IMAGE_STORAGE_PREFIX.length)}`;
      const imageCategory = imageCategories.get(reference);
      if (imageCategory === 'bookmark' || imageCategory === 'folder') {
        category = 'bookmark';
      } else if (includeTrash && imageCategory === 'trash') {
        category = 'trash';
      }
    }

    addBreakdownBytes(breakdown, category, getMeasuredEntryBytes(entryBytes, key, value));
  }

  return breakdown;
}

function getLocalStorageBreakdown(values, entryBytes, { deviceTrashOnly = false } = {}) {
  const breakdown = {
    localSystemBytes: 0,
    syncSystemBytes: 0,
    syncBookmarkBytes: 0,
    trashBytes: 0
  };
  const containsDirectTrash = !deviceTrashOnly && hasTrashData(values);
  const containsDeviceTrash = deviceTrashOnly
    && Array.isArray(values[DEVICE_TRASH_KEY])
    && values[DEVICE_TRASH_KEY].length > 0;
  const imageCategories = getLocalImageCategories(values);

  for (const [key, value] of Object.entries(values)) {
    let category = 'localSystemBytes';
    if (SYNC_LOCAL_BOOKMARK_KEYS.has(key)) {
      category = 'syncBookmarkBytes';
    } else if (SYNC_LOCAL_SYSTEM_KEYS.has(key)) {
      category = 'syncSystemBytes';
    } else if ((key === 'trash' && containsDirectTrash)
      || (key === DEVICE_TRASH_KEY && containsDeviceTrash)) {
      category = 'trashBytes';
    } else if (key.startsWith(LOCAL_IMAGE_STORAGE_PREFIX)) {
      const reference = `newdesktab-local-image:${key.slice(LOCAL_IMAGE_STORAGE_PREFIX.length)}`;
      if (imageCategories.get(reference) === 'trash') category = 'trashBytes';
    }

    breakdown[category] += getMeasuredEntryBytes(entryBytes, key, value);
  }

  return breakdown;
}

function reconcileLocalStorageBreakdown(breakdown, usedBytes) {
  const syncSystemBytes = Math.min(usedBytes, Math.max(0, breakdown.syncSystemBytes));
  const syncBookmarkBytes = Math.min(
    usedBytes - syncSystemBytes,
    Math.max(0, breakdown.syncBookmarkBytes)
  );
  const trashBytes = Math.min(
    usedBytes - syncSystemBytes - syncBookmarkBytes,
    Math.max(0, breakdown.trashBytes)
  );

  return {
    localSystemBytes: usedBytes - syncSystemBytes - syncBookmarkBytes - trashBytes,
    syncSystemBytes,
    syncBookmarkBytes,
    trashBytes
  };
}

function getEscapedPayloadWeight(data) {
  return new TextEncoder().encode(JSON.stringify(JSON.stringify(data))).length;
}

function getChunkedSyncBreakdown(values, entryBytes) {
  const payload = tryDecodeSyncPayload(values);
  if (!payload) {
    return getDirectStorageBreakdown(values, entryBytes, { includeTrash: false });
  }

  const breakdown = emptyStorageBreakdown();
  const chunkKeys = Object.keys(values).filter(key => key.startsWith(SYNC_CHUNK_PREFIX));
  const chunkBytes = chunkKeys.reduce(
    (sum, key) => sum + getMeasuredEntryBytes(entryBytes, key, values[key]),
    0
  );
  const nonBookmarkPayload = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !['bookmarks', 'folders'].includes(key))
  );
  if (hasBookmarkData(payload)) {
    breakdown.bookmarkBytes = Math.min(
      chunkBytes,
      Math.max(0, getEscapedPayloadWeight(payload) - getEscapedPayloadWeight(nonBookmarkPayload))
    );
  }
  breakdown.systemBytes = Array.from(entryBytes.values()).reduce((sum, bytes) => sum + bytes, 0)
    - breakdown.bookmarkBytes;
  return breakdown;
}

/**
 * Reads raw local data. A null result means that the extension has not
 * persisted application data on this device yet.
 *
 * @returns {Promise<Partial<PersistedData>|null>}
 */
async function readLocalData() {
  const result = await callStorage(
    chrome.storage.local,
    'get',
    LEGACY_SYNC_KEYS
  );

  if (
    result.schemaVersion === undefined &&
    result.bookmarks === undefined &&
    result.folders === undefined &&
    result.widgets === undefined &&
    result.recycleBin === undefined &&
    result.trash === undefined &&
    result.settings === undefined
  ) {
    return null;
  }

  return {
    schemaVersion: result.schemaVersion,
    bookmarks: result.bookmarks,
    folders: result.folders,
    widgets: result.widgets,
    recycleBin: result.recycleBin,
    trash: result.trash,
    settings: result.settings
  };
}

/**
 * Reads the chunked sync payload. It also accepts the original direct-key
 * shape, making the migration tolerant of early development builds.
 *
 * @returns {Promise<Partial<PersistedData>|null>}
 */
async function readSyncData() {
  const header = await callStorage(
    chrome.storage.sync,
    'get',
    [SYNC_META_KEY, ...LEGACY_SYNC_KEYS]
  );

  const meta = header[SYNC_META_KEY];

  if (!meta) {
    if (
      header.schemaVersion === undefined &&
      header.bookmarks === undefined &&
      header.folders === undefined &&
      header.widgets === undefined &&
      header.recycleBin === undefined &&
      header.trash === undefined &&
      header.settings === undefined
    ) {
      return null;
    }

    return {
      schemaVersion: header.schemaVersion,
      bookmarks: header.bookmarks,
      folders: header.folders,
      widgets: header.widgets,
      recycleBin: header.recycleBin,
      trash: header.trash,
      settings: header.settings
    };
  }

  lastObservedSyncWriterDeviceId = typeof meta.writerDeviceId === 'string'
    ? meta.writerDeviceId
    : null;

  validateSyncMetadata(meta);
  const keys = getSyncChunkKeys(meta.chunkCount);
  const values = await callStorage(chrome.storage.sync, 'get', keys);
  return decodeSyncPayload(meta, values);
}

/**
 * Writes the simple local representation used by existing installations.
 *
 * @param {PersistedData} data
 * @returns {Promise<void>}
 */
async function writeLocalData(data) {
  await saveDeviceImageSelections(data);
  await callStorage(chrome.storage.local, 'set', normalizePersistedData(data));
}

/**
 * Writes application data to storage.sync using quota-safe chunks.
 *
 * @param {PersistedData} data
 * @returns {Promise<void>}
 */
async function writeSyncData(data) {
  const normalized = normalizePersistedData(data);
  await saveDeviceImageSelections(normalized);
  await saveDeviceTrash(normalized);
  const shared = withoutDeviceTrash(withoutDeviceImages(normalized));
  const encoded = encodeSyncPayload(shared, {
    schemaVersion: DATA_SCHEMA_VERSION,
    writerDeviceId: deviceId
  });
  const { chunks, items } = encoded;
  const previous = await callStorage(
    chrome.storage.sync,
    'get',
    [SYNC_META_KEY, ...LEGACY_SYNC_KEYS, ...chunks.map((_, index) => `${SYNC_CHUNK_PREFIX}${index}`)]
  );
  const previousChunkCount = previous[SYNC_META_KEY]?.chunkCount ?? 0;

  // A device-only image change does not need a new synchronized write.
  if (previous[SYNC_META_KEY]?.schemaVersion === DATA_SCHEMA_VERSION
    && previousChunkCount === chunks.length
    && chunks.every((chunk, index) => previous[`${SYNC_CHUNK_PREFIX}${index}`] === chunk)) {
    return;
  }

  const quotaBytes = chrome.storage.sync.QUOTA_BYTES ?? 102400;
  if (getStorageBytes(items) > quotaBytes) {
    const error = new Error('NewDeskTab data exceeds the synchronized storage quota.');
    error.code = 'SYNC_QUOTA_EXCEEDED';
    throw error;
  }

  await callStorage(chrome.storage.sync, 'set', items);

  const staleKeys = previousChunkCount > chunks.length
    ? getSyncChunkKeys(previousChunkCount).slice(chunks.length)
    : [];

  const legacyKeys = LEGACY_SYNC_KEYS.filter(
    key => previous[key] !== undefined
  );
  const keysToRemove = [...staleKeys, ...legacyKeys];

  if (keysToRemove.length) {
    await callStorage(chrome.storage.sync, 'remove', keysToRemove);
  }
}

/**
 * Reports quota usage for one browser storage area.
 *
 * @param {'local'|'sync'} mode
 * @returns {Promise<{
 *   mode: 'local'|'sync',
 *   usedBytes: number,
 *   quotaBytes: number,
 *   availableBytes: number,
 *   breakdown: {
 *     systemBytes: number,
 *     bookmarkBytes: number,
 *     trashBytes: number
 *   },
 *   localBreakdown?: {
 *     localSystemBytes: number,
 *     syncSystemBytes: number,
 *     syncBookmarkBytes: number,
 *     trashBytes: number
 *   },
 *   imageBreakdown?: {
 *     totalBytes: number,
 *     themeBytes: number,
 *     bookmarkBytes: number,
 *     folderBytes: number,
 *     trashBytes: number,
 *     otherBytes: number
 *   }
 * }>}
 */
async function getStorageUsage(mode) {
  if (!Object.values(STORAGE_MODES).includes(mode)) {
    throw new TypeError(`Unsupported storage mode: ${mode}`);
  }

  const area = chrome.storage[mode];
  const fallbackQuota = mode === STORAGE_MODES.SYNC ? 102400 : 10485760;
  const quotaBytes = Number.isFinite(area.QUOTA_BYTES)
    ? area.QUOTA_BYTES
    : fallbackQuota;
  const values = await callStorage(area, 'get', null);
  const usedBytes = typeof area.getBytesInUse === 'function'
    ? await callStorage(area, 'getBytesInUse', null)
    : getStorageBytes(values);
  const entryBytes = await getStorageEntryBytes(area, values);
  const deviceTrashOnly = mode === STORAGE_MODES.LOCAL && activeMode === STORAGE_MODES.SYNC;
  const measuredBreakdown = mode === STORAGE_MODES.SYNC && values[SYNC_META_KEY]
    ? getChunkedSyncBreakdown(values, entryBytes)
    : getDirectStorageBreakdown(values, entryBytes, {
        includeLocalImages: mode === STORAGE_MODES.LOCAL,
        deviceTrashOnly,
        includeTrash: mode === STORAGE_MODES.LOCAL
      });
  const localBreakdown = mode === STORAGE_MODES.LOCAL
    ? reconcileLocalStorageBreakdown(
        getLocalStorageBreakdown(values, entryBytes, { deviceTrashOnly }),
        usedBytes
      )
    : undefined;
  const imageBreakdown = mode === STORAGE_MODES.LOCAL
    ? getLocalImageBreakdown(values, entryBytes, getLocalImageCategories(values))
    : undefined;

  return {
    mode,
    usedBytes,
    quotaBytes,
    availableBytes: Math.max(0, quotaBytes - usedBytes),
    breakdown: reconcileStorageBreakdown(measuredBreakdown, usedBytes),
    ...(localBreakdown ? { localBreakdown } : {}),
    ...(imageBreakdown ? { imageBreakdown } : {})
  };
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

function withDeviceLock(operation) {
  if (globalThis.navigator?.locks) {
    return navigator.locks.request('newdesktab-persistence', operation);
  }
  // Non-browser unit harnesses have no shared origin or other pages.
  if (typeof window !== 'undefined') throw new Error('Web Locks are required to save safely.');
  return operation();
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
    data = await restoreDeviceImageSelections(data);

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
        await saveDeviceTrash(nextData);
        nextData = normalizePersistedData(
          await restoreDeviceTrash(normalizePersistedData(existingSyncData))
        );
        nextData = await restoreDeviceImageSelections(nextData);
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
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  }
};

/** Two tabs can reserve the same free cell before either one saves. */
function placeConcurrentAdditions(base, latest, data) {
  const previousIds = new Set([
    ...base.bookmarks,
    ...base.folders,
    ...base.widgets,
    ...latest.bookmarks,
    ...latest.folders,
    ...latest.widgets
  ].map(item => item.id));
  const items = [
    ...data.folders,
    ...data.widgets,
    ...data.bookmarks.filter(bookmark => !bookmark.folderId)
  ];
  const occupied = [
    ...(data.settings.showRecycleBin ? [data.recycleBin] : []),
    ...items.filter(item => previousIds.has(item.id))
  ];
  for (const item of items.filter(item => !previousIds.has(item.id))) {
    const group = occupied.filter(other => (other.groupId ?? null) === (item.groupId ?? null));
    if (!isAreaFree(group, item.gx, item.gy, item.w, item.h)) {
      const position = findFirstFreeSlot(group, {
        columns: GRID_COLS, rows: GRID_ROWS, w: item.w, h: item.h
      });
      // If the workspace filled concurrently, keep the record at its requested
      // position rather than dropping user data. It remains available in search
      // and List view even when another card occupies that grid cell.
      if (position) Object.assign(item, position);
    }
    occupied.push(item);
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === STORAGE_MODES.LOCAL
    && (changes[DEVICE_IMAGE_SELECTIONS_KEY] || changes[DEVICE_TRASH_KEY])) {
    for (const listener of changeListeners) listener({ areaName, origin: 'same-device' });
  }

  if (areaName === STORAGE_MODES.LOCAL && changes[STORAGE_MODE_KEY]) {
    activeMode = changes[STORAGE_MODE_KEY].newValue === STORAGE_MODES.SYNC
      ? STORAGE_MODES.SYNC
      : STORAGE_MODES.LOCAL;

    for (const listener of changeListeners) {
      listener({ areaName, origin: 'same-device' });
    }
    return;
  }

  if (areaName !== activeMode) return;

  const changedKeys = Object.keys(changes);
  const hasLegacySyncChange = LEGACY_SYNC_KEYS.some(key => changes[key] !== undefined);
  const isApplicationChange = activeMode === STORAGE_MODES.LOCAL
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
    && lastObservedSyncWriterDeviceId !== deviceId
    ? 'other-device'
    : 'same-device';

  for (const listener of changeListeners) listener({ areaName, origin });
});
