import '../../types/types.js';
import {
  createWorkspace as createWorkspaceEntity,
  resolveWorkspaceId
} from '../../domain/workspaces/workspaceModel.js';
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
