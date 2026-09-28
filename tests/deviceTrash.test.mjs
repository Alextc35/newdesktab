import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEVICE_TRASH_KEY,
  clearDeviceTrash,
  restoreDeviceTrash,
  saveDeviceTrash,
  withoutDeviceTrash
} from '../src/platform/storage/deviceTrashStorage.js';

const local = {};
globalThis.chrome = {
  runtime: { lastError: null },
  storage: { local: {
    get(keys, callback) {
      const requested = Array.isArray(keys) ? keys : [keys];
      callback(Object.fromEntries(requested
        .filter(key => Object.hasOwn(local, key))
        .map(key => [key, structuredClone(local[key])])));
    },
    set(items, callback) {
      Object.assign(local, structuredClone(items));
      callback();
    },
    remove(keys, callback) {
      for (const key of (Array.isArray(keys) ? keys : [keys])) delete local[key];
      callback();
    }
  } }
};

const firstEntry = {
  id: 'first-trash-entry',
  type: 'bookmark',
  deletedAt: 1,
  bookmark: { id: 'deleted', name: 'Deleted' }
};

test('keeps recycle-bin contents local and adopts legacy synchronized entries once', async () => {
  const migrated = await restoreDeviceTrash({ bookmarks: [], trash: [firstEntry] });
  assert.deepEqual(migrated.trash, [firstEntry]);
  assert.deepEqual(local[DEVICE_TRASH_KEY], [firstEntry]);

  await saveDeviceTrash({ trash: [] });
  const refreshed = await restoreDeviceTrash({
    bookmarks: [],
    trash: [{ ...firstEntry, id: 'remote-entry' }]
  });
  assert.deepEqual(refreshed.trash, []);

  const source = { bookmarks: [], trash: [firstEntry] };
  const shared = withoutDeviceTrash(source);
  assert.equal(Object.hasOwn(shared, 'trash'), false);
  assert.deepEqual(source.trash, [firstEntry]);

  await clearDeviceTrash();
  assert.equal(Object.hasOwn(local, DEVICE_TRASH_KEY), false);
});
