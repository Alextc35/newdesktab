import '../../types/types.js';
import { GRID_COLS, GRID_ROWS } from '../../shared/grid/gridGeometry.js';
import {
  cellKey,
  createFolderBookmarkLayout,
  findFirstFreeFolderCell
} from '../folders/folderGrid.js';
import { getFolderRoots, getFolderTreeIds } from '../folders/folderTree.js';
import { findFirstFreeSlot, isAreaFree } from '../../shared/grid/gridPlacement.js';
import { resolveWorkspaceId } from '../workspaces/workspaceModel.js';
import {
  DEFAULT_RECYCLE_BIN_RETENTION_DAYS,
  getRecycleBinRetentionMs
} from '../settings/recycleBinRetention.js';

export const RECYCLE_BIN_RETENTION_DAYS = DEFAULT_RECYCLE_BIN_RETENTION_DAYS;
export const RECYCLE_BIN_RETENTION_MS = getRecycleBinRetentionMs(RECYCLE_BIN_RETENTION_DAYS);

/** Creates a detached trash entry without mutating the bookmark. */
export function createBookmarkTrashEntry(bookmark, { id, deletedAt }) {
  return {
    id,
    type: 'bookmark',
    deletedAt,
    bookmark: structuredClone(bookmark)
  };
}

/** Creates one atomic trash entry for a folder and all of its contents. */
export function createFolderTrashEntry(folder, bookmarks, { id, deletedAt, folders = [] }) {
  return {
    id,
    type: 'folder',
    deletedAt,
    folder: structuredClone(folder),
    bookmarks: structuredClone(bookmarks),
    ...(folders.length ? { folders: structuredClone(folders) } : {})
  };
}

/** Converts a complete grid collection into independently restorable entries. */
export function createCollectionTrashEntries(
  bookmarks,
  folders,
  { deletedAt, createId }
) {
  const folderIds = new Set(folders.map(folder => folder.id));
  return [
    ...getFolderRoots(folders).map(folder => {
      const treeIds = getFolderTreeIds(folders, [folder.id]);
      return createFolderTrashEntry(
        folder,
        bookmarks.filter(bookmark => treeIds.has(bookmark.folderId)),
        { id: createId(), deletedAt, folders: folders.filter(child => child.id !== folder.id && treeIds.has(child.id)) }
      );
    }),
    ...bookmarks
      .filter(bookmark => !folderIds.has(bookmark.folderId))
      .map(bookmark => createBookmarkTrashEntry(bookmark, {
        id: createId(),
        deletedAt
      }))
  ];
}

/** Returns the retained entries and removal count without changing the input. */
export function removeExpiredTrashEntries(
  trash,
  now,
  retentionMs = RECYCLE_BIN_RETENTION_MS
) {
  if (retentionMs === Infinity) return { trash, removed: 0 };
  const retained = trash.filter(entry => now - entry.deletedAt < retentionMs);
  return { trash: retained, removed: trash.length - retained.length };
}

/**
 * Restores requested entries into a new grid snapshot.
 *
 * The caller supplies time and ID generation so the domain operation remains
 * deterministic in tests and independent of browser APIs.
 */
export function restoreTrashEntriesInData(
  data,
  entryIds,
  { now, createId }
) {
  const requested = new Set(entryIds);
  if (!requested.size) {
    return {
      bookmarks: data.bookmarks,
      folders: data.folders,
      trash: data.trash,
      restored: 0,
      skipped: 0
    };
  }

  const selected = data.trash.filter(entry => requested.has(entry.id))
    .sort((a, b) => Number(b.type === 'folder') - Number(a.type === 'folder'));
  let bookmarks = structuredClone(data.bookmarks);
  let folders = structuredClone(data.folders);
  const restoredEntryIds = new Set();
  let restored = 0;
  let skipped = 0;

  for (const entry of selected) {
    if (entry.type === 'folder') {
      const result = restoreFolderEntry(entry, {
        data,
        bookmarks,
        folders,
        now,
        createId
      });
      if (!result) {
        skipped += 1;
        continue;
      }
      bookmarks = result.bookmarks;
      folders = result.folders;
    } else {
      const result = restoreBookmarkEntry(entry, {
        data,
        bookmarks,
        folders,
        now,
        createId
      });
      if (!result) {
        skipped += 1;
        continue;
      }
      bookmarks = result.bookmarks;
    }
    restoredEntryIds.add(entry.id);
    restored += 1;
  }

  return {
    bookmarks,
    folders,
    trash: restored
      ? data.trash.filter(entry => !restoredEntryIds.has(entry.id))
      : data.trash,
    restored,
    skipped
  };
}

/** Finds a valid placement for the recycle bin without changing application state. */
export function findRecycleBinPlacement(data, recycleBin) {
  const occupied = occupiedGridItems({
    ...data,
    settings: { ...data.settings, showRecycleBin: false }
  }, null);
  const fits = recycleBin.gx + recycleBin.w <= GRID_COLS
    && recycleBin.gy + recycleBin.h <= GRID_ROWS
    && isAreaFree(
      occupied,
      recycleBin.gx,
      recycleBin.gy,
      recycleBin.w,
      recycleBin.h
    );
  if (fits) return { gx: recycleBin.gx, gy: recycleBin.gy };

  return findFirstFreeSlot(occupied, {
    columns: GRID_COLS,
    rows: GRID_ROWS,
    w: recycleBin.w,
    h: recycleBin.h
  });
}

function restoreFolderEntry(entry, context) {
  const { data, bookmarks, folders, now, createId } = context;
  const parent = folders.find(folder => folder.id === entry.folder.parentId);
  const validGroupId = resolveWorkspaceId(
    data.settings.bookmarkGroups,
    parent ? parent.groupId : entry.folder.groupId
  );
  const usedIds = new Set([...folders, ...bookmarks, ...(data.widgets ?? []), data.recycleBin].filter(Boolean).map(item => item.id));
  const folderId = uniqueId(
    entry.folder.id,
    usedIds,
    createId
  );
  usedIds.add(folderId);
  const candidate = {
    ...structuredClone(entry.folder),
    id: folderId,
    parentId: parent?.id ?? null,
    groupId: validGroupId,
    updatedAt: now()
  };
  const position = parent
    ? findFolderRestorePosition(parent.id, bookmarks, folders)
    : findRestorePosition(candidate, occupiedGridItems({ ...data, bookmarks, folders }, validGroupId));
  if (!position) return null;

  const folder = { ...candidate, ...position };
  const folderIdMap = new Map([[entry.folder.id, folderId]]);
  for (const descendant of entry.folders ?? []) {
    const id = uniqueId(descendant.id, usedIds, createId);
    usedIds.add(id);
    folderIdMap.set(descendant.id, id);
  }
  const descendants = (entry.folders ?? []).map(descendant => ({
    ...structuredClone(descendant),
    id: folderIdMap.get(descendant.id),
    parentId: folderIdMap.get(descendant.parentId) ?? folderId,
    groupId: validGroupId,
    updatedAt: now()
  }));
  const children = entry.bookmarks.map(bookmark => {
    const id = uniqueId(bookmark.id, usedIds, createId);
    usedIds.add(id);
    return {
      ...structuredClone(bookmark),
      id,
      folderId: folderIdMap.get(bookmark.folderId) ?? folderId,
      groupId: validGroupId,
      updatedAt: now()
    };
  });
  return { bookmarks: [...bookmarks, ...children], folders: [...folders, folder, ...descendants] };
}

function restoreBookmarkEntry(entry, context) {
  const { data, bookmarks, folders, now, createId } = context;
  const bookmarkIds = new Set([...bookmarks, ...folders, ...(data.widgets ?? []), data.recycleBin].filter(Boolean).map(item => item.id));
  const id = uniqueId(entry.bookmark.id, bookmarkIds, createId);
  const original = {
    ...structuredClone(entry.bookmark),
    id,
    updatedAt: now()
  };
  const folder = folders.find(item => item.id === original.folderId);

  if (folder) {
    const position = findFolderRestorePosition(folder.id, bookmarks, folders);
    if (position) {
      return {
        bookmarks: [...bookmarks, {
          ...original,
          ...position,
          folderId: folder.id,
          groupId: folder.groupId
        }]
      };
    }
  }

  const groupId = resolveWorkspaceId(data.settings.bookmarkGroups, original.groupId);
  const candidate = { ...original, groupId, folderId: null };
  const position = findRestorePosition(candidate, occupiedGridItems(
    { ...data, bookmarks, folders },
    groupId
  ));
  if (!position) return null;
  return { bookmarks: [...bookmarks, { ...candidate, ...position }] };
}

function findRestorePosition(item, occupied) {
  const inBounds = item.gx >= 0 && item.gy >= 0
    && item.gx + item.w <= GRID_COLS
    && item.gy + item.h <= GRID_ROWS;
  if (inBounds && isAreaFree(occupied, item.gx, item.gy, item.w, item.h)) {
    return { gx: item.gx, gy: item.gy };
  }
  return findFirstFreeSlot(occupied, {
    columns: GRID_COLS,
    rows: GRID_ROWS,
    w: item.w,
    h: item.h
  });
}

function occupiedGridItems(data, groupId) {
  const normalizedGroupId = groupId ?? null;
  const items = [
    ...data.bookmarks.filter(bookmark => (
      !bookmark.folderId && (bookmark.groupId ?? null) === normalizedGroupId
    )),
    ...data.folders.filter(folder => (
      !folder.parentId && (folder.groupId ?? null) === normalizedGroupId
    )),
    ...(data.widgets ?? []).filter(widget => (widget.groupId ?? null) === normalizedGroupId)
  ];
  if (normalizedGroupId === null && data.settings.showRecycleBin) {
    items.push(data.recycleBin);
  }
  return items;
}

function findFolderRestorePosition(folderId, bookmarks, folders) {
  const contents = [
    ...bookmarks.filter(bookmark => bookmark.folderId === folderId),
    ...folders.filter(folder => folder.parentId === folderId)
  ];
  const layout = createFolderBookmarkLayout(contents);
  const occupied = new Set(Array.from(layout.values(), position => cellKey(position.gx, position.gy)));
  return findFirstFreeFolderCell(occupied);
}

function uniqueId(preferred, used, createId) {
  if (typeof preferred === 'string' && preferred && !used.has(preferred)) return preferred;
  let id = createId();
  while (used.has(id)) id = createId();
  return id;
}
