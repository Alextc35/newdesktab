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
    getManifest: () => ({ version: '0.19.0' })
  },
  storage: {
    local: createArea(),
    sync: createArea(),
    onChanged: { addListener() {} }
  }
};

const { DEFAULT_RECYCLE_BIN } = await import('../src/js/domain/recycle-bin/recycleBinDefaults.js');
const { DEFAULT_SETTINGS } = await import('../src/js/domain/settings/settingsDefaults.js');
const { updateSettings } = await import('../src/js/features/settings/settingsActions.js');
const { getState, hydrateStore, setState } = await import('../src/js/core/store.js');

await hydrateStore();

test('settings action merges partial values without replacing unrelated settings', async () => {
  await setState({ data: { settings: structuredClone(DEFAULT_SETTINGS) } });

  const updated = await updateSettings({ language: 'es' });

  assert.equal(updated.language, 'es');
  assert.deepEqual(updated.theme, DEFAULT_SETTINGS.theme);
  assert.equal(getState().data.settings.language, 'es');
});

test('showing the recycle bin relocates it away from occupied grid cells', async () => {
  await setState({
    data: {
      bookmarks: [{
        id: 'occupied',
        name: 'Occupied',
        url: 'https://example.com',
        gx: 0,
        gy: 0,
        w: 1,
        h: 1,
        groupId: null,
        folderId: null
      }],
      folders: [],
      recycleBin: structuredClone(DEFAULT_RECYCLE_BIN),
      settings: { ...structuredClone(DEFAULT_SETTINGS), showRecycleBin: false }
    }
  });

  await updateSettings({ showRecycleBin: true });

  assert.equal(getState().data.settings.showRecycleBin, true);
  assert.notDeepEqual(
    [getState().data.recycleBin.gx, getState().data.recycleBin.gy],
    [0, 0]
  );
});
