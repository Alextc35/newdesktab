import { normalizeBookmark } from './bookmarkModel.js';
import { normalizeFolderStyle } from '../folders/folderModel.js';
import { GRID_COLS, GRID_ROWS } from '../../shared/grid/gridGeometry.js';
import { isAreaFree } from '../../shared/grid/gridPlacement.js';
import { getFolderTreeIds } from '../folders/folderTree.js';

const SAFE_PROTOCOLS = new Set([
  'http:', 'https:', 'chrome:', 'brave:', 'edge:', 'about:', 'file:', 'ftp:', 'mailto:',
  'chrome-extension:'
]);
const IMPORT_COLUMNS = 6;
export const BROWSER_BOOKMARK_SOURCE = Symbol('browserBookmarkSource');

/** Browser exports are data: executable URLs and relative links are not imported. */
export function safeImportedBookmarkUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  try { return SAFE_PROTOCOLS.has(new URL(url).protocol) ? url : null; }
  catch { return null; }
}

/** Removes only Chrome's invisible root; visible browser folders are retained. */
export function browserBookmarkRoots(tree) {
  if (!Array.isArray(tree)) throw importError('INVALID_BOOKMARK_IMPORT');
  return tree.length === 1 && String(tree[0]?.id) === '0'
    && !Object.hasOwn(tree[0], 'url') && Array.isArray(tree[0].children)
    ? tree[0].children : tree;
}

/** Counts the actual importable links without touching native bookmarks. */
export function countBrowserBookmarks(tree) {
  let bookmarkCount = 0;
  let folderCount = 0;
  let skippedCount = 0;
  const stack = [...browserBookmarkRoots(tree)];
  const visited = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || visited.has(node)) continue;
    visited.add(node);
    if (Object.hasOwn(node, 'url')) {
      if (safeImportedBookmarkUrl(node.url)) bookmarkCount += 1;
      else skippedCount += 1;
    } else if (Array.isArray(node.children)) {
      folderCount += 1;
      for (const child of node.children) stack.push(child);
    }
  }
  return { bookmarkCount, folderCount, skippedCount };
}

/**
 * Reads Chrome/Netscape bookmark HTML in an inert document. Only names, hrefs
 * and dates are copied; no exported markup is ever attached to the application.
 */
export function parseBrowserBookmarksHtml(html, { Parser = globalThis.DOMParser } = {}) {
  if (typeof html !== 'string' || !html.trim() || !Parser) {
    throw importError('INVALID_BOOKMARK_IMPORT');
  }
  const document = new Parser().parseFromString(html, 'text/html');
  const root = document.querySelector('dl');
  if (!root) throw importError('INVALID_BOOKMARK_IMPORT');
  const tree = [];
  const lists = new Map([[root, tree]]);
  // Walking once keeps large exports linear and naturally preserves the mixed
  // order of bookmarks and folders, including omitted </DT> tags in Chrome HTML.
  for (const element of root.querySelectorAll('h3, a, dl')) {
    if (element.tagName === 'DL') continue;
    const parentList = element.closest('dl');
    const children = lists.get(parentList);
    if (!children) continue;
    const dateAdded = Number(element.getAttribute('add_date')) * 1000;
    if (element.tagName === 'A') {
      children.push({ title: element.textContent.trim(), url: element.getAttribute('href'), dateAdded });
      continue;
    }
    const folder = { title: element.textContent.trim(), children: [], dateAdded,
      ...(element.getAttribute('personal_toolbar_folder')?.toLowerCase() === 'true'
        ? { folderType: 'bookmarks-bar' } : {}) };
    children.push(folder);
    const entry = element.closest('dt');
    let contents = entry && Array.from(entry.children).find(child => child.tagName === 'DL');
    if (!contents) {
      let sibling = (entry ?? element).nextElementSibling;
      while (sibling?.tagName === 'P') sibling = sibling.nextElementSibling;
      if (sibling?.tagName === 'DL') contents = sibling;
    }
    if (contents) lists.set(contents, folder.children);
  }
  if (!tree.length) throw importError('INVALID_BOOKMARK_IMPORT');
  return tree;
}

/**
 * Adds a faithful browser tree to Main. Stable source IDs make
 * repeated imports idempotent while retaining intentional duplicate links and
 * equally named sibling folders in the original collection.
 */
export function prepareBrowserBookmarkImport(tree, data, {
  source = 'chrome', workspaceName = 'Google Chrome', now = Date.now()
} = {}) {
  const counts = countBrowserBookmarks(tree);
  if (!counts.bookmarkCount && !counts.folderCount) throw importError('EMPTY_BOOKMARK_IMPORT');
  const sourceId = `browser-import-${stableHash(source)}`;
  const workspaceId = null;
  const existingIds = new Set([
    ...data.bookmarks.map(item => item.id), ...data.folders.map(item => item.id)
  ]);
  const folders = [];
  const bookmarks = [];
  let duplicateCount = 0;
  const sourceRoots = [];
  const sourceFolders = [];
  const sourceBookmarks = [];
  const stack = [{ children: browserBookmarkRoots(tree), parentId: null, path: '' }];
  const visited = new Set();
  while (stack.length) {
    const { children, parentId, path } = stack.pop();
    const occurrences = new Map();
    for (let index = 0; index < children.length; index += 1) {
      const node = children[index];
      if (!node || typeof node !== 'object' || visited.has(node)) continue;
      visited.add(node);
      const isBookmark = Object.hasOwn(node, 'url');
      const name = typeof node.title === 'string' ? node.title.trim() : '';
      const identity = JSON.stringify([isBookmark ? 'bookmark' : 'folder', name, isBookmark ? node.url : '']);
      const occurrence = node[BROWSER_BOOKMARK_SOURCE]?.occurrence ?? occurrences.get(identity) ?? 0;
      occurrences.set(identity, occurrence + 1);
      const positionIndex = node[BROWSER_BOOKMARK_SOURCE]?.index ?? index;
      const nodePath = `${path}/${stableHash(identity)}:${occurrence}`;
      const id = `${sourceId}-${isBookmark ? 'b' : 'f'}-${stableHash(nodePath)}`;
      if (!path) sourceRoots.push({ id, node, positionIndex });
      const createdAt = Number.isFinite(node.dateAdded) && node.dateAdded > 0 ? node.dateAdded : now;
      if (isBookmark) {
        const url = safeImportedBookmarkUrl(node.url);
        if (!url) continue;
        sourceBookmarks.push({ id, parentId, positionIndex });
        if (existingIds.has(id)) { duplicateCount += 1; continue; }
        bookmarks.push(normalizeBookmark({
          id, name: name || url, url, folderId: parentId, groupId: workspaceId,
          gx: positionIndex % IMPORT_COLUMNS, gy: Math.floor(positionIndex / IMPORT_COLUMNS),
          w: 1, h: 1, createdAt, updatedAt: now
        }, { preset: data.settings.bookmarkDefault, now, touchUpdatedAt: false }));
        existingIds.add(id);
      } else if (Array.isArray(node.children)) {
        sourceFolders.push({ id, parentId, positionIndex });
        if (!existingIds.has(id)) {
          folders.push(makeFolder(id, name || 'Folder', parentId, positionIndex, workspaceId, createdAt));
          existingIds.add(id);
        }
        stack.push({ children: node.children, parentId: id, path: nodePath });
      }
    }
  }
  const rootId = `${sourceId}-root`;
  const sourceOwned = item => item.id.startsWith(`${sourceId}-`);
  const oldWrapperIds = getFolderTreeIds(data.folders, [rootId]);
  const wrapperHasForeignContents = data.folders.some(folder => oldWrapperIds.has(folder.id) && !sourceOwned(folder))
    || data.bookmarks.some(bookmark => oldWrapperIds.has(bookmark.folderId) && !sourceOwned(bookmark));
  const removedParents = new Map(wrapperHasForeignContents ? [] : [[rootId, null]]);
  const liveSourceParents = new Set([...sourceFolders, ...sourceBookmarks].map(item => item.parentId));
  const isBrowserRoot = node => (source === 'chrome' && ['1', '2', '3'].includes(String(node.id)))
    || ['bookmarks-bar', 'other', 'mobile'].includes(node.folderType);
  const isToolbar = node => node.folderType === 'bookmarks-bar'
    || source === 'chrome' && String(node.id) === '1';
  const activeRoots = sourceRoots.filter(({ id, node }) => {
    if (isBrowserRoot(node) && !liveSourceParents.has(id)) {
      removedParents.set(id, null);
      return false;
    }
    return true;
  });
  const toolbarRoots = activeRoots.filter(({ id, node }) => isToolbar(node) && liveSourceParents.has(id));
  for (const { id } of toolbarRoots) removedParents.set(id, null);
  if (!toolbarRoots.length && activeRoots.length === 1 && isBrowserRoot(activeRoots[0].node)) {
    const { id } = activeRoots[0];
    // A single flat browser bucket does not need an extra click to reach links.
    if (!sourceFolders.some(folder => folder.parentId === id)) removedParents.set(id, null);
  }
  if (!sourceBookmarks.length && sourceFolders.every(folder => removedParents.has(folder.id))) {
    throw importError('EMPTY_BOOKMARK_IMPORT');
  }
  const parentOf = parentId => {
    const visited = new Set();
    while (removedParents.has(parentId) && !visited.has(parentId)) {
      visited.add(parentId);
      parentId = removedParents.get(parentId);
    }
    return parentId;
  };
  const migratingRootIds = data.folders.filter(folder => folder.id !== rootId
    && folder.groupId === sourceId && sourceOwned(folder)).map(folder => folder.id);
  const migratingFolderIds = getFolderTreeIds(data.folders, migratingRootIds);
  const moveLegacyFolder = folder => folder.groupId === sourceId
    && (migratingFolderIds.has(folder.id) || sourceOwned(folder) && folder.id !== rootId);
  const moveLegacyBookmark = bookmark => bookmark.groupId === sourceId
    && (sourceOwned(bookmark) || migratingFolderIds.has(bookmark.folderId));
  let combinedFolders = [...data.folders, ...folders]
    .filter(folder => !removedParents.has(folder.id))
    .map(folder => {
      const moved = moveLegacyFolder(folder);
      const parentId = moved && folder.parentId === rootId ? null : parentOf(folder.parentId);
      return moved || parentId !== folder.parentId ? { ...folder, parentId, ...(moved ? { groupId: null } : {}) } : folder;
    });
  let combinedBookmarks = [...data.bookmarks, ...bookmarks]
    .map(bookmark => {
      const moved = moveLegacyBookmark(bookmark);
      const folderId = moved && bookmark.folderId === rootId ? null : parentOf(bookmark.folderId);
      return moved || folderId !== bookmark.folderId ? { ...bookmark, folderId, ...(moved ? { groupId: null } : {}) } : bookmark;
    });
  if (wrapperHasForeignContents
    && !combinedFolders.some(folder => folder.parentId === rootId)
    && !combinedBookmarks.some(bookmark => bookmark.folderId === rootId)) {
    combinedFolders = combinedFolders.filter(folder => folder.id !== rootId);
  }
  const imported = item => (item.groupId ?? null) === null && sourceOwned(item);
  const sourceOrder = new Map();
  let nextRootOrder = 0;
  // Toolbar contents come first, with remaining browser buckets after them.
  const sourceChildren = new Map();
  for (const child of [...sourceFolders, ...sourceBookmarks]) {
    if (!sourceChildren.has(child.parentId)) sourceChildren.set(child.parentId, []);
    sourceChildren.get(child.parentId).push(child);
  }
  const appendSourceChildren = root => {
    const children = (sourceChildren.get(root.id) ?? [])
      .sort((a, b) => a.positionIndex - b.positionIndex);
    for (const child of children) sourceOrder.set(child.id, nextRootOrder++);
  };
  for (const root of toolbarRoots) {
    appendSourceChildren(root);
  }
  const toolbarIds = new Set(toolbarRoots.map(root => root.id));
  for (const root of activeRoots) {
    if (toolbarIds.has(root.id)) continue;
    if (removedParents.has(root.id)) appendSourceChildren(root);
    else sourceOrder.set(root.id, nextRootOrder++);
  }
  const topImports = [
    ...combinedBookmarks.filter(item => imported(item) && !item.folderId),
    ...combinedFolders.filter(item => imported(item) && !item.parentId)
  ].sort((a, b) => {
    const first = sourceOrder.get(a.id);
    const second = sourceOrder.get(b.id);
    if (first !== undefined || second !== undefined) return (first ?? Infinity) - (second ?? Infinity);
    return a.gy - b.gy || a.gx - b.gx;
  });
  // Importing again must not move cards the user already arranged on Main.
  const existingMainRootIds = new Set([
    ...data.bookmarks.filter(item => (item.groupId ?? null) === null && !item.folderId),
    ...data.folders.filter(item => (item.groupId ?? null) === null && !item.parentId)
  ].map(item => item.id));
  const rootsToPlace = topImports.filter(item => !existingMainRootIds.has(item.id));
  const occupied = [
    ...combinedBookmarks.filter(item => (item.groupId ?? null) === null && !item.folderId && !imported(item)),
    ...combinedFolders.filter(item => (item.groupId ?? null) === null && !item.parentId && !imported(item)),
    ...topImports.filter(item => existingMainRootIds.has(item.id)),
    ...(data.widgets ?? []).filter(item => (item.groupId ?? null) === null),
    ...(data.settings.showRecycleBin && data.recycleBin ? [data.recycleBin] : [])
  ];
  const placements = new Map();
  for (const item of rootsToPlace) {
    const position = findImportCell(occupied, item.w, item.h);
    if (!position) break;
    placements.set(item.id, position);
    occupied.push({ ...item, ...position });
  }
  let wrapperAdded = false;
  if (placements.size < rootsToPlace.length) {
    const overflowId = wrapperHasForeignContents ? `${rootId}-overflow` : rootId;
    const retainedWrapper = combinedFolders.find(folder => folder.id === overflowId);
    const oldWrapper = retainedWrapper ?? data.folders.find(folder => folder.id === rootId && !wrapperHasForeignContents);
    const wrapperOccupied = occupied.filter(item => !placements.has(item.id) && item.id !== overflowId);
    const wrapperWidth = oldWrapper?.w ?? 1;
    const wrapperHeight = oldWrapper?.h ?? 1;
    const keepWrapperPosition = oldWrapper && (oldWrapper.groupId ?? null) === null
      && !oldWrapper.parentId && oldWrapper.gx >= 0 && oldWrapper.gy >= 0
      && oldWrapper.gx + wrapperWidth <= GRID_COLS && oldWrapper.gy + wrapperHeight <= GRID_ROWS
      && isAreaFree(wrapperOccupied, oldWrapper.gx, oldWrapper.gy, wrapperWidth, wrapperHeight);
    const wrapperPosition = keepWrapperPosition ? { gx: oldWrapper.gx, gy: oldWrapper.gy }
      : findImportCell(wrapperOccupied, wrapperWidth, wrapperHeight);
    if (!wrapperPosition) throw importError('MAIN_WORKSPACE_FULL');
    // A legacy wrapper containing personal additions stays untouched in its old
    // workspace; a separate overflow folder receives newly imported roots.
    const wrapper = { ...(oldWrapper ?? makeFolder(overflowId, workspaceName, null, 0, workspaceId, now)),
      ...wrapperPosition, groupId: null, parentId: null };
    if (retainedWrapper) combinedFolders = combinedFolders.map(folder => folder.id === wrapper.id ? wrapper : folder);
    else combinedFolders.push(wrapper);
    wrapperAdded = !oldWrapper;
    const rootIds = new Set(rootsToPlace.map(item => item.id));
    rootIds.delete(wrapper.id);
    combinedFolders = combinedFolders.map(folder => rootIds.has(folder.id)
      ? { ...folder, parentId: wrapper.id } : folder);
    combinedBookmarks = combinedBookmarks.map(bookmark => rootIds.has(bookmark.id)
      ? { ...bookmark, folderId: wrapper.id } : bookmark);
  } else {
    combinedFolders = combinedFolders.map(folder => placements.has(folder.id)
      ? { ...folder, ...placements.get(folder.id) } : folder);
    combinedBookmarks = combinedBookmarks.map(bookmark => placements.has(bookmark.id)
      ? { ...bookmark, ...placements.get(bookmark.id) } : bookmark);
  }
  return {
    data: {
      ...data,
      bookmarks: combinedBookmarks,
      folders: combinedFolders,
      settings: {
        ...data.settings,
        bookmarkGroups: data.settings.bookmarkGroups.filter(workspace => workspace.id !== sourceId
          || combinedFolders.some(item => item.groupId === sourceId)
          || combinedBookmarks.some(item => item.groupId === sourceId)
          || (data.widgets ?? []).some(item => item.groupId === sourceId)),
        activeBookmarkGroupId: null
      }
    },
    bookmarkCount: bookmarks.length,
    folderCount: folders.filter(folder => !removedParents.has(folder.id)).length + Number(wrapperAdded),
    skippedCount: counts.skippedCount,
    duplicateCount,
    workspaceId
  };
}

function makeFolder(id, name, parentId, index, groupId, now) {
  return {
    ...normalizeFolderStyle({ noOuterBackground: true }), id, name, parentId, groupId,
    gx: index % IMPORT_COLUMNS, gy: Math.floor(index / IMPORT_COLUMNS), w: 1, h: 1,
    createdAt: now, updatedAt: now
  };
}

/** The import reads left to right across each row of Main's grid. */
function findImportCell(occupied, width = 1, height = 1) {
  for (let gy = 0; gy + height <= GRID_ROWS; gy++) {
    for (let gx = 0; gx + width <= GRID_COLS; gx++) {
      if (isAreaFree(occupied, gx, gy, width, height)) return { gx, gy };
    }
  }
  return null;
}

// Two independent 32-bit accumulators avoid very long IDs for deeply nested
// paths and keep IDs stable without storing extra source metadata in Sync.
function stableHash(value) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return (first >>> 0).toString(36) + '-' + (second >>> 0).toString(36);
}

function importError(code) {
  const messages = {
    EMPTY_BOOKMARK_IMPORT: 'No supported bookmarks were found.',
    MAIN_WORKSPACE_FULL: 'Main has no free cell for the imported bookmarks. Free one cell and import again.'
  };
  const error = new Error(messages[code] ?? 'Invalid browser bookmark file.');
  error.code = code;
  return error;
}
