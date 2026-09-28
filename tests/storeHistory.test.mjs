import assert from 'node:assert/strict';
import test from 'node:test';

const localData = {};
const listeners = [];
const createArea = () => ({
  QUOTA_BYTES: 102400,
  get(keys, callback) {
    const requested = keys === null ? Object.keys(localData) : (Array.isArray(keys) ? keys : [keys]);
    callback(Object.fromEntries(
      requested.filter(key => Object.hasOwn(localData, key)).map(key => [key, localData[key]])
    ));
  },
  set(items, callback) {
    Object.assign(localData, structuredClone(items));
    callback?.();
  },
  remove(keys, callback) {
    for (const key of (Array.isArray(keys) ? keys : [keys])) delete localData[key];
    callback?.();
  }
});

globalThis.chrome = {
  runtime: {
    lastError: null,
    getManifest: () => ({ version: '0.1.1' })
  },
  storage: {
    local: createArea(),
    sync: createArea(),
    onChanged: { addListener(listener) { listeners.push(listener); } }
  }
};

const {
  getState,
  hydrateStore,
  redoBookmarks,
  setState,
  undoBookmarks
} = await import('../src/js/state/appStore.js');

test('bookmark history supports undo and redo as persisted state changes', async () => {
  await hydrateStore();
  const initialBookmarks = getState().data.bookmarks;
  const initialFolders = getState().data.folders;
  const replacement = [{ id: 'replacement', name: 'Replacement' }];
  const replacementFolders = [{
    id: 'folder', name: 'Folder', gx: 0, gy: 0, w: 1, h: 1, groupId: null
  }];

  await setState({ data: { bookmarks: replacement, folders: replacementFolders } });
  assert.equal(getState().ui.history.canUndo, true);
  assert.deepEqual(getState().data.bookmarks, replacement);
  assert.deepEqual(getState().data.folders, replacementFolders);

  assert.equal(await undoBookmarks(), true);
  assert.deepEqual(getState().data.bookmarks, initialBookmarks);
  assert.deepEqual(getState().data.folders, initialFolders);
  assert.equal(getState().ui.history.canRedo, true);

  assert.equal(await redoBookmarks(), true);
  assert.deepEqual(getState().data.bookmarks, replacement);
  assert.deepEqual(getState().data.folders, replacementFolders);
});

test('undoing a deletion removes its recycle-bin entry instead of duplicating it', async () => {
  const saved = [{ id: 'undo-trash', name: 'Undo trash', gx: 0, gy: 0, w: 1, h: 1 }];
  await setState({ data: { bookmarks: saved, folders: [], trash: [] } }, { recordHistory: false });
  await setState({
    data: {
      bookmarks: [],
      trash: [{
        id: 'trash-entry',
        type: 'bookmark',
        deletedAt: Date.now(),
        bookmark: saved[0]
      }]
    }
  });

  assert.equal(getState().data.trash.length, 1);
  assert.equal(await undoBookmarks(), true);
  assert.deepEqual(getState().data.bookmarks, saved);
  assert.deepEqual(getState().data.trash, []);
});
