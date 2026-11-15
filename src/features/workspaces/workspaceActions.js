import '../../types/types.js';
import {
  createWorkspace as createWorkspaceEntity,
  normalizeWorkspaceColor,
  normalizeWorkspaceWallpaperUrl,
  resolveWorkspaceId
} from '../../domain/workspaces/workspaceModel.js';
import { normalizeWallpaperMedia, normalizeWallpaperInterval } from '../../domain/settings/wallpaperMedia.js';
import { clearBookmarkHistory, getState, setState } from '../../state/appStore.js';
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

/** Reorders custom workspaces without changing their identity or contents. */
export function reorderWorkspaces(workspaceIds) {
  if (!Array.isArray(workspaceIds)) return false;
  const { data } = getState();
  const workspaces = getWorkspaces(data);
  if (workspaceIds.length !== workspaces.length
    || new Set(workspaceIds).size !== workspaces.length) return false;

  const byId = new Map(workspaces.map(workspace => [workspace.id, workspace]));
  if (workspaceIds.some(id => !byId.has(id))) return false;
  const bookmarkGroups = workspaceIds.map(id => byId.get(id));
  if (bookmarkGroups.every((workspace, index) => workspace.id === workspaces[index].id)) {
    return false;
  }

  setState({ data: { settings: { ...data.settings, bookmarkGroups } } });
  return true;
}

/** Updates a workspace's name and device-local/URL wallpaper choices. */
export function updateWorkspace(workspaceId, changes) {
  const name = typeof changes?.name === 'string' ? changes.name.trim() : '';
  if (!name || name.length > 60) return null;
  const includesUrl = Object.hasOwn(changes ?? {}, 'backgroundImageUrl');
  const rawUrl = typeof changes?.backgroundImageUrl === 'string'
    ? changes.backgroundImageUrl.trim() : '';
  const backgroundImageUrl = includesUrl
    ? normalizeWorkspaceWallpaperUrl(rawUrl)
    : undefined;
  if (rawUrl && !backgroundImageUrl) return null;
  const normalizedChanges = {
    ...changes,
    ...(Object.hasOwn(changes ?? {}, 'backgroundMedia')
      ? { backgroundMedia: normalizeWallpaperMedia(changes.backgroundMedia) } : {}),
    ...(Object.hasOwn(changes ?? {}, 'backgroundRotationSeconds')
      ? { backgroundRotationSeconds: normalizeWallpaperInterval(changes.backgroundRotationSeconds) } : {}),
    ...(Object.hasOwn(changes ?? {}, 'themeEnabled')
      ? { themeEnabled: changes.themeEnabled === true } : {}),
    ...(Object.hasOwn(changes ?? {}, 'backgroundSolid')
      ? { backgroundSolid: changes.backgroundSolid === true } : {}),
    ...(Object.hasOwn(changes ?? {}, 'backgroundColor')
      ? { backgroundColor: normalizeWorkspaceColor(changes.backgroundColor) } : {}),
    ...(includesUrl ? { backgroundImageUrl } : {})
  };

  const { data } = getState();
  if (workspaceId === null) {
    const updated = { ...data.settings.mainWorkspace, ...normalizedChanges, name };
    setState({ data: { settings: { ...data.settings, mainWorkspace: updated } } });
    return updated;
  }

  let updated = null;
  const bookmarkGroups = data.settings.bookmarkGroups.map(workspace => {
    if (workspace.id !== workspaceId) return workspace;
    updated = { ...workspace, ...normalizedChanges, name };
    return updated;
  });
  if (!updated) return null;

  setState({ data: { settings: { ...data.settings, bookmarkGroups } } });
  return updated;
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
