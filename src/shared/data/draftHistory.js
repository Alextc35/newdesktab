import { valuesEqual } from './valuesEqual.js';

/** Bounded, immutable history for a single unsaved editor session. */
export function createDraftHistory(initialValue, { limit = 100 } = {}) {
  let current;
  let past;
  let future;
  let lastGroup;
  function reset(value) {
    current = structuredClone(value);
    past = [];
    future = [];
    lastGroup = null;
  }
  reset(initialValue);
  return {
    reset,
    breakGroup() { lastGroup = null; },
    record(value, { group = null } = {}) {
      if (valuesEqual(value, current)) {
        if (!group) lastGroup = null;
        return false;
      }
      if (!group || group !== lastGroup || future.length) {
        past.push(current);
        if (past.length > limit) past.shift();
      }
      current = structuredClone(value);
      future = [];
      lastGroup = group;
      return true;
    },
    syncNative(value, direction) {
      if (valuesEqual(value, current)) return false;
      const from = direction === 'undo' ? past : future;
      const to = direction === 'undo' ? future : past;
      const index = from.findLastIndex(snapshot => valuesEqual(snapshot, value));
      to.push(current);
      if (index >= 0) to.push(...from.splice(index).slice(1).reverse());
      if (to.length > limit) to.splice(0, to.length - limit);
      current = structuredClone(value);
      lastGroup = null;
      return true;
    },
    undo() {
      if (!past.length) return null;
      future.push(current);
      current = past.pop();
      lastGroup = null;
      return structuredClone(current);
    },
    redo() {
      if (!future.length) return null;
      past.push(current);
      current = future.pop();
      lastGroup = null;
      return structuredClone(current);
    },
    getStatus: () => ({ canUndo: Boolean(past.length), canRedo: Boolean(future.length) })
  };
}
