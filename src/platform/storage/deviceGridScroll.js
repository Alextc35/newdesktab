const GRID_SCROLL_KEY_PREFIX = 'newdesktab:grid-scroll:v1:';

/** Keeps viewport positions in this profile, outside synchronized application data. */
export function createDeviceGridScrollStore(getStorage = () => window.localStorage) {
  const positions = new Map();
  const unsaved = new Set();
  const keyFor = workspaceId => `${GRID_SCROLL_KEY_PREFIX}${workspaceId === null
    ? 'main' : `workspace:${workspaceId}`}`;

  return {
    read(workspaceId) {
      const key = keyFor(workspaceId);
      try {
        if (!unsaved.has(key)) {
          const value = normalizePosition(JSON.parse(getStorage().getItem(key) ?? 'null'));
          if (value) positions.set(key, value);
        }
      } catch {
        // A private or restricted profile can still retain this tab's position.
      }
      const value = positions.get(key);
      return value ? { ...value } : null;
    },
    save(workspaceId, value) {
      const position = normalizePosition(value);
      if (!position) return;
      const key = keyFor(workspaceId);
      positions.set(key, position);
      try {
        getStorage().setItem(key, JSON.stringify(position));
        unsaved.delete(key);
      } catch {
        unsaved.add(key);
        // Keep the in-memory position when device-local storage is unavailable.
      }
    }
  };
}

/** Anchors a manual pan to the canvas center as the visible window changes. */
export function resolveDeviceGridScroll(position, { maxX, maxY }) {
  return {
    x: Math.max(0, Math.min(maxX, position
      ? position.x + (maxX - (position.maxX ?? maxX)) / 2 : maxX / 2)),
    y: Math.max(0, Math.min(maxY, position
      ? position.y + (maxY - (position.maxY ?? maxY)) / 2 : maxY / 2))
  };
}

function normalizePosition(value) {
  if (!isOffset(value?.x) || !isOffset(value?.y)) return null;
  if ((value.maxX !== undefined && !isOffset(value.maxX))
    || (value.maxY !== undefined && !isOffset(value.maxY))) return null;
  return {
    x: value.x,
    y: value.y,
    ...(value.maxX !== undefined ? { maxX: value.maxX } : {}),
    ...(value.maxY !== undefined ? { maxY: value.maxY } : {})
  };
}

function isOffset(value) {
  return Number.isFinite(value) && value >= 0;
}
