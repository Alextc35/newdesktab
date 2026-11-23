import assert from 'node:assert/strict';
import test from 'node:test';
import { getFolderAncestors, getFolderContentsPage } from '../src/domain/folders/folderContents.js';
import { createFolderBookmarkLayout } from '../src/domain/folders/folderGrid.js';

test('pages thousands of bookmarks without hiding overflow and clamps the final page', () => {
  const data = { folders: [], bookmarks: Array.from({ length: 5000 }, (_, index) => ({
    id: `bookmark-${index}`, name: `Bookmark ${index}`, folderId: 'root',
    gx: index % 6, gy: Math.floor(index / 6)
  })) };
  const first = getFolderContentsPage(data, 'root');
  assert.equal(first.entries.length, 54);
  assert.equal(first.totalCount, 5000);
  assert.equal(first.pages, 93);
  assert.equal(first.entries[53].item.id, 'bookmark-53');
  const last = getFolderContentsPage(data, 'root', { page: 999 });
  assert.equal(last.page, 92);
  assert.equal(last.entries.length, 32);
  assert.equal(last.entries.at(-1).item.id, 'bookmark-4999');
});

test('preserves mixed folder/bookmark order and searches names or URLs within the current folder', () => {
  const data = {
    folders: [{ id: 'child', name: 'Reference', parentId: 'root', gx: 1, gy: 0 }],
    bookmarks: [
      { id: 'before', name: 'First', url: 'https://first.test', folderId: 'root', gx: 0, gy: 0 },
      { id: 'after', name: 'Last', url: 'https://reference.test', folderId: 'root', gx: 2, gy: 0 },
      { id: 'elsewhere', name: 'Reference', folderId: 'child', gx: 0, gy: 0 }
    ]
  };
  assert.deepEqual(getFolderContentsPage(data, 'root').entries.map(entry => entry.item.id), ['before', 'child', 'after']);
  const search = getFolderContentsPage(data, 'root', { query: 'REFERENCE' });
  assert.deepEqual(search.entries.map(entry => entry.item.id), ['child', 'after']);
  assert.equal(search.totalCount, 3);
  assert.equal(search.matchCount, 2);
});

test('packs a large colliding legacy collection without dropping or overlapping entries', () => {
  const items = Array.from({ length: 5000 }, (_, index) => ({ id: String(index), gx: 0, gy: 0 }));
  const layout = createFolderBookmarkLayout(items);
  assert.equal(layout.size, 5000);
  assert.equal(new Set([...layout.values()].map(({ gx, gy }) => `${gx}:${gy}`)).size, 5000);
  assert.deepEqual(layout.get('4999'), { gx: 1, gy: 833 });
});

test('breadcrumbs follow real parent links and terminate safely for malformed cycles', () => {
  const folders = [
    { id: 'root', parentId: null }, { id: 'child', parentId: 'root' },
    { id: 'grandchild', parentId: 'child' }
  ];
  assert.deepEqual(getFolderAncestors(folders, 'grandchild').map(folder => folder.id), ['root', 'child', 'grandchild']);
  folders[0].parentId = 'grandchild';
  assert.equal(getFolderAncestors(folders, 'grandchild').length, 3);
});
