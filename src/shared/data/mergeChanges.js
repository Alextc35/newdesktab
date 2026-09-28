const RECORD_COLLECTIONS = new Set([
  'bookmarks',
  'folders',
  'widgets',
  'trash',
  'bookmarkGroups',
  'bookmarkPresets'
]);

/** Merges only this page's changes into the latest persisted snapshot.
 * Independent additions and edits survive; deletion wins over a stale edit.
 * Changes to the same field use the last writer inside the device lock.
 */
export function mergeChanges(base, next, latest, key = '') {
  if (JSON.stringify(base) === JSON.stringify(next)) return structuredClone(latest);
  if (JSON.stringify(base) === JSON.stringify(latest)) return structuredClone(next);

  if (RECORD_COLLECTIONS.has(key) && [base, next, latest].every(Array.isArray)) {
    const before = new Map(base.map(item => [item.id, item]));
    const after = new Map(next.map(item => [item.id, item]));
    const result = latest.filter(item => !before.has(item.id) || after.has(item.id))
      .map(item => before.has(item.id) && after.has(item.id)
        ? mergeChanges(before.get(item.id), after.get(item.id), item)
        : structuredClone(item));
    const ids = new Set(result.map(item => item.id));
    for (const item of next) {
      if (!before.has(item.id) && !ids.has(item.id)) result.push(structuredClone(item));
    }
    return result;
  }

  if ([base, next, latest].every(isObject)) {
    const result = structuredClone(latest);
    for (const property of new Set([...Object.keys(base), ...Object.keys(next)])) {
      if (!Object.hasOwn(next, property)) delete result[property];
      else if (JSON.stringify(base[property]) !== JSON.stringify(next[property])) {
        result[property] = mergeChanges(base[property], next[property], latest[property], property);
      }
    }
    return result;
  }

  return structuredClone(next);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
