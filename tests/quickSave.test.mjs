import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultPersistedData } from '../src/platform/storage/persistedDataDefaults.js';
import { FOLDER_GRID_CAPACITY } from '../src/domain/folders/folderGrid.js';
import {
  getQuickSaveFolders,
  getQuickSaveMatches,
  getQuickSavePageKey,
  isSaveableTabUrl,
  prepareQuickBookmark
} from '../src/features/quick-save/quickSaveModel.js';


function fixture() {
  const data = createDefaultPersistedData();
  data.settings.bookmarkGroups = [{ id: 'work', name: 'Work' }];
  data.settings.activeBookmarkGroupId = 'work';
  data.folders = [
    { id: 'work-folder', name: 'Reading', groupId: 'work', gx: 0, gy: 0, w: 1, h: 1 },
    { id: 'main-folder', name: 'Personal', groupId: null, gx: 0, gy: 0, w: 1, h: 1 }
  ];
  return data;
}

test('only regular web pages can be saved from the active tab', () => {
  assert.equal(isSaveableTabUrl('https://example.com/path'), true);
  assert.equal(isSaveableTabUrl('http://example.com'), true);
  for (const url of ['chrome://settings/', 'chrome-extension://id/src/newtab.html', 'file:///tmp/a', 'javascript:alert(1)', 'not a URL']) {
    assert.equal(isSaveableTabUrl(url), false);
  }
});

test('quick save defaults to the active workspace and skips occupied grid cells', () => {
  const data = fixture();
  data.bookmarks.push({ id: 'existing', groupId: 'work', folderId: null, gx: 0, gy: 1, w: 1, h: 1 });
  const result = prepareQuickBookmark(data, { name: ' Example ', url: 'https://example.com' });
  assert.equal(result.reason, null);
  assert.deepEqual(
    { name: result.bookmark.name, groupId: result.bookmark.groupId, folderId: result.bookmark.folderId,
      gx: result.bookmark.gx, gy: result.bookmark.gy },
    { name: 'Example', groupId: 'work', folderId: null, gx: 0, gy: 2 }
  );
});

test('folder selection is limited to its workspace and uses the folder grid', () => {
  const data = fixture();
  assert.deepEqual(getQuickSaveFolders(data, 'work').map(folder => folder.id), ['work-folder']);
  data.bookmarks.push({ id: 'inside', url: 'https://old.example', groupId: 'work', folderId: 'work-folder', gx: 0, gy: 0 });
  const result = prepareQuickBookmark(data, {
    name: 'Inside', url: 'https://example.com', groupId: 'work', folderId: 'work-folder'
  });
  assert.equal(result.reason, null);
  assert.deepEqual({ gx: result.bookmark.gx, gy: result.bookmark.gy }, { gx: 1, gy: 0 });
  assert.equal(prepareQuickBookmark(data, {
    name: 'Wrong', url: 'https://example.com', groupId: null, folderId: 'work-folder'
  }).reason, 'invalid-destination');
});

test('duplicates require a deliberate second save in the same destination', () => {
  const data = fixture();
  data.bookmarks.push({ id: 'prior', name: 'Prior', url: 'https://example.com', groupId: 'work', folderId: null, gx: 1, gy: 0 });
  const request = { name: 'Again', url: 'https://example.com', groupId: 'work' };
  assert.equal(prepareQuickBookmark(data, request).reason, 'duplicate');
  assert.equal(prepareQuickBookmark(data, { ...request, allowDuplicate: true }).reason, null);
  assert.equal(prepareQuickBookmark(data, { ...request, groupId: null }).reason, null);
});

test('saved-page indicator finds equivalent URLs across workspaces and folders', () => {
  const data = fixture();
  data.bookmarks.push({
    id: 'saved', name: 'Article',
    url: 'http://www.example.com/news/?utm_source=mail&b=2&a=1#intro',
    groupId: 'work', folderId: 'work-folder'
  });
  const matches = getQuickSaveMatches(data, 'https://example.com/news?a=1&b=2');
  assert.deepEqual(matches.map(bookmark => bookmark.id), ['saved']);
  assert.equal(getQuickSavePageKey('https://example.com/news?gclid=123#part'),
    getQuickSavePageKey('http://www.example.com/news/'));
  assert.equal(prepareQuickBookmark(data, {
    name: 'Article', url: 'https://example.com/news?b=2&a=1',
    groupId: 'work', folderId: 'work-folder'
  }).reason, 'duplicate');
  assert.equal(prepareQuickBookmark(data, {
    name: 'Article', url: 'https://example.com/news?b=2&a=1',
    groupId: null, folderId: null
  }).reason, null);
});

test('different pages on one site do not produce misleading saved indicators', () => {
  const data = fixture();
  data.bookmarks.push({ id: 'video-1', url: 'https://youtube.com/watch?v=one' });
  assert.deepEqual(getQuickSaveMatches(data, 'https://youtube.com/watch?v=two'), []);
  assert.deepEqual(getQuickSaveMatches(data, 'https://youtube.com/shorts/one'), []);
  assert.deepEqual(getQuickSaveMatches(data, 'chrome://settings'), []);
});

test('full workspace and folder report no-space instead of overwriting items', () => {
  const data = fixture();
  data.widgets = [{ id: 'cover', groupId: 'work', gx: 0, gy: 0, w: 12, h: 6 }];
  assert.equal(prepareQuickBookmark(data, {
    name: 'No room', url: 'https://example.com', groupId: 'work'
  }).reason, 'no-space');

  data.bookmarks = Array.from({ length: FOLDER_GRID_CAPACITY }, (_, index) => ({
    id: `item-${index}`,
    url: `https://example.com/${index}`,
    groupId: 'work',
    folderId: 'work-folder',
    gx: index % 6,
    gy: Math.floor(index / 6)
  }));
  assert.equal(prepareQuickBookmark(data, {
    name: 'No room', url: 'https://example.com/new', groupId: 'work', folderId: 'work-folder'
  }).reason, 'no-space');
});
