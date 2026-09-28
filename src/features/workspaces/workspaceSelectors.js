import '../../types/types.js';
import {
  getAdjacentWorkspaceId as getAdjacentId,
  getWorkspaceIds as getIds,
  resolveWorkspaceId
} from '../../domain/workspaces/workspaceModel.js';

/** Adapts the legacy persisted settings fields to explicit workspace concepts. */
export function getWorkspaces(data) {
  return Array.isArray(data?.settings?.bookmarkGroups)
    ? data.settings.bookmarkGroups
    : [];
}

export function getActiveWorkspaceId(data) {
  return resolveWorkspaceId(
    getWorkspaces(data),
    data?.settings?.activeBookmarkGroupId
  );
}

export function getWorkspaceById(data, workspaceId) {
  if (workspaceId === null) return null;
  return getWorkspaces(data).find(workspace => workspace.id === workspaceId) ?? null;
}

export function getWorkspaceIds(data) {
  return getIds(getWorkspaces(data));
}

export function getAdjacentWorkspaceId(data, offset) {
  return getAdjacentId(getWorkspaces(data), getActiveWorkspaceId(data), offset);
}

export function getWorkspaceItemCounts(data, workspaceId) {
  const id = workspaceId ?? null;
  return {
    bookmarks: data.bookmarks.filter(bookmark => (bookmark.groupId ?? null) === id).length,
    folders: data.folders.filter(folder => (folder.groupId ?? null) === id).length
  };
}
