import '../../types/types.js';
import {
  createWorkspace as createWorkspaceEntity,
  resolveWorkspaceId
} from '../../domain/workspaces/workspaceModel.js';
import { findFirstFreeSlot } from '../../shared/grid/gridPlacement.js';
import { clearBookmarkHistory, getState, setState } from '../../state/appStore.js';
import { getGridItemsInGroup } from '../grid/gridSelectors.js';
import { moveWorkspaceToRecycleBin } from '../recycle-bin/recycleBinActions.js';
import { getActiveWorkspaceId, getWorkspaces } from './workspaceSelectors.js';

export function createWorkspace(name) {
  const workspace = createWorkspaceEntity({ id: crypto.randomUUID(), name });
  if (!workspace) return null;

  const { data: { settings } } = getState();
  const nextSettings = {
    ...settings,
    bookmarkGroups: [...settings.bookmarkGroups, workspace],
    activeBookmarkGroupId: workspace.id
  };
  setState({ data: { settings: nextSettings } });
  return workspace;
}

export async function setActiveWorkspace(workspaceId) {
  const { data } = getState();
  const normalizedId = resolveWorkspaceId(getWorkspaces(data), workspaceId);
  if (getActiveWorkspaceId(data) === normalizedId) return false;

  await setState({
    data: {
      settings: { ...data.settings, activeBookmarkGroupId: normalizedId }
    }
  }, { recordHistory: false });
  return true;
}

export function deleteWorkspace(workspaceId) {
  const { data } = getState();
  const workspaces = getWorkspaces(data);
  if (!workspaces.some(workspace => workspace.id === workspaceId)) return false;

  moveWorkspaceToRecycleBin(workspaceId, {
    ...data.settings,
    bookmarkGroups: workspaces.filter(workspace => workspace.id !== workspaceId),
    activeBookmarkGroupId: getActiveWorkspaceId(data) === workspaceId
      ? null
      : getActiveWorkspaceId(data)
  });
  clearBookmarkHistory();
  return true;
}

export function moveBookmarksToWorkspace(bookmarkIds, workspaceId, { columns, rows } = {}) {
  const ids = new Set(bookmarkIds);
  const { data } = getState();
  const normalizedId = resolveWorkspaceId(getWorkspaces(data), workspaceId);
  let moved = 0;
  let skipped = 0;
  const occupied = getGridItemsInGroup(data, normalizedId).filter(item => (
    !ids.has(item.id)
  ));
  const replacements = new Map();

  for (const bookmark of data.bookmarks) {
    if (!ids.has(bookmark.id) || bookmark.groupId === normalizedId) continue;
    const position = findFirstFreeSlot(occupied, {
      columns,
      rows,
      w: bookmark.w,
      h: bookmark.h
    });
    if (!position) {
      skipped += 1;
      continue;
    }

    const replacement = {
      ...bookmark,
      ...position,
      groupId: normalizedId,
      folderId: null,
      updatedAt: Date.now()
    };
    replacements.set(bookmark.id, replacement);
    occupied.push(replacement);
    moved += 1;
  }

  const bookmarks = data.bookmarks.map(bookmark => replacements.get(bookmark.id) ?? bookmark);
  if (moved) setState({ data: { bookmarks } });
  return { moved, skipped };
}
