import '../../types/types.js';
import {
  applyBookmarkPreset,
  normalizeBookmark
} from '../../domain/bookmarks/bookmarkModel.js';
import { DEFAULT_FOLDER_STYLE } from '../../domain/folders/folderDefaults.js';
import { resolveWorkspaceId } from '../../domain/workspaces/workspaceModel.js';
import { findFirstFreeSlot } from '../../shared/grid/gridPlacement.js';
import { clearBookmarkHistory, getState, setState } from '../../state/appStore.js';
import { getGridItemsInGroup } from './gridSelectors.js';
import { getWorkspaces } from '../workspaces/workspaceSelectors.js';

/**
 * Updates grid rectangles across every persisted grid-item collection in one
 * state transition, keeping a mixed smart-drag operation atomic and undoable.
 *
 * @param {Map<string, Partial<Pick<GridItem, 'gx'|'gy'|'w'|'h'>>>} updates
 * @returns {Array<GridItem>}
 */
export function updateGridItemsByIds(updates) {
  if (!(updates instanceof Map) || !updates.size) return [];

  const { data } = getState();
  const changed = [];
  const now = Date.now();
  const updateItem = item => {
    const patch = updates.get(item.id);
    if (!patch) return item;

    const rectangle = {
      gx: patch.gx ?? item.gx,
      gy: patch.gy ?? item.gy,
      w: patch.w ?? item.w,
      h: patch.h ?? item.h
    };
    if (
      !Number.isInteger(rectangle.gx) || rectangle.gx < 0
      || !Number.isInteger(rectangle.gy) || rectangle.gy < 0
      || !Number.isInteger(rectangle.w) || rectangle.w < 1
      || !Number.isInteger(rectangle.h) || rectangle.h < 1
    ) return item;

    if (
      rectangle.gx === item.gx
      && rectangle.gy === item.gy
      && rectangle.w === item.w
      && rectangle.h === item.h
    ) return item;

    const updated = { ...item, ...rectangle, updatedAt: now };
    changed.push(updated);
    return updated;
  };

  const bookmarks = data.bookmarks.map(updateItem);
  const folders = data.folders.map(updateItem);
  const widgets = (data.widgets ?? []).map(updateItem);
  const recycleBin = updateItem(data.recycleBin);
  if (changed.length) setState({ data: { bookmarks, folders, widgets, recycleBin } });
  return changed;
}

/** Applies the appropriate default appearance to bookmarks and folders atomically. */
export function applyDefaultStylesToGridItems(selectedItems, bookmarkPreset) {
  const { bookmarkIds, folderIds } = selectedSets(selectedItems);
  if (!bookmarkIds.size && !folderIds.size) return { bookmarks: 0, folders: 0 };

  const { data } = getState();
  const now = Date.now();
  let bookmarkCount = 0;
  let folderCount = 0;
  const bookmarks = data.bookmarks.map(bookmark => {
    if (!bookmarkIds.has(bookmark.id)) return bookmark;
    bookmarkCount += 1;
    return normalizeBookmark({
      ...bookmark,
      ...applyBookmarkPreset(bookmark, bookmarkPreset),
      updatedAt: now
    }, { now });
  });
  const folders = data.folders.map(folder => {
    if (!folderIds.has(folder.id)) return folder;
    folderCount += 1;
    return {
      ...folder,
      ...structuredClone(DEFAULT_FOLDER_STYLE),
      updatedAt: now
    };
  });

  if (bookmarkCount || folderCount) setState({ data: { bookmarks, folders } });
  return { bookmarks: bookmarkCount, folders: folderCount };
}

/**
 * Duplicates top-level bookmarks and complete folders into free grid cells.
 * Folder children receive new identities and remain inside the cloned folder.
 */
export function duplicateGridItems(selectedItems, {
  columns,
  rows,
  nameSuffix = 'copy'
} = {}) {
  const { bookmarkIds, folderIds } = selectedSets(selectedItems);
  const { data } = getState();
  const selectedFolderChildIds = new Set(data.bookmarks
    .filter(bookmark => folderIds.has(bookmark.folderId))
    .map(bookmark => bookmark.id));
  const sources = [
    ...data.bookmarks
      .filter(bookmark => bookmarkIds.has(bookmark.id) && !selectedFolderChildIds.has(bookmark.id))
      .map(item => ({ kind: 'bookmark', item })),
    ...data.folders
      .filter(folder => folderIds.has(folder.id))
      .map(item => ({ kind: 'folder', item }))
  ].sort(compareGridSources);
  if (!sources.length) return { duplicates: [], skipped: 0 };

  const occupied = [
    ...data.bookmarks.filter(bookmark => !bookmark.folderId),
    ...data.folders,
    ...(data.widgets ?? []),
    ...(data.settings.showRecycleBin ? [data.recycleBin] : [])
  ];
  const duplicateBookmarks = [];
  const duplicateFolders = [];
  const duplicates = [];
  let skipped = 0;

  for (const source of sources) {
    const groupId = source.item.groupId ?? null;
    const position = findFirstFreeSlot(occupied.filter(item => (
      (item.groupId ?? null) === groupId
    )), {
      columns,
      rows,
      w: source.item.w,
      h: source.item.h
    });
    if (!position) {
      skipped += 1;
      continue;
    }

    if (source.kind === 'bookmark') {
      const duplicate = createBookmarkDuplicate(source.item, position, nameSuffix);
      duplicateBookmarks.push(duplicate);
      duplicates.push({ kind: 'bookmark', item: duplicate });
      occupied.push(duplicate);
      continue;
    }

    const duplicate = createFolderDuplicate(source.item, position, nameSuffix);
    const children = data.bookmarks
      .filter(bookmark => bookmark.folderId === source.item.id)
      .map(bookmark => createFolderChildDuplicate(bookmark, duplicate));
    duplicateFolders.push(duplicate);
    duplicateBookmarks.push(...children);
    duplicates.push({ kind: 'folder', item: duplicate });
    occupied.push(duplicate);
  }

  if (duplicates.length) {
    setState({
      data: {
        bookmarks: [...data.bookmarks, ...duplicateBookmarks],
        folders: [...data.folders, ...duplicateFolders]
      }
    });
  }
  return { duplicates, skipped };
}

/** Moves selected bookmarks, complete folders and widgets to another workspace atomically. */
export function moveGridItemsToWorkspace(selectedItems, workspaceId, { columns, rows } = {}) {
  const { bookmarkIds, folderIds, widgetIds } = selectedSets(selectedItems);
  const { data } = getState();
  const normalizedGroupId = resolveWorkspaceId(
    getWorkspaces(data),
    workspaceId
  );
  const selectedFolderChildIds = new Set(data.bookmarks
    .filter(bookmark => folderIds.has(bookmark.folderId))
    .map(bookmark => bookmark.id));
  const sources = [
    ...data.bookmarks
      .filter(bookmark => (
        bookmarkIds.has(bookmark.id)
        && !selectedFolderChildIds.has(bookmark.id)
        && (bookmark.groupId ?? null) !== normalizedGroupId
      ))
      .map(item => ({ kind: 'bookmark', item })),
    ...data.folders
      .filter(folder => (
        folderIds.has(folder.id)
        && (folder.groupId ?? null) !== normalizedGroupId
      ))
      .map(item => ({ kind: 'folder', item })),
    ...(data.widgets ?? [])
      .filter(widget => (
        widgetIds.has(widget.id)
        && (widget.groupId ?? null) !== normalizedGroupId
      ))
      .map(item => ({ kind: 'widget', item }))
  ].sort(compareGridSources);
  if (!sources.length) return { moved: 0, skipped: 0 };

  const occupied = getGridItemsInGroup(data, normalizedGroupId);
  const replacements = new Map();
  const movedFolderIds = new Set();
  let moved = 0;
  let skipped = 0;
  const now = Date.now();

  for (const source of sources) {
    const position = findFirstFreeSlot(occupied, {
      columns,
      rows,
      w: source.item.w,
      h: source.item.h
    });
    if (!position) {
      skipped += 1;
      continue;
    }

    const replacement = {
      ...source.item,
      ...position,
      groupId: normalizedGroupId,
      ...(source.kind === 'bookmark' ? { folderId: null } : {}),
      updatedAt: now
    };
    replacements.set(`${source.kind}:${source.item.id}`, replacement);
    if (source.kind === 'folder') movedFolderIds.add(source.item.id);
    occupied.push(replacement);
    moved += 1;
  }

  if (moved) {
    const bookmarks = data.bookmarks.map(bookmark => {
      const replacement = replacements.get(`bookmark:${bookmark.id}`);
      if (replacement) return replacement;
      if (!movedFolderIds.has(bookmark.folderId)) return bookmark;
      return { ...bookmark, groupId: normalizedGroupId, updatedAt: now };
    });
    const folders = data.folders.map(folder => (
      replacements.get(`folder:${folder.id}`) ?? folder
    ));
    const widgets = (data.widgets ?? []).map(widget => (
      replacements.get(`widget:${widget.id}`) ?? widget
    ));
    setState({ data: { bookmarks, folders, widgets } });
  }
  return { moved, skipped };
}

/** Permanently deletes one live bookmark, complete folder or widget without undo history. */
export function permanentlyDeleteGridItem(kind, itemId) {
  const { data } = getState();
  if (kind === 'bookmark') {
    const bookmarks = data.bookmarks.filter(bookmark => bookmark.id !== itemId);
    if (bookmarks.length === data.bookmarks.length) {
      return { deleted: false, bookmarkCount: 0 };
    }
    setState({ data: { bookmarks } }, { recordHistory: false });
    clearBookmarkHistory();
    return { deleted: true, bookmarkCount: 1 };
  }

  if (kind === 'widget') {
    const widgets = (data.widgets ?? []).filter(widget => widget.id !== itemId);
    if (widgets.length === (data.widgets ?? []).length) {
      return { deleted: false, bookmarkCount: 0 };
    }
    setState({ data: { widgets } }, { recordHistory: false });
    clearBookmarkHistory();
    return { deleted: true, bookmarkCount: 0 };
  }

  if (kind !== 'folder' || !data.folders.some(folder => folder.id === itemId)) {
    return { deleted: false, bookmarkCount: 0 };
  }

  const bookmarkCount = data.bookmarks.filter(bookmark => bookmark.folderId === itemId).length;
  setState({
    data: {
      bookmarks: data.bookmarks.filter(bookmark => bookmark.folderId !== itemId),
      folders: data.folders.filter(folder => folder.id !== itemId)
    }
  }, { recordHistory: false });
  clearBookmarkHistory();
  return { deleted: true, bookmarkCount };
}

function selectedSets(selectedItems) {
  const bookmarkIds = new Set();
  const folderIds = new Set();
  const widgetIds = new Set();
  for (const selected of selectedItems ?? []) {
    if (selected?.kind === 'bookmark') bookmarkIds.add(selected.id);
    if (selected?.kind === 'folder') folderIds.add(selected.id);
    if (selected?.kind === 'widget') widgetIds.add(selected.id);
  }
  return { bookmarkIds, folderIds, widgetIds };
}

function compareGridSources(a, b) {
  return (a.item.groupId ?? '').localeCompare(b.item.groupId ?? '')
    || a.item.gy - b.item.gy
    || a.item.gx - b.item.gx
    || a.item.id.localeCompare(b.item.id);
}

function createBookmarkDuplicate(bookmark, position, nameSuffix) {
  const duplicate = structuredClone(bookmark);
  delete duplicate.id;
  delete duplicate.createdAt;
  delete duplicate.updatedAt;
  return normalizeBookmark({
    ...duplicate,
    ...position,
    folderId: null,
    name: `${bookmark.name} (${nameSuffix})`
  });
}

function createFolderDuplicate(folder, position, nameSuffix) {
  const now = Date.now();
  return {
    ...structuredClone(folder),
    id: crypto.randomUUID(),
    ...position,
    name: `${folder.name} (${nameSuffix})`,
    createdAt: now,
    updatedAt: now
  };
}

function createFolderChildDuplicate(bookmark, folder) {
  const duplicate = structuredClone(bookmark);
  delete duplicate.id;
  delete duplicate.createdAt;
  delete duplicate.updatedAt;
  return normalizeBookmark({
    ...duplicate,
    groupId: folder.groupId,
    folderId: folder.id
  });
}
