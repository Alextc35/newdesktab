import { callStorage, getStorageBytes } from './chromeStorage.js';
import { tryDecodeSyncPayload, SYNC_CHUNK_PREFIX, SYNC_META_KEY } from '../sync/syncTransport.js';
import { DEVICE_IMAGE_SELECTIONS_KEY } from './deviceImageSelections.js';
import { DEVICE_TRASH_KEY } from './deviceTrashStorage.js';
import { DEVICE_WALLPAPERS_KEY } from './deviceWallpapers.js';
import { STORAGE_MODES, LOCAL_IMAGE_STORAGE_PREFIX, SYNC_LOCAL_SYSTEM_KEYS, SYNC_LOCAL_BOOKMARK_KEYS } from './storageConstants.js';

function emptyStorageBreakdown() {
  return { systemBytes: 0, bookmarkBytes: 0, folderBytes: 0, trashBytes: 0 };
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
  const bookmarkBytes = Math.min(
    usedBytes,
    Math.max(0, breakdown.bookmarkBytes) + Math.max(0, breakdown.folderBytes)
  );
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
  for (const [slot, selection] of Object.entries(
    selections && typeof selections === 'object' && !Array.isArray(selections) ? selections : {}
  )) {
    const reference = typeof selection === 'string'
      ? selection
      : selection?.reference;
    if (typeof reference !== 'string' || !reference.startsWith('newdesktab-local-image:')) {
      continue;
    }

    const category = slot.startsWith('trash:') || slot === 'recycleBin'
      ? 'trash'
      : slot === 'theme' || slot.startsWith('theme:') ? 'theme'
        : slot.startsWith('folder:') ? 'folder'
          : slot === 'bookmarkDefault' || slot.startsWith('bookmark:') || slot.startsWith('preset:') ? 'bookmark'
            : 'other';
    const previous = categories.get(reference);
    categories.set(reference, !previous || previous === category ? category : 'other');
  }

  const wallpaperMedia = values[DEVICE_WALLPAPERS_KEY]?.media;
  for (const item of Array.isArray(wallpaperMedia) ? wallpaperMedia : []) {
    const reference = item?.backgroundImageLocal;
    if (typeof reference !== 'string' || !reference.startsWith('newdesktab-local-image:')) continue;
    const previous = categories.get(reference);
    categories.set(reference, !previous || previous === 'theme' ? 'theme' : 'other');
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
  const containsDirectTrash = !deviceTrashOnly && hasTrashData(values);
  const containsDeviceTrash = deviceTrashOnly
    && Array.isArray(values[DEVICE_TRASH_KEY])
    && values[DEVICE_TRASH_KEY].length > 0;
  const imageCategories = includeLocalImages
    ? getLocalImageCategories(values)
    : new Map();

  for (const [key, value] of Object.entries(values)) {
    let category = 'system';
    if (key === 'bookmarks' && Array.isArray(value) && value.length > 0) {
      category = 'bookmark';
    } else if (key === 'folders' && Array.isArray(value) && value.length > 0) {
      category = 'folder';
    } else if (includeTrash && ((key === 'trash' && containsDirectTrash)
      || (key === DEVICE_TRASH_KEY && containsDeviceTrash))) {
      category = 'trash';
    } else if (includeLocalImages && key.startsWith(LOCAL_IMAGE_STORAGE_PREFIX)) {
      const reference = `newdesktab-local-image:${key.slice(LOCAL_IMAGE_STORAGE_PREFIX.length)}`;
      const imageCategory = imageCategories.get(reference);
      if (imageCategory === 'bookmark') {
        category = 'bookmark';
      } else if (imageCategory === 'folder') {
        category = 'folder';
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
    const withoutBookmarks = Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== 'bookmarks')
    );
    const includesBookmarks = Array.isArray(payload.bookmarks) && payload.bookmarks.length > 0;
    const includesFolders = Array.isArray(payload.folders) && payload.folders.length > 0;
    const bookmarkBytes = includesBookmarks
      ? getEscapedPayloadWeight(payload) - getEscapedPayloadWeight(withoutBookmarks)
      : 0;
    const folderBytes = includesFolders
      ? (includesBookmarks ? getEscapedPayloadWeight(withoutBookmarks) : getEscapedPayloadWeight(payload))
        - getEscapedPayloadWeight(nonBookmarkPayload)
      : 0;
    const totalEntryBytes = Math.min(chunkBytes, Math.max(0, bookmarkBytes + folderBytes));
    breakdown.folderBytes = Math.min(totalEntryBytes, Math.max(0, folderBytes));
    breakdown.bookmarkBytes = totalEntryBytes - breakdown.folderBytes;
  }
  breakdown.systemBytes = Array.from(entryBytes.values()).reduce((sum, bytes) => sum + bytes, 0)
    - breakdown.bookmarkBytes - breakdown.folderBytes;
  return breakdown;
}


/** Creates the quota reader with the current per-device mode supplied by the facade. */
export function createStorageUsageReader(getMode) {
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
   *   folderBytes: number,
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
   *   },
   *   widgetBytes: number
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
    const deviceTrashOnly = mode === STORAGE_MODES.LOCAL && getMode() === STORAGE_MODES.SYNC;
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
    const imageCategories = mode === STORAGE_MODES.LOCAL
      ? getLocalImageCategories(values)
      : undefined;
    const imageBreakdown = imageCategories
      ? getLocalImageBreakdown(values, entryBytes, imageCategories)
      : undefined;
    const widgetBytes = getWidgetStorageBytes(mode, values, entryBytes);
    const breakdown = reconcileStorageBreakdown(measuredBreakdown, usedBytes);
    const folderBytes = Math.min(
      breakdown.bookmarkBytes,
      Math.max(0, measuredBreakdown.folderBytes)
    );

    return {
      mode,
      usedBytes,
      quotaBytes,
      availableBytes: Math.max(0, quotaBytes - usedBytes),
      breakdown,
      folderBytes,
      ...(localBreakdown ? { localBreakdown } : {}),
      ...(imageBreakdown ? { imageBreakdown } : {}),
      widgetBytes
    };
  }

  function getWidgetStorageBytes(mode, values, entryBytes) {
    if (mode === STORAGE_MODES.SYNC && values[SYNC_META_KEY]) {
      const payload = tryDecodeSyncPayload(values);
      if (!Array.isArray(payload?.widgets) || !payload.widgets.length) return 0;

      const withoutWidgets = Object.fromEntries(
        Object.entries(payload).filter(([key]) => key !== 'widgets')
      );
      const chunkBytes = Object.keys(values)
        .filter(key => key.startsWith(SYNC_CHUNK_PREFIX))
        .reduce((sum, key) => sum + getMeasuredEntryBytes(entryBytes, key, values[key]), 0);
      const estimatedBytes = getEscapedPayloadWeight(payload) - getEscapedPayloadWeight(withoutWidgets);
      return Math.min(chunkBytes, Math.max(0, estimatedBytes));
    }

    return Array.isArray(values.widgets) && values.widgets.length
      ? getMeasuredEntryBytes(entryBytes, 'widgets', values.widgets)
      : 0;
  }
  return getStorageUsage;
}
