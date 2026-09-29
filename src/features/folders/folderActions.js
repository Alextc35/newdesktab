import '../../types/types.js';
import { DEFAULT_FOLDER_STYLE } from '../../domain/folders/folderDefaults.js';
import { findFirstFreeSlot } from '../../shared/grid/gridPlacement.js';
import {
  cellKey,
  createFolderBookmarkLayout,
  FOLDER_GRID_CAPACITY,
  findFirstFreeFolderCell,
  isFolderCell
} from '../../domain/folders/folderGrid.js';
import {
  BOOKMARK_FOLDER_NAME_MAX_LENGTH,
  normalizeBookmarkFolderName,
  normalizeFolderStyle,
  validateFolderDraft
} from '../../domain/folders/folderModel.js';
import { getState, setState } from '../../state/appStore.js';
import { moveFolderToRecycleBin } from '../recycle-bin/recycleBinActions.js';
import { getGridItemsInGroup } from '../grid/gridSelectors.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceSelectors.js';

export { BOOKMARK_FOLDER_NAME_MAX_LENGTH };

/**
 * Creates a folder in the first free cell of the active workspace.
 * New folders start at one cell and can then be resized in edit mode.
 *
 * @param {string} name
 * @param {{columns: number, rows: number}} bounds
 * @param {Partial<BookmarkFolder>} appearance
 * @returns {BookmarkFolder|null}
 */
export function createBookmarkFolder(name, { columns, rows } = {}, appearance = {}) {
  const normalizedName = normalizeBookmarkFolderName(name);
  if (!normalizedName) return null;

  const { data } = getState();
  const groupId = getActiveWorkspaceId(data);
  const position = findFirstFreeSlot(getGridItemsInGroup(data, groupId), {
    columns,
    rows
  });
  if (!position) return null;

  const now = Date.now();
  const folder = {
    id: crypto.randomUUID(),
    name: normalizedName,
    ...normalizeFolderStyle({ ...DEFAULT_FOLDER_STYLE, ...appearance }),
    ...position,
    w: 1,
    h: 1,
    groupId,
    createdAt: now,
    updatedAt: now
  };

  setState({ data: { folders: [...data.folders, folder] } });
  return folder;
}

/** @returns {BookmarkFolder|null} */
export function renameBookmarkFolder(folderId, name) {
  const normalizedName = normalizeBookmarkFolderName(name);
  if (!normalizedName) return null;

  const { data: { folders } } = getState();
  let renamed = null;
  const updated = folders.map(folder => {
    if (folder.id !== folderId) return folder;
    renamed = { ...folder, name: normalizedName, updatedAt: Date.now() };
    return renamed;
  });
  if (!renamed) return null;

  setState({ data: { folders: updated } });
  return renamed;
}

/** Updates the editable identity and appearance of one folder. */
export function updateBookmarkFolder(folderId, draft) {
  const validation = validateFolderDraft(draft);
  if (!validation.isValid) return null;

  const { data: { folders } } = getState();
  let updatedFolder = null;
  const updated = folders.map(folder => {
    if (folder.id !== folderId) return folder;
    updatedFolder = {
      ...folder,
      ...validation.value,
      name: normalizeBookmarkFolderName(validation.value.name),
      updatedAt: Date.now()
    };
    return updatedFolder;
  });
  if (!updatedFolder?.name) return null;

  setState({ data: { folders: updated } });
  return updatedFolder;
}

/**
 * Moves a bookmark into a folder in the same workspace.
 *
 * @returns {Bookmark|null}
 */
export function addBookmarkToFolder(bookmarkId, folderId) {
  const { data: { bookmarks, folders } } = getState();
  const folder = folders.find(item => item.id === folderId);
  const bookmark = bookmarks.find(item => item.id === bookmarkId);
  const contents = bookmarks.filter(item => item.folderId === folderId);
  if (
    !folder
    || !bookmark
    || contents.length >= FOLDER_GRID_CAPACITY
    || (folder.groupId ?? null) !== (bookmark.groupId ?? null)
  ) return null;

  const layout = createFolderBookmarkLayout(contents);
  const occupied = new Set(
    Array.from(layout.values(), position => cellKey(position.gx, position.gy))
  );
  const position = findFirstFreeFolderCell(occupied);
  if (!position) return null;

  let moved = null;
  const updated = bookmarks.map(item => {
    if (item.id !== bookmarkId) return item;
    moved = { ...item, ...position, folderId, updatedAt: Date.now() };
    return moved;
  });

  setState({ data: { bookmarks: updated } });
  return moved;
}

/**
 * Commits a complete smart-drag preview inside one folder. All supplied
 * positions are validated and applied with legacy layout normalization in a
 * single store transition, so Sequence remains one undoable action.
 *
 * @param {string} folderId
 * @param {Iterable<{id: string, gx: number, gy: number}>} positions
 * @returns {Bookmark[]}
 */
export function updateFolderBookmarkPositions(folderId, positions) {
  const requested = new Map(Array.from(positions ?? [], position => [
    position.id,
    { gx: position.gx, gy: position.gy }
  ]));
  if (!requested.size) return [];

  const { data: { bookmarks } } = getState();
  const contents = bookmarks.filter(bookmark => bookmark.folderId === folderId);
  const contentIds = new Set(contents.map(bookmark => bookmark.id));
  if (Array.from(requested).some(([id, position]) => (
    !contentIds.has(id) || !isFolderCell(position.gx, position.gy)
  ))) return [];

  const layout = createFolderBookmarkLayout(contents);
  for (const [id, position] of requested) layout.set(id, position);

  const occupied = new Set();
  for (const position of layout.values()) {
    if (!isFolderCell(position.gx, position.gy)) continue;
    const key = cellKey(position.gx, position.gy);
    if (occupied.has(key)) return [];
    occupied.add(key);
  }

  const now = Date.now();
  const changed = [];
  const updated = bookmarks.map(bookmark => {
    if (bookmark.folderId !== folderId) return bookmark;
    const position = layout.get(bookmark.id);
    if (
      !position
      || (bookmark.gx === position.gx && bookmark.gy === position.gy)
    ) return bookmark;

    const next = { ...bookmark, ...position, updatedAt: now };
    changed.push(next);
    return next;
  });

  if (changed.length) setState({ data: { bookmarks: updated } });
  return changed;
}

/**
 * Returns a bookmark to the first free cell in its folder's workspace.
 *
 * @returns {{bookmark: Bookmark|null, reason: 'not-found'|'no-space'|null}}
 */
export function removeBookmarkFromFolder(bookmarkId, { columns, rows } = {}) {
  const { data } = getState();
  const bookmark = data.bookmarks.find(item => item.id === bookmarkId);
  const folder = data.folders.find(item => item.id === bookmark?.folderId);
  if (!bookmark || !folder) return { bookmark: null, reason: 'not-found' };

  const position = findFirstFreeSlot(
    getGridItemsInGroup(data, folder.groupId),
    { columns, rows, w: bookmark.w, h: bookmark.h }
  );
  if (!position) return { bookmark: null, reason: 'no-space' };

  const restored = {
    ...bookmark,
    ...position,
    folderId: null,
    updatedAt: Date.now()
  };
  setState({
    data: {
      bookmarks: data.bookmarks.map(item => (
        item.id === bookmarkId ? restored : item
      ))
    }
  });
  return { bookmark: restored, reason: null };
}

/**
 * Deletes a folder and every bookmark contained by it in one undoable change.
 *
 * @returns {{deleted: boolean, bookmarkCount: number}}
 */
export function deleteBookmarkFolder(folderId) {
  return moveFolderToRecycleBin(folderId);
}
