import '../../types/types.js';

export const MAIN_WORKSPACE_ID = null;

/** Returns a trimmed workspace name or the supplied fallback. */
export function normalizeWorkspaceName(value, fallback = '') {
  const name = typeof value === 'string' ? value.trim() : '';
  return name || fallback;
}

/** Builds a workspace entity without coupling the domain to an ID generator. */
export function createWorkspace({ id, name }) {
  const normalizedName = normalizeWorkspaceName(name);
  if (typeof id !== 'string' || !id.trim() || !normalizedName) return null;
  return { id, name: normalizedName };
}

/** Normalizes the legacy persisted workspace collection. */
export function normalizeWorkspaces(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(workspace => workspace && typeof workspace === 'object')
    .map((workspace, index) => ({
      id: typeof workspace.id === 'string' && workspace.id.trim()
        ? workspace.id
        : `workspace-${index + 1}`,
      name: normalizeWorkspaceName(workspace.name, `Workspace ${index + 1}`)
    }));
}

/** Resolves unknown or Main workspace references to the stable null identity. */
export function resolveWorkspaceId(workspaces, workspaceId) {
  return Array.isArray(workspaces)
    && workspaces.some(workspace => workspace.id === workspaceId)
    ? workspaceId
    : MAIN_WORKSPACE_ID;
}

/** Main always precedes user-created workspaces in navigation and selectors. */
export function getWorkspaceIds(workspaces) {
  return [
    MAIN_WORKSPACE_ID,
    ...(Array.isArray(workspaces) ? workspaces.map(workspace => workspace.id) : [])
  ];
}

/** Resolves the previous or next workspace, wrapping around at both ends. */
export function getAdjacentWorkspaceId(workspaces, activeWorkspaceId, offset) {
  const ids = getWorkspaceIds(workspaces);
  const currentId = resolveWorkspaceId(workspaces, activeWorkspaceId);
  if (ids.length < 2 || offset === 0) return currentId;

  const currentIndex = ids.indexOf(currentId);
  const direction = offset < 0 ? -1 : 1;
  return ids[(currentIndex + direction + ids.length) % ids.length];
}
