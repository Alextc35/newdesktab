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

const { duplicateGridItems } = await import('../src/features/grid/gridItemActions.js');
const { getState, hydrateStore, setState } = await import('../src/state/appStore.js');

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

  const result = duplicateGridItems(getState().data.bookmarks.map(item => ({ kind: 'bookmark', id: item.id })), {
    columns: 3,
    rows: 1,
    nameSuffix: 'copy'
  });

  assert.equal(result.duplicates.length, 1);
  assert.equal(result.skipped, 1);
  const duplicate = result.duplicates[0].item;
  assert.equal(duplicate.name, 'First (copy)');
  assert.deepEqual(
    { gx: duplicate.gx, gy: duplicate.gy },
    { gx: 2, gy: 0 }
  );
  assert.notEqual(duplicate.id, 'first');
  assert.equal(getState().data.bookmarks.length, 3);
});
