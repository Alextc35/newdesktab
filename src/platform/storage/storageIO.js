import { migratePersistedData as normalizePersistedData } from './dataSchema.js';
import { DATA_SCHEMA_VERSION } from './schemaVersion.js';
import { callStorage, getStorageBytes } from './chromeStorage.js';
import { decodeSyncPayload, encodeSyncPayload, getSyncChunkKeys, SYNC_CHUNK_PREFIX, SYNC_META_KEY } from '../sync/syncTransport.js';
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
    let readError;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Sync is bounded to about 100 KiB. Read its header and chunks together;
      // the optional checksum also catches partially delivered remote writes.
      const values = await callStorage(chrome.storage.sync, 'get', null);
      const meta = values[SYNC_META_KEY];

      if (!meta) {
        if (!LEGACY_SYNC_KEYS.some(key => values[key] !== undefined)) {
          // Chunks can arrive before their header. They are incomplete data,
          // rather than evidence that another device deleted Sync.
          if (Object.keys(values).some(key => key.startsWith(SYNC_CHUNK_PREFIX))) {
            readError = new Error('The synchronized NewDeskTab data is incomplete.');
            continue;
          }
          return null;
        }

        return Object.fromEntries(LEGACY_SYNC_KEYS.map(key => [key, values[key]]));
      }

      let data;
      try {
        data = decodeSyncPayload(meta, values);
      } catch (error) {
        if (error.code === 'UNSUPPORTED_SYNC_FORMAT') throw error;
        readError = error;
        continue;
      }

      const latest = await callStorage(chrome.storage.sync, 'get', SYNC_META_KEY);
      if (JSON.stringify(latest[SYNC_META_KEY]) !== JSON.stringify(meta)) {
        readError = new Error('The synchronized NewDeskTab data changed while being read.');
        continue;
      }

      observeSyncWriter(typeof meta.writerDeviceId === 'string' ? meta.writerDeviceId : null);
      return data;
    }

    // The store schedules delayed refreshes if remote chunks are still arriving.
    throw readError;
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
      && previous[SYNC_META_KEY]?.payloadChecksum === encoded.meta.payloadChecksum
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
