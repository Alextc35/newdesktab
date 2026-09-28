const selectedItems = new Map();
const gridItemListeners = new Set();

export function getSelectedGridItems() {
  return [...selectedItems.values()].map(item => ({ ...item }));
}

export function isGridItemSelected(kind, itemId) {
  return selectedItems.has(selectionKey(kind, itemId));
}

export function toggleGridItemSelection(kind, itemId) {
  if (!['bookmark', 'folder', 'widget'].includes(kind) || !itemId) return false;

  const key = selectionKey(kind, itemId);
  if (selectedItems.has(key)) selectedItems.delete(key);
  else selectedItems.set(key, { kind, id: itemId });
  notify();
  return selectedItems.has(key);
}

export function clearGridItemSelection() {
  if (!selectedItems.size) return;
  selectedItems.clear();
  notify();
}

export function pruneGridItemSelection({
  bookmarkIds = [],
  folderIds = [],
  widgetIds = []
} = {}) {
  const allowedByKind = {
    bookmark: new Set(bookmarkIds),
    folder: new Set(folderIds),
    widget: new Set(widgetIds)
  };
  let changed = false;

  for (const [key, item] of selectedItems) {
    if (allowedByKind[item.kind]?.has(item.id)) continue;
    selectedItems.delete(key);
    changed = true;
  }
  if (changed) notify();
}

export function subscribeToGridItemSelection(listener) {
  gridItemListeners.add(listener);
  listener(getSelectedGridItems());
  return () => gridItemListeners.delete(listener);
}

function notify() {
  const items = getSelectedGridItems();
  for (const listener of gridItemListeners) listener(items);
}

function selectionKey(kind, itemId) {
  return `${kind}:${itemId}`;
}
