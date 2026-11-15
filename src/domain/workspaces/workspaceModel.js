import '../../types/types.js';
import { normalizeWallpaperUrl, normalizeWallpaperMedia, normalizeWallpaperInterval } from '../settings/wallpaperMedia.js';
import { normalizeBackgroundImage } from '../../shared/images/backgroundImage.js';

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
  return {
    id, name: normalizedName, ...normalizeBackgroundImage(), backgroundMedia: [],
    backgroundRotationSeconds: 0, themeEnabled: false, backgroundSolid: false,
    backgroundColor: '#101827'
  };
}

/** Normalizes the legacy persisted workspace collection. */
export function normalizeWorkspaces(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(workspace => workspace && typeof workspace === 'object')
    .map((workspace, index) => {
      const image = normalizeBackgroundImage(workspace);
      const backgroundMedia = normalizeWorkspaceMedia(workspace);
      return {
        id: typeof workspace.id === 'string' && workspace.id.trim()
          ? workspace.id
          : `workspace-${index + 1}`,
        name: normalizeWorkspaceName(workspace.name, `Workspace ${index + 1}`),
        ...image,
        backgroundImageUrl: normalizeWorkspaceWallpaperUrl(image.backgroundImageUrl),
        backgroundMedia,
        backgroundRotationSeconds: normalizeWallpaperInterval(workspace.backgroundRotationSeconds),
        themeEnabled: normalizeWorkspaceThemeEnabled(workspace, backgroundMedia),
        backgroundSolid: workspace.backgroundSolid === true,
        backgroundColor: normalizeWorkspaceColor(workspace.backgroundColor)
      };
    });
}

/** Normalizes optional identity and wallpaper settings for Main. */
export function normalizeMainWorkspace(value) {
  const source = value && typeof value === 'object' ? value : {};
  const image = normalizeBackgroundImage(source);
  const backgroundMedia = normalizeWorkspaceMedia(source);
  return {
    name: normalizeWorkspaceName(source.name) || null,
    ...image,
    backgroundImageUrl: normalizeWorkspaceWallpaperUrl(image.backgroundImageUrl),
    backgroundMedia,
    backgroundRotationSeconds: normalizeWallpaperInterval(source.backgroundRotationSeconds),
    themeEnabled: normalizeWorkspaceThemeEnabled(source, backgroundMedia),
    backgroundSolid: source.backgroundSolid === true,
    backgroundColor: normalizeWorkspaceColor(source.backgroundColor)
  };
}

function normalizeWorkspaceThemeEnabled(source, media) {
  return typeof source.themeEnabled === 'boolean'
    ? source.themeEnabled
    : Boolean(media.length || source.backgroundImageUrl || source.backgroundImageLocal || source.backgroundSolid);
}

export function normalizeWorkspaceColor(value) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : '#101827';
}

function normalizeWorkspaceMedia(source) {
  const legacyImage = source.backgroundImageUrl || source.backgroundImageLocal
    ? [{ id: 'workspace-wallpaper-legacy', type: 'image', ...normalizeBackgroundImage(source) }]
    : [];
  return normalizeWallpaperMedia(source.backgroundMedia?.length ? source.backgroundMedia : legacyImage)
    .map(item => item.type === 'video'
      ? { ...item, url: normalizeWorkspaceWallpaperUrl(item.url) }
      : { ...item, backgroundImageUrl: normalizeWorkspaceWallpaperUrl(item.backgroundImageUrl) });
}

/** Workspace wallpapers are portable only when they reference an HTTP(S) URL. */
export function normalizeWorkspaceWallpaperUrl(value) {
  const url = normalizeWallpaperUrl(value);
  if (!url) return null;
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
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
