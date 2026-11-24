import {
  BROWSER_BOOKMARK_SOURCE,
  browserBookmarkRoots,
  isBrowserBookmarkRoot,
  safeImportedBookmarkUrl
} from './browserBookmarkImport.js';

/**
 * Indexes a browser tree once. Positional IDs identify checkboxes without
 * changing native IDs, and cached subtree totals keep checkbox reads constant.
 */
export function createBrowserBookmarkSelection(tree, { selected = true } = {}) {
  const selection = { roots: [], nodes: new Map(), selected: new Set(), order: [] };
  const stack = [{ children: browserBookmarkRoots(tree), parentId: null }];
  const visited = new Set();
  while (stack.length) {
    const { children, parentId } = stack.pop();
    const occurrences = new Map();
    for (let index = 0; index < children.length; index++) {
      const node = children[index];
      if (!node || typeof node !== 'object' || visited.has(node)) continue;
      visited.add(node);
      const kind = Object.hasOwn(node, 'url') ? 'bookmark'
        : Array.isArray(node.children) ? 'folder' : null;
      if (!kind) continue;
      const name = typeof node.title === 'string' ? node.title.trim() : '';
      const identity = JSON.stringify([kind, name, kind === 'bookmark' ? node.url : '']);
      const occurrence = occurrences.get(identity) ?? 0;
      occurrences.set(identity, occurrence + 1);
      const id = parentId === null ? String(index) : `${parentId}/${index}`;
      const selectable = kind === 'folder' || Boolean(safeImportedBookmarkUrl(node.url));
      const entry = {
        id, parentId, node, kind, selectable, children: [],
        index: node[BROWSER_BOOKMARK_SOURCE]?.index ?? index,
        occurrence: node[BROWSER_BOOKMARK_SOURCE]?.occurrence ?? occurrence,
        bookmarkCount: kind === 'bookmark' && selectable ? 1 : 0,
        folderCount: kind === 'folder' ? 1 : 0,
        selectableCount: Number(selectable),
        selectedCount: 0
      };
      selection.nodes.set(id, entry);
      selection.order.push(id);
      if (parentId === null) selection.roots.push(id);
      else selection.nodes.get(parentId).children.push(id);
      if (kind === 'folder') stack.push({ children: node.children, parentId: id });
    }
  }
  for (let index = selection.order.length - 1; index >= 0; index--) {
    const entry = selection.nodes.get(selection.order[index]);
    let selectedChildren = 0;
    for (const id of entry.children) {
      const child = selection.nodes.get(id);
      entry.bookmarkCount += child.bookmarkCount;
      entry.folderCount += child.folderCount;
      entry.selectableCount += child.selectableCount;
      selectedChildren += child.selectedCount;
    }
    // Empty folders remain visible, but including them requires an explicit
    // choice. Their ancestors are selected initially only if they contain links.
    if (selected && entry.selectable && (entry.kind === 'bookmark' || entry.bookmarkCount > 0)) {
      selection.selected.add(entry.id);
    }
    entry.selectedCount = selectedChildren + Number(selection.selected.has(entry.id));
  }
  return selection;
}

/** Selects one bookmark, or a folder and its entire subtree. */
export function setBrowserBookmarkSelected(selection, id, checked) {
  const entry = selection.nodes.get(id);
  if (!entry?.selectable) return false;
  const stack = [id];
  while (stack.length) {
    const current = selection.nodes.get(stack.pop());
    updateSelected(selection, current, checked);
    current.selectedCount = checked ? current.selectableCount : 0;
    for (const childId of current.children) stack.push(childId);
  }
  let parent = selection.nodes.get(entry.parentId);
  while (parent) {
    let selectedCount = 0;
    let all = true;
    let hasSelectableChild = false;
    for (const childId of parent.children) {
      const child = selection.nodes.get(childId);
      selectedCount += child.selectedCount;
      if (child.selectableCount) {
        hasSelectableChild = true;
        all &&= child.selectedCount === child.selectableCount;
      }
    }
    if (hasSelectableChild) updateSelected(selection, parent, all);
    parent.selectedCount = selectedCount + Number(selection.selected.has(parent.id));
    parent = selection.nodes.get(parent.parentId);
  }
  return true;
}

/** Changes the whole collection without repeatedly walking ancestor paths. */
export function setAllBrowserBookmarksSelected(selection, checked) {
  for (const entry of selection.nodes.values()) {
    updateSelected(selection, entry, checked);
    entry.selectedCount = checked ? entry.selectableCount : 0;
  }
}

/** Supplies the native checkbox checked/indeterminate/disabled state. */
export function getBrowserBookmarkSelectionState(selection, id) {
  const entry = selection.nodes.get(id);
  if (!entry || !entry.selectableCount) return { checked: false, indeterminate: false, disabled: true };
  return {
    checked: entry.selectedCount === entry.selectableCount,
    indeterminate: entry.selectedCount > 0 && entry.selectedCount < entry.selectableCount,
    disabled: !entry.selectable
  };
}

/** Counts selected links and user folders without including browser roots. */
export function getSelectedBrowserBookmarkCounts(selection) {
  const retained = getRetainedNodes(selection);
  let bookmarkCount = 0;
  let folderCount = 0;
  for (const id of retained) {
    const entry = selection.nodes.get(id);
    if (entry.kind === 'folder') {
      if (entry.parentId !== null || !isBrowserBookmarkRoot(entry.node)) folderCount++;
    } else bookmarkCount++;
  }
  return { bookmarkCount, folderCount };
}

/**
 * Produces an importable copy in original order, retaining ancestors of selected
 * descendants. Source positions keep repeated sibling names/URLs idempotent
 * even when an earlier identical sibling is not selected.
 */
export function filterSelectedBrowserBookmarks(selection) {
  const retained = getRetainedNodes(selection);
  const copies = new Map();
  for (let index = selection.order.length - 1; index >= 0; index--) {
    const entry = selection.nodes.get(selection.order[index]);
    if (!retained.has(entry.id)) continue;
    const copy = { ...entry.node };
    if (entry.kind === 'folder') {
      copy.children = entry.children.filter(id => copies.has(id)).map(id => copies.get(id));
    }
    Object.defineProperty(copy, BROWSER_BOOKMARK_SOURCE, {
      value: { index: entry.index, occurrence: entry.occurrence }
    });
    copies.set(entry.id, copy);
  }
  return selection.roots.filter(id => copies.has(id)).map(id => copies.get(id));
}

function updateSelected(selection, entry, checked) {
  if (checked && entry.selectable) selection.selected.add(entry.id);
  else selection.selected.delete(entry.id);
}

function getRetainedNodes(selection) {
  const retained = new Set();
  for (let index = selection.order.length - 1; index >= 0; index--) {
    const entry = selection.nodes.get(selection.order[index]);
    if (selection.selected.has(entry.id) || entry.children.some(id => retained.has(id))) {
      retained.add(entry.id);
    }
  }
  return retained;
}
