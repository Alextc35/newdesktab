import '../../types/types.js';

/**
 * Returns the items that currently reserve cells in one workspace.
 * Bookmarks inside folders deliberately do not participate in grid collisions.
 */
export function getGridItemsInGroup(data, groupId) {
  const normalizedGroupId = groupId ?? null;
  const items = [
    ...data.bookmarks.filter(bookmark => (
      !bookmark.folderId
      && (bookmark.groupId ?? null) === normalizedGroupId
    )),
    ...data.folders.filter(folder => (
      (folder.groupId ?? null) === normalizedGroupId
    )),
    ...(data.widgets ?? []).filter(widget => (
      (widget.groupId ?? null) === normalizedGroupId
    ))
  ];
  if (normalizedGroupId === null && data.settings?.showRecycleBin && data.recycleBin) {
    items.push(data.recycleBin);
  }
  return items;
}
