/** Returns the selected folders and every descendant, without recursion. */
export function getFolderTreeIds(folders, rootIds) {
  const children = new Map();
  for (const folder of folders) {
    if (!children.has(folder.parentId)) children.set(folder.parentId, []);
    children.get(folder.parentId).push(folder.id);
  }
  const ids = new Set(rootIds);
  const queue = [...ids];
  for (let index = 0; index < queue.length; index++) {
    for (const id of children.get(queue[index]) ?? []) {
      if (ids.has(id)) continue;
      ids.add(id);
      queue.push(id);
    }
  }
  return ids;
}

/** Counts bookmarks anywhere inside the requested folders and their descendants. */
export function countFolderTreeBookmarks(folders, bookmarks, rootIds) {
  const ids = getFolderTreeIds(folders, rootIds);
  return bookmarks.filter(bookmark => ids.has(bookmark.folderId)).length;
}

/** Drops selected descendants whose ancestor is already selected. */
export function getFolderRoots(folders, selectedIds = new Set(folders.map(folder => folder.id))) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  return folders.filter(folder => {
    if (!selectedIds.has(folder.id)) return false;
    const visited = new Set([folder.id]);
    let parentId = folder.parentId;
    while (byId.has(parentId) && !visited.has(parentId)) {
      if (selectedIds.has(parentId)) return false;
      visited.add(parentId);
      parentId = byId.get(parentId).parentId;
    }
    return true;
  });
}
