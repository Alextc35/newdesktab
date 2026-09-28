import assert from 'node:assert/strict';
import test from 'node:test';

const storedData = {};
const createArea = () => ({
  QUOTA_BYTES: 102400,
  get(keys, callback) {
    const requested = keys === null ? Object.keys(storedData) : (Array.isArray(keys) ? keys : [keys]);
    callback(Object.fromEntries(
      requested.filter(key => Object.hasOwn(storedData, key)).map(key => [key, storedData[key]])
    ));
  },
  set(items, callback) {
    Object.assign(storedData, structuredClone(items));
    callback?.();
  },
  remove(keys, callback) {
    for (const key of (Array.isArray(keys) ? keys : [keys])) delete storedData[key];
    callback?.();
  }
});

globalThis.chrome = {
  runtime: {
    lastError: null,
    getManifest: () => ({ version: '0.1.2' })
  },
  storage: {
    local: createArea(),
    sync: createArea(),
    onChanged: { addListener() {} }
  }
};

const { duplicateBookmarksByIds } = await import('../src/js/features/bookmarks/bookmarkActions.js');
const { getState, hydrateStore, setState } = await import('../src/js/state/appStore.js');

test('bulk duplication reserves free slots and reports bookmarks that do not fit', async () => {
  await hydrateStore();
  await setState({
    data: {
      bookmarks: [
        { id: 'first', name: 'First', groupId: null, gx: 0, gy: 0, w: 1, h: 1 },
        { id: 'second', name: 'Second', groupId: null, gx: 1, gy: 0, w: 1, h: 1 }
      ]
    }
  });

  const result = duplicateBookmarksByIds(['first', 'second'], {
    columns: 3,
    rows: 1,
    nameSuffix: 'copy'
  });

  assert.equal(result.duplicates.length, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.duplicates[0].name, 'First (copy)');
  assert.deepEqual(
    { gx: result.duplicates[0].gx, gy: result.duplicates[0].gy },
    { gx: 2, gy: 0 }
  );
  assert.notEqual(result.duplicates[0].id, 'first');
  assert.equal(getState().data.bookmarks.length, 3);
});
