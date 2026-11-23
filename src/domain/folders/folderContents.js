import { createFolderBookmarkLayout } from './folderGrid.js';

export const FOLDER_PAGE_SIZE = 54;

/** Return a bounded page in the shared bookmark/subfolder reading order. */
export function getFolderContentsPage(data, folderId, {
  query = '', page = 0, pageSize = FOLDER_PAGE_SIZE
} = {}) {
  const entries = [
    ...data.bookmarks.filter(item => item.folderId === folderId).map(item => ({ kind: 'bookmark', item })),
    ...data.folders.filter(item => item.parentId === folderId).map(item => ({ kind: 'folder', item }))
  ];
  const layout = createFolderBookmarkLayout(entries.map(entry => entry.item));
  entries.sort((a, b) => {
    const first = layout.get(a.item.id);
    const second = layout.get(b.item.id);
    return first.gy - second.gy || first.gx - second.gx;
  });
  const search = query.trim().toLocaleLowerCase();
  const matches = search ? entries.filter(({ item }) => (
    `${item.name ?? ''}\n${item.url ?? ''}`.toLocaleLowerCase().includes(search)
  )) : entries;
  const size = Math.max(1, Math.floor(pageSize) || FOLDER_PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(matches.length / size));
  const currentPage = Math.max(0, Math.min(pages - 1, Math.floor(page) || 0));
  return {
    entries: matches.slice(currentPage * size, (currentPage + 1) * size),
    layout,
    totalCount: entries.length,
    matchCount: matches.length,
    hasSubfolders: entries.some(entry => entry.kind === 'folder'),
    page: currentPage,
    pages
  };
}

/** Walk parents defensively so old or malformed trees cannot trap navigation. */
export function getFolderAncestors(folders, folderId) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const ancestors = [];
  const visited = new Set();
  let folder = byId.get(folderId);
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id);
    ancestors.push(folder);
    folder = byId.get(folder.parentId);
  }
  return ancestors.reverse();
}

/** Build readable paths once for destination lists and global search results. */
export function getFolderPaths(folders) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const paths = new Map();
  for (const folder of folders) {
    if (paths.has(folder.id)) continue;
    const chain = [];
    const visited = new Set();
    let current = folder;
    while (current && !paths.has(current.id) && !visited.has(current.id)) {
      visited.add(current.id);
      chain.push(current);
      current = byId.get(current.parentId);
    }
    let path = current ? paths.get(current.id) ?? '' : '';
    for (const ancestor of chain.reverse()) {
      path = path ? `${path} › ${ancestor.name}` : ancestor.name;
      paths.set(ancestor.id, path);
    }
  }
  return paths;
}
