import {
  normalizeBookmarkUrl,
  validateBookmarkDraft
} from '../../domain/bookmarks/bookmarkModel.js';
import {
  cellKey,
  createFolderBookmarkLayout,
  findFirstFreeFolderCell
} from '../../domain/folders/folderGrid.js';
import { getGridItemsInGroup } from '../grid/gridSelectors.js';
import { findFirstFreeSlot } from '../../shared/grid/gridPlacement.js';
import { GRID_COLS, GRID_ROWS } from '../../shared/grid/gridGeometry.js';
import { getActiveWorkspaceId, getWorkspaces } from '../workspaces/workspaceSelectors.js';

/** The popup only saves ordinary web pages, never extension or browser UI URLs. */
export function isSaveableTabUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function getQuickSaveWorkspaces(data) {
  return [
    { id: null },
    ...getWorkspaces(data)
  ];
}

export function getQuickSaveFolders(data, groupId) {
  return data.folders.filter(folder => (folder.groupId ?? null) === groupId);
}

const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid'
]);

/**
 * Compares the page identity, not incidental URL decoration. Distinct path or
 * meaningful query values remain distinct (for example two YouTube videos).
 */
export function getQuickSavePageKey(value) {
  try {
    const url = new URL(normalizeBookmarkUrl(value));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const query = Array.from(url.searchParams)
      .filter(([key]) => !key.toLowerCase().startsWith('utm_')
        && !TRACKING_PARAMS.has(key.toLowerCase()))
      .sort(([keyA, valueA], [keyB, valueB]) => (
        keyA.localeCompare(keyB) || valueA.localeCompare(valueB)
      ));
    const search = new URLSearchParams(query).toString();
    return `${host}${url.port ? `:${url.port}` : ''}${path}?${search}`;
  } catch {
    return null;
  }
}

/** Matches across all workspaces and folders, preserving saved-item order. */
export function getQuickSaveMatches(data, url) {
  const key = getQuickSavePageKey(url);
  if (!key) return [];
  return data.bookmarks.filter(bookmark => getQuickSavePageKey(bookmark.url) === key);
}

/**
 * Plans one bookmark against a fresh data snapshot. A folder has its own
 * compact grid; bookmarks outside folders use the regular workspace grid.
 */
export function prepareQuickBookmark(data, {
  name,
  url,
  groupId = getActiveWorkspaceId(data),
  folderId = null,
  allowDuplicate = false
}) {
  if (!isSaveableTabUrl(url)) return { reason: 'unsupported-url' };
  const workspaceExists = groupId === null
    || getWorkspaces(data).some(workspace => workspace.id === groupId);
  if (!workspaceExists) return { reason: 'invalid-destination' };

  const folder = folderId === null
    ? null
    : data.folders.find(item => item.id === folderId);
  if (folderId !== null && (!folder || (folder.groupId ?? null) !== groupId)) {
    return { reason: 'invalid-destination' };
  }

  const validation = validateBookmarkDraft({ name, url, groupId, folderId });
  if (!validation.isValid) return { reason: 'invalid-bookmark' };

  const duplicate = getQuickSaveMatches(data, validation.value.url).find(bookmark => (
    (bookmark.groupId ?? null) === groupId
    && (bookmark.folderId ?? null) === folderId
  ));
  if (duplicate && !allowDuplicate) return { reason: 'duplicate', duplicate };

  let position;
  if (folder) {
    const contents = data.bookmarks.filter(bookmark => bookmark.folderId === folderId);
    const layout = createFolderBookmarkLayout(contents);
    const occupied = new Set(Array.from(
      layout.values(), cell => cellKey(cell.gx, cell.gy)
    ));
    position = findFirstFreeFolderCell(occupied);
  } else {
    position = findFirstFreeSlot(getGridItemsInGroup(data, groupId), {
      columns: GRID_COLS,
      rows: GRID_ROWS
    });
  }

  if (!position) return { reason: 'no-space' };
  return {
    reason: null,
    bookmark: { ...validation.value, name: validation.value.name.trim(), ...position }
  };
}
