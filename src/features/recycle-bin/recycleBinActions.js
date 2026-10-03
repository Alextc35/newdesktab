import '../../types/types.js';
import { DEFAULT_RECYCLE_BIN } from '../../domain/recycle-bin/recycleBinDefaults.js';
import { clearBookmarkHistory, getState, setState } from '../../state/appStore.js';
import { normalizeRecycleBinStyle } from '../../domain/recycle-bin/recycleBinModel.js';
import { getRecycleBinRetentionMs } from '../../domain/settings/recycleBinRetention.js';
import {
  createBookmarkTrashEntry,
  createCollectionTrashEntries,
  createFolderTrashEntry,
  findRecycleBinPlacement,
  removeExpiredTrashEntries,
  restoreTrashEntriesInData
} from '../../domain/recycle-bin/recycleBinEntries.js';

/** Updates recycle bin appearance and grid visibility together. */
export async function updateRecycleBinAppearance(value = {}) {
  const { data } = getState();
  const showRecycleBin = value.showRecycleBin !== false;
  const recycleBin = {
    ...data.recycleBin,
    ...normalizeRecycleBinStyle(value),
    updatedAt: Date.now()
  };

  await setState({
    data: {
      recycleBin,
      settings: { ...data.settings, showRecycleBin }
    }
  });
  if (showRecycleBin) ensureRecycleBinPosition();
  return recycleBin;
}

/** Moves bookmarks to the recycle bin in one undoable state change. */
export function moveBookmarksToRecycleBin(bookmarkIds) {
  const ids = new Set(bookmarkIds);
  if (!ids.size) return 0;

  const { data } = getState();
  const deleted = data.bookmarks.filter(bookmark => ids.has(bookmark.id));
  if (!deleted.length) return 0;

  const deletedAt = Date.now();
  setState({
    data: {
      bookmarks: data.bookmarks.filter(bookmark => !ids.has(bookmark.id)),
      trash: [
        ...data.trash,
        ...deleted.map(bookmark => createBookmarkTrashEntry(bookmark, {
          id: createTrashId(),
          deletedAt
        }))
      ]
    }
  });
  return deleted.length;
}

/** Moves a folder and all of its contents to the recycle bin as one unit. */
export function moveFolderToRecycleBin(folderId) {
  const { data } = getState();
  const folder = data.folders.find(item => item.id === folderId);
  if (!folder) return { deleted: false, bookmarkCount: 0 };

  const children = data.bookmarks.filter(bookmark => bookmark.folderId === folderId);
  const childIds = new Set(children.map(bookmark => bookmark.id));
  setState({
    data: {
      bookmarks: data.bookmarks.filter(bookmark => !childIds.has(bookmark.id)),
      folders: data.folders.filter(item => item.id !== folderId),
      trash: [...data.trash, createFolderTrashEntry(folder, children, {
        id: createTrashId(),
        deletedAt: Date.now()
      })]
    }
  });
  return { deleted: true, bookmarkCount: children.length };
}

/** Moves a mixed selection of top-level bookmarks and folders in one undo step. */
export function moveGridItemsToRecycleBin({ bookmarkIds = [], folderIds = [] } = {}) {
  const requestedBookmarkIds = new Set(bookmarkIds);
  const requestedFolderIds = new Set(folderIds);
  if (!requestedBookmarkIds.size && !requestedFolderIds.size) {
    return { bookmarks: 0, folders: 0 };
  }

  const { data } = getState();
  const folders = data.folders.filter(folder => requestedFolderIds.has(folder.id));
  const existingFolderIds = new Set(folders.map(folder => folder.id));
  const folderChildren = data.bookmarks.filter(bookmark => existingFolderIds.has(bookmark.folderId));
  const folderChildIds = new Set(folderChildren.map(bookmark => bookmark.id));
  const bookmarks = data.bookmarks.filter(bookmark => (
    requestedBookmarkIds.has(bookmark.id) && !folderChildIds.has(bookmark.id)
  ));
  if (!bookmarks.length && !folders.length) return { bookmarks: 0, folders: 0 };

  const deletedAt = Date.now();
  const entries = folders.map(folder => createFolderTrashEntry(
    folder,
    folderChildren.filter(bookmark => bookmark.folderId === folder.id),
    { id: createTrashId(), deletedAt }
  ));
  entries.push(...bookmarks.map(bookmark => createBookmarkTrashEntry(bookmark, {
    id: createTrashId(),
    deletedAt
  })));
  const deletedBookmarkIds = new Set([
    ...folderChildIds,
    ...bookmarks.map(bookmark => bookmark.id)
  ]);

  setState({
    data: {
      bookmarks: data.bookmarks.filter(bookmark => !deletedBookmarkIds.has(bookmark.id)),
      folders: data.folders.filter(folder => !existingFolderIds.has(folder.id)),
      trash: [...data.trash, ...entries]
    }
  });
  return { bookmarks: bookmarks.length, folders: folders.length };
}

/** Moves all requested grid data to the recycle bin. */
export function moveAllToRecycleBin({ includeFolders = false } = {}) {
  const { data } = getState();
  const deletedAt = Date.now();

  if (!includeFolders) {
    if (!data.bookmarks.length) return true;
    setState({
      data: {
        bookmarks: [],
        trash: [
          ...data.trash,
          ...data.bookmarks.map(bookmark => createBookmarkTrashEntry(bookmark, {
            id: createTrashId(),
            deletedAt
          }))
        ]
      }
    });
    return true;
  }

  const entries = createCollectionEntries(data.bookmarks, data.folders, deletedAt);
  if (!entries.length) return true;

  setState({
    data: {
      bookmarks: [],
      folders: [],
      trash: [...data.trash, ...entries]
    }
  });
  return true;
}

/** Replaces an imported grid without permanently discarding the previous one. */
export async function replaceGridDataThroughRecycleBin(bookmarks, folders) {
  const { data } = getState();
  const entries = createCollectionEntries(data.bookmarks, data.folders, Date.now());
  await setState({
    data: {
      bookmarks,
      folders,
      trash: [...data.trash, ...entries]
    }
  });
  return entries.length;
}

/** Deletes a workspace while retaining its contents in the recycle bin. */
export function moveWorkspaceToRecycleBin(groupId, nextSettings) {
  const { data } = getState();
  const folders = data.folders.filter(folder => folder.groupId === groupId);
  const bookmarks = data.bookmarks.filter(bookmark => bookmark.groupId === groupId);
  const entries = createCollectionEntries(bookmarks, folders, Date.now());

  setState({
    data: {
      bookmarks: data.bookmarks.filter(bookmark => bookmark.groupId !== groupId),
      folders: data.folders.filter(folder => folder.groupId !== groupId),
      trash: [...data.trash, ...entries],
      settings: nextSettings
    }
  }, { recordHistory: false });
  return entries.length;
}

export function permanentlyDeleteTrashEntries(entryIds) {
  const ids = new Set(entryIds);
  if (!ids.size) return 0;
  const { data } = getState();
  const trash = data.trash.filter(entry => !ids.has(entry.id));
  const count = data.trash.length - trash.length;
  if (count) {
    setState({ data: { trash } }, { recordHistory: false });
    clearBookmarkHistory();
  }
  return count;
}

export function emptyRecycleBin() {
  const { data } = getState();
  if (!data.trash.length) return 0;
  const count = data.trash.length;
  setState({ data: { trash: [] } }, { recordHistory: false });
  clearBookmarkHistory();
  return count;
}

/** Permanently removes entries after their retention period. */
export function purgeExpiredRecycleBinEntries(now = Date.now()) {
  const { data } = getState();
  const retentionMs = getRecycleBinRetentionMs(data.settings.recycleBinRetentionDays);
  const result = removeExpiredTrashEntries(data.trash, now, retentionMs);
  if (result.removed) {
    setState({ data: { trash: result.trash } }, { recordHistory: false });
    clearBookmarkHistory();
  }
  return result.removed;
}

/** Restores entries where there is room, keeping skipped entries in the bin. */
export function restoreTrashEntries(entryIds) {
  const { data } = getState();
  const result = restoreTrashEntriesInData(data, entryIds, {
    now: () => Date.now(),
    createId: createTrashId
  });

  if (result.restored) {
    setState({
      data: {
        bookmarks: result.bookmarks,
        folders: result.folders,
        trash: result.trash
      }
    });
  }
  return { restored: result.restored, skipped: result.skipped };
}

export function restoreAllTrashEntries() {
  return restoreTrashEntries(getState().data.trash.map(entry => entry.id));
}

/** Relocates a newly shown or migrated recycle bin if its saved area is occupied. */
export function ensureRecycleBinPosition() {
  const { data } = getState();
  if (!data.settings.showRecycleBin) return true;
  const recycleBin = data.recycleBin ?? structuredClone(DEFAULT_RECYCLE_BIN);
  const position = findRecycleBinPlacement(data, recycleBin);
  if (!position) return false;
  if (position.gx === recycleBin.gx && position.gy === recycleBin.gy) return true;

  setState({
    data: {
      recycleBin: {
        ...recycleBin,
        ...position,
        groupId: null,
        updatedAt: Date.now()
      }
    }
  }, { recordHistory: false });
  return true;
}

function createCollectionEntries(bookmarks, folders, deletedAt) {
  return createCollectionTrashEntries(bookmarks, folders, {
    deletedAt,
    createId: createTrashId
  });
}

function createTrashId() {
  return crypto.randomUUID();
}
