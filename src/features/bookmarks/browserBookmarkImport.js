import {
  countBrowserBookmarks,
  parseBrowserBookmarksHtml,
  prepareBrowserBookmarkImport
} from '../../domain/bookmarks/browserBookmarkImport.js';
import {
  clearBookmarkHistory, getState, getStorageMode, requirePersistence, setState,
  waitForPersistence
} from '../../state/appStore.js';
import { migratePersistedData } from '../../platform/storage/dataSchema.js';
import { encodeSyncPayload } from '../../platform/sync/syncTransport.js';
import { getStorageBytes } from '../../platform/storage/chromeStorage.js';
import { withoutDeviceImages } from '../../platform/storage/deviceImageSelections.js';
import { withoutDeviceTrash } from '../../platform/storage/deviceTrashStorage.js';
import { withoutDeviceWallpapers } from '../../platform/storage/deviceWallpapers.js';
import { DATA_SCHEMA_VERSION } from '../../platform/storage/schemaVersion.js';
import { mergeChanges } from '../../shared/data/mergeChanges.js';

let importing = false;

/** Reads a snapshot; native Chrome bookmarks are never changed by this feature. */
export async function detectChromeBookmarks() {
  if (!globalThis.chrome?.bookmarks?.getTree) {
    return { available: false, tree: [], bookmarkCount: 0, folderCount: 0, skippedCount: 0 };
  }
  const tree = await new Promise((resolve, reject) => {
    const result = chrome.bookmarks.getTree(value => {
      const error = chrome.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve(value);
    });
    // This also supports Promise-only browser wrappers and harnesses.
    if (result?.then) result.then(resolve, reject);
  });
  return { available: true, tree, ...countBrowserBookmarks(tree) };
}

export async function importChromeBookmarks({ tree, workspaceName = 'Google Chrome' } = {}) {
  const snapshot = tree ?? (await detectChromeBookmarks()).tree;
  return importTree(snapshot, { source: 'chrome', workspaceName });
}

/** Accepts either a File selected by the user or its already-read HTML text. */
export async function importBrowserBookmarksHtml(fileOrText, { workspaceName = 'Imported bookmarks' } = {}) {
  const html = typeof fileOrText === 'string' ? fileOrText : await fileOrText?.text();
  const tree = parseBrowserBookmarksHtml(html);
  return importTree(tree, { source: 'html', workspaceName });
}

/** Imports a user-selected subset while retaining the source's stable identities. */
export function importBrowserBookmarkTree(tree, { source = 'chrome', workspaceName = 'Imported bookmarks' } = {}) {
  return importTree(tree, { source, workspaceName });
}

async function importTree(tree, options) {
  if (importing) {
    const error = new Error('A bookmark import is already in progress.');
    error.code = 'BOOKMARK_IMPORT_IN_PROGRESS';
    throw error;
  }
  importing = true;
  try {
    await waitForPersistence();
    await requirePersistence({ allowIdle: true });
    const previous = getState().data;
    const prepared = prepareBrowserBookmarkImport(tree, previous, options);
    const { data, ...result } = prepared;
    const normalized = migratePersistedData(data, { useDefaultsWhenEmpty: false });
    validateImportQuota(normalized);
    try {
      await setState({ data: normalized }, { recordHistory: false });
      await requirePersistence();
    } catch (error) {
      // setState is optimistic. Restore the original snapshot on failed writes
      // so retrying cannot leave half an import or a misleading success state.
      const current = getState().data;
      const restored = mergeChanges(normalized, previous, current);
      if (current.settings.activeBookmarkGroupId !== normalized.settings.activeBookmarkGroupId) {
        restored.settings.activeBookmarkGroupId = current.settings.activeBookmarkGroupId;
      }
      await setState({ data: restored }, { recordHistory: false });
      clearBookmarkHistory();
      throw error;
    }
    clearBookmarkHistory();
    return result;
  } finally {
    importing = false;
  }
}

function validateImportQuota(data) {
  if (getStorageMode() !== 'sync') return;
  const shared = withoutDeviceWallpapers(withoutDeviceTrash(withoutDeviceImages(data)));
  const { items } = encodeSyncPayload(shared, {
    schemaVersion: DATA_SCHEMA_VERSION, writerDeviceId: null
  });
  const quotaBytes = chrome.storage.sync.QUOTA_BYTES ?? 102400;
  // Real metadata includes a device UUID. Keep a small margin for that field.
  if (getStorageBytes(items) + 128 > quotaBytes) {
    const error = new Error('This collection is too large for Chrome Sync. Switch to Local mode and import again.');
    error.code = 'SYNC_QUOTA_EXCEEDED';
    throw error;
  }
}
