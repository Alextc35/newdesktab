const GRID_DATA_KEYS = ['bookmarks', 'folders', 'widgets', 'recycleBin', 'trash'];

/**
 * Reports whether an update replaces any collection represented on the grid.
 *
 * @param {Partial<DataState>|undefined} partialData
 * @param {DataState} currentData
 * @returns {boolean}
 */
export function hasGridDataChange(partialData, currentData) {
  return GRID_DATA_KEYS.some(key => (
    partialData?.[key] !== undefined
    && partialData[key] !== currentData[key]
  ));
}

/**
 * Owns the transient undo/redo snapshots for grid data. Persistence and UI
 * concerns deliberately remain outside this object.
 *
 * @param {{limit?: number}} [options]
 */
export function createGridHistory({ limit = 50 } = {}) {
  const undoStack = [];
  const redoStack = [];

  const getStatus = () => ({
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0
  });

  return Object.freeze({
    getStatus,

    /** @param {DataState} data */
    record(data) {
      undoStack.push(createSnapshot(data));
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
      return getStatus();
    },

    /** @param {DataState} currentData */
    takeUndo(currentData) {
      const data = undoStack.pop();
      if (!data) return null;

      redoStack.push(createSnapshot(currentData));
      return { data, status: getStatus() };
    },

    /** @param {DataState} currentData */
    takeRedo(currentData) {
      const data = redoStack.pop();
      if (!data) return null;

      undoStack.push(createSnapshot(currentData));
      return { data, status: getStatus() };
    },

    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
      return getStatus();
    }
  });
}

/**
 * @param {DataState} data
 * @returns {Pick<DataState, 'bookmarks'|'folders'|'widgets'|'recycleBin'|'trash'>}
 */
function createSnapshot(data) {
  return structuredClone({
    bookmarks: data.bookmarks,
    folders: data.folders,
    widgets: data.widgets,
    recycleBin: data.recycleBin,
    trash: data.trash
  });
}
