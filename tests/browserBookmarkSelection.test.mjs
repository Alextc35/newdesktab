import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBrowserBookmarkSelection,
  filterSelectedBrowserBookmarks,
  getBrowserBookmarkSelectionState,
  getSelectedBrowserBookmarkCounts,
  setAllBrowserBookmarksSelected,
  setBrowserBookmarkSelected
} from '../src/domain/bookmarks/browserBookmarkSelection.js';
import {
  BROWSER_BOOKMARK_SOURCE,
  prepareBrowserBookmarkImport
} from '../src/domain/bookmarks/browserBookmarkImport.js';
import { migratePersistedData } from '../src/platform/storage/dataSchema.js';

const link = name => ({ title: name, url: `https://example.test/${name}` });
const source = () => [{ id: '0', title: '', children: [{ title: 'Bar', children: [
  link('Before'), { title: 'Work', children: [link('Deep')] }, link('After')
] }] }];
const state = (selection, id) => getBrowserBookmarkSelectionState(selection, id);
const emptyData = () => migratePersistedData({ bookmarks: [], folders: [] });

test('indexes visible Chrome folders with positional identities and initial totals', () => {
  const selection = createBrowserBookmarkSelection(source());
  assert.deepEqual(selection.roots, ['0']);
  assert.equal(selection.nodes.get('0').node.title, 'Bar');
  assert.deepEqual(selection.nodes.get('0').children, ['0/0', '0/1', '0/2']);
  assert.equal(selection.nodes.get('0/1/0').parentId, '0/1');
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 3, folderCount: 2 });
  assert.deepEqual(state(selection, '0'), { checked: true, indeterminate: false, disabled: false });
});

test('folder checkbox changes its complete subtree and maintains ancestor tri-state', () => {
  const selection = createBrowserBookmarkSelection(source());
  setBrowserBookmarkSelected(selection, '0/1', false);
  assert.deepEqual(state(selection, '0'), { checked: false, indeterminate: true, disabled: false });
  assert.equal(state(selection, '0/1/0').checked, false);
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 2, folderCount: 1 });
  setBrowserBookmarkSelected(selection, '0/1/0', true);
  assert.equal(state(selection, '0/1').checked, true);
  assert.equal(state(selection, '0').checked, true);
  setBrowserBookmarkSelected(selection, '0', false);
  assert.equal(selection.selected.size, 0);
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 0, folderCount: 0 });
});

test('keeps ancestors and original order when individual descendants are selected', () => {
  const original = source();
  const selection = createBrowserBookmarkSelection(original, { selected: false });
  setBrowserBookmarkSelected(selection, '0/1/0', true);
  setBrowserBookmarkSelected(selection, '0/2', true);
  const filtered = filterSelectedBrowserBookmarks(selection);
  assert.deepEqual(filtered[0].children.map(item => item.title), ['Work', 'After']);
  assert.deepEqual(filtered[0].children[0].children.map(item => item.title), ['Deep']);
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 2, folderCount: 2 });
  assert.equal(original[0].children[0].children.length, 3);
  assert.notEqual(filtered[0], original[0].children[0]);
});

test('empty folders remain individually selectable and unsupported URLs are disabled', () => {
  const selection = createBrowserBookmarkSelection([
    { title: 'Empty', children: [] },
    { title: 'Unsafe', url: 'javascript:alert(1)' },
    link('Safe')
  ]);
  assert.deepEqual(state(selection, '0'), { checked: false, indeterminate: false, disabled: false });
  assert.deepEqual(state(selection, '1'), { checked: false, indeterminate: false, disabled: true });
  assert.equal(setBrowserBookmarkSelected(selection, '1', true), false);
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 1, folderCount: 0 });
  setAllBrowserBookmarksSelected(selection, false);
  setBrowserBookmarkSelected(selection, '0', true);
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 0, folderCount: 1 });
  const filtered = filterSelectedBrowserBookmarks(selection);
  assert.deepEqual(filtered, [{ title: 'Empty', children: [] }]);
  assert.equal(prepareBrowserBookmarkImport(filtered, emptyData()).folderCount, 1);
  setAllBrowserBookmarksSelected(selection, true);
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 1, folderCount: 1 });
});

test('default selection excludes empty branches while explicit folder selection includes them', () => {
  const selection = createBrowserBookmarkSelection([
    { title: 'Mixed', children: [link('Safe'), { title: 'Empty', children: [] },
      { title: 'Empty branch', children: [{ title: 'Nested empty', children: [] }] }] },
    { title: 'Only empties', children: [{ title: 'Child empty', children: [] }] }
  ]);
  assert.deepEqual(state(selection, '0'), { checked: false, indeterminate: true, disabled: false });
  assert.deepEqual(state(selection, '1'), { checked: false, indeterminate: false, disabled: false });
  assert.equal(state(selection, '0/1').checked, false);
  assert.equal(state(selection, '0/2').checked, false);
  assert.equal(state(selection, '0/2/0').checked, false);
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 1, folderCount: 1 });
  assert.deepEqual(filterSelectedBrowserBookmarks(selection).map(node => node.title), ['Mixed']);
  assert.deepEqual(filterSelectedBrowserBookmarks(selection)[0].children.map(node => node.title), ['Safe']);
  setBrowserBookmarkSelected(selection, '0', true);
  assert.equal(state(selection, '0').checked, true);
  assert.equal(state(selection, '0/2/0').checked, true);
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 1, folderCount: 4 });
  setAllBrowserBookmarksSelected(selection, true);
  assert.equal(state(selection, '1').checked, true);
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 1, folderCount: 6 });
});

test('partial selection preserves original identities and positions of repeated sibling links', () => {
  const repeated = { title: 'Repeated', url: 'https://repeat.test' };
  const tree = [{ title: 'Folder', children: [{ ...repeated }, { ...repeated }] }];
  const full = prepareBrowserBookmarkImport(tree, emptyData());
  const selection = createBrowserBookmarkSelection(tree, { selected: false });
  setBrowserBookmarkSelected(selection, '0/1', true);
  const filtered = filterSelectedBrowserBookmarks(selection);
  assert.deepEqual(filtered[0].children[0][BROWSER_BOOKMARK_SOURCE], { index: 1, occurrence: 1 });
  const partial = prepareBrowserBookmarkImport(filtered, emptyData());
  assert.equal(partial.data.bookmarks[0].id, full.data.bookmarks[1].id);
  assert.equal(partial.data.bookmarks[0].gx, 1);
  const remaining = prepareBrowserBookmarkImport(tree, partial.data);
  assert.equal(remaining.bookmarkCount, 1);
  assert.equal(remaining.duplicateCount, 1);
  assert.equal(remaining.data.bookmarks.length, 2);
});

test('equally named folder siblings retain their original occurrence after filtering', () => {
  const tree = [
    { title: 'Work', children: [link('First')] },
    { title: 'Work', children: [link('Second')] }
  ];
  const full = prepareBrowserBookmarkImport(tree, emptyData());
  const selection = createBrowserBookmarkSelection(tree, { selected: false });
  setBrowserBookmarkSelected(selection, '1/0', true);
  const partial = prepareBrowserBookmarkImport(filterSelectedBrowserBookmarks(selection), emptyData());
  const fullBookmark = full.data.bookmarks.find(bookmark => bookmark.name === 'Second');
  assert.equal(partial.data.bookmarks[0].id, fullBookmark.id);
  assert.equal(partial.data.folders[0].id, fullBookmark.folderId);
  assert.equal(partial.data.folders[0].gx, 1);
});

test('handles large collections and deeply nested folders without recursive tree walking', () => {
  let deep = link('Bottom');
  for (let depth = 0; depth < 2500; depth++) deep = { title: `Level ${depth}`, children: [deep] };
  const selection = createBrowserBookmarkSelection([
    { title: 'Large', children: Array.from({ length: 5000 }, (_, index) => link(`Page-${index}`)) },
    deep
  ]);
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 5001, folderCount: 2501 });
  setAllBrowserBookmarksSelected(selection, false);
  const bottom = selection.order.find(id => selection.nodes.get(id).node.title === 'Bottom');
  setBrowserBookmarkSelected(selection, bottom, true);
  assert.equal(state(selection, '1').checked, true);
  const filtered = filterSelectedBrowserBookmarks(selection);
  assert.equal(filtered.length, 1);
  let node = filtered[0];
  let depth = 0;
  while (node.children) { depth++; node = node.children[0]; }
  assert.equal(depth, 2500);
  assert.equal(node.title, 'Bottom');
});

test('guards malformed cyclic source objects without trapping selection traversal', () => {
  const folder = { title: 'Cycle', children: [] };
  folder.children.push(folder, link('Safe'));
  const selection = createBrowserBookmarkSelection([folder]);
  assert.equal(selection.nodes.size, 2);
  assert.deepEqual(getSelectedBrowserBookmarkCounts(selection), { bookmarkCount: 1, folderCount: 1 });
  setAllBrowserBookmarksSelected(selection, false);
  assert.deepEqual(filterSelectedBrowserBookmarks(selection), []);
});
