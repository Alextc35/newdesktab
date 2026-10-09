import { findFirstFreeSlot, isAreaFree } from '../../shared/grid/gridPlacement.js';
import { GRID_COLS, GRID_ROWS } from '../../shared/grid/gridGeometry.js';

/** Two tabs can reserve the same free cell before either one saves. */
export function placeConcurrentAdditions(base, latest, data) {
  const previousIds = new Set([
    ...base.bookmarks,
    ...base.folders,
    ...base.widgets,
    ...latest.bookmarks,
    ...latest.folders,
    ...latest.widgets
  ].map(item => item.id));
  const items = [
    ...data.folders,
    ...data.widgets,
    ...data.bookmarks.filter(bookmark => !bookmark.folderId)
  ];
  const occupied = [
    ...(data.settings.showRecycleBin ? [data.recycleBin] : []),
    ...items.filter(item => previousIds.has(item.id))
  ];
  for (const item of items.filter(item => !previousIds.has(item.id))) {
    const group = occupied.filter(other => (other.groupId ?? null) === (item.groupId ?? null));
    if (!isAreaFree(group, item.gx, item.gy, item.w, item.h)) {
      const position = findFirstFreeSlot(group, {
        columns: GRID_COLS, rows: GRID_ROWS, w: item.w, h: item.h
      });
      // If the workspace filled concurrently, keep the record at its requested
      // position rather than dropping user data. It remains available in search
      // and List view even when another card occupies that grid cell.
      if (position) Object.assign(item, position);
    }
    occupied.push(item);
  }
}
