import assert from 'node:assert/strict';
import test from 'node:test';

const localData = {};
const syncData = {};
let failNextImportWrite = false;
const makeArea = data => ({
  QUOTA_BYTES: 102400,
  get(keys, callback) {
    const requested = keys === null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
    callback(Object.fromEntries(requested.filter(key => Object.hasOwn(data, key))
      .map(key => [key, structuredClone(data[key])])));
  },
  set(items, callback) {
    if (failNextImportWrite && items.bookmarks?.some(item => item.url === 'https://failure.test')) {
      failNextImportWrite = false;
      chrome.runtime.lastError = { message: 'Import write failed' };
      callback?.();
      chrome.runtime.lastError = null;
      return;
    }
    Object.assign(data, structuredClone(items));
    callback?.();
  },
  remove(keys, callback) {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    callback?.();
  }
});
globalThis.chrome = {
  runtime: { lastError: null, getManifest: () => ({ version: '1.1.0' }) },
  storage: { local: makeArea(localData), sync: makeArea(syncData), onChanged: { addListener() {} } },
  bookmarks: { getTree(callback) { callback([{ id: '0', children: [{ title: 'Bar', children: [
    { title: 'Native bookmark', url: 'https://native.test' }
  ] }] }]); } }
};
const { detectChromeBookmarks, importChromeBookmarks } = await import('../src/features/bookmarks/browserBookmarkImport.js');
const { getState, hydrateStore, setState, changeStorageMode } = await import('../src/state/appStore.js');

test('native detection is read-only, and import waits for successful persistence', async () => {
  await hydrateStore();
  const before = structuredClone(localData);
  const detection = await detectChromeBookmarks();
  assert.equal(detection.available, true);
  assert.equal(detection.bookmarkCount, 1);
  assert.equal(detection.folderCount, 1);
  assert.deepEqual(localData, before);
  const result = await importChromeBookmarks({ tree: detection.tree });
  assert.equal(result.bookmarkCount, 1);
  assert.equal(localData.bookmarks.find(item => item.name === 'Native bookmark').url, 'https://native.test');
  assert.equal(getState().ui.persistence.status, 'saved');
  const repeated = await importChromeBookmarks({ tree: detection.tree });
  assert.equal(repeated.bookmarkCount, 0);
  assert.equal(repeated.duplicateCount, 1);
});

test('a failed storage write restores the complete pre-import collection and workspace', async () => {
  const before = getState().data;
  failNextImportWrite = true;
  await assert.rejects(importChromeBookmarks({ tree: [{ title: 'Failed', url: 'https://failure.test' }] }), {
    code: 'PERSISTENCE_FAILED'
  });
  assert.deepEqual(getState().data, before);
  assert.deepEqual(localData.bookmarks, before.bookmarks);
  assert.deepEqual(localData.folders, before.folders);
});

test('an oversized sync import is rejected before optimistic state or durable data change', async () => {
  await setState({ data: { bookmarks: [], folders: [], settings: {
    ...getState().data.settings, bookmarkGroups: [], activeBookmarkGroupId: null
  } } });
  await changeStorageMode('sync', getState().data);
  const before = getState().data;
  const beforeStorage = structuredClone(syncData);
  const tree = [{ title: 'Large', children: Array.from({ length: 500 }, (_, index) => ({
    title: `Bookmark ${index}`, url: `https://many.test/${index}`
  })) }];
  await assert.rejects(importChromeBookmarks({ tree }), { code: 'SYNC_QUOTA_EXCEEDED' });
  assert.deepEqual(getState().data, before);
  assert.deepEqual(syncData, beforeStorage);
});

test('native API absence is distinguishable from an empty bookmark collection', async () => {
  const bookmarks = chrome.bookmarks;
  delete chrome.bookmarks;
  assert.deepEqual(await detectChromeBookmarks(), {
    available: false, tree: [], bookmarkCount: 0, folderCount: 0, skippedCount: 0
  });
  chrome.bookmarks = bookmarks;
});

test('native permission/API failures reject detection and Promise-only wrappers are supported', async () => {
  const getTree = chrome.bookmarks.getTree;
  chrome.bookmarks.getTree = callback => {
    chrome.runtime.lastError = { message: 'Bookmark permission denied' };
    callback();
    chrome.runtime.lastError = null;
  };
  await assert.rejects(detectChromeBookmarks(), /Bookmark permission denied/);
  chrome.bookmarks.getTree = () => Promise.resolve([{ id: '0', children: [] }]);
  assert.equal((await detectChromeBookmarks()).bookmarkCount, 0);
  chrome.bookmarks.getTree = getTree;
});
