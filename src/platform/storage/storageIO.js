import { migratePersistedData as normalizePersistedData } from './dataSchema.js';
import { DATA_SCHEMA_VERSION } from './schemaVersion.js';
import { callStorage, getStorageBytes } from './chromeStorage.js';
import { decodeSyncPayload, encodeSyncPayload, getSyncChunkKeys, SYNC_CHUNK_PREFIX, SYNC_META_KEY, validateSyncMetadata } from '../sync/syncTransport.js';
import { saveDeviceImageSelections, withoutDeviceImages } from './deviceImageSelections.js';
import { saveDeviceTrash, withoutDeviceTrash } from './deviceTrashStorage.js';
import { saveDeviceWallpapers, withoutDeviceWallpapers } from './deviceWallpapers.js';
import { LEGACY_SYNC_KEYS } from './storageConstants.js';

/** Owns the local representation and quota-safe synchronized transport. */
export function createStorageIO({ getDeviceId, observeSyncWriter }) {
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

    observeSyncWriter(typeof meta.writerDeviceId === 'string' ? meta.writerDeviceId : null);

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
    await saveDeviceWallpapers(data);
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
    await saveDeviceWallpapers(normalized);
    await saveDeviceTrash(normalized);
    const shared = withoutDeviceWallpapers(withoutDeviceTrash(withoutDeviceImages(normalized)));
    const existing = await readSyncData();
    const existingTheme = existing?.settings?.theme;
    const legacyMedia = existingTheme?.legacyBackgroundMedia
      ?? (existing?.schemaVersion !== DATA_SCHEMA_VERSION ? existingTheme?.backgroundMedia : null);
    if (Array.isArray(legacyMedia) && legacyMedia.length) {
      const seed = normalizePersistedData(existing);
      seed.settings.theme.backgroundMedia = legacyMedia;
      shared.settings.theme.legacyBackgroundMedia = withoutDeviceImages(seed)
        .settings.theme.backgroundMedia;
      shared.settings.theme.legacyBackgroundRotationSeconds = existingTheme?.legacyBackgroundRotationSeconds
        ?? existingTheme?.backgroundRotationSeconds;
    }
    const encoded = encodeSyncPayload(shared, {
      schemaVersion: DATA_SCHEMA_VERSION,
      writerDeviceId: getDeviceId()
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
  return { readLocalData, readSyncData, writeLocalData, writeSyncData };
}
