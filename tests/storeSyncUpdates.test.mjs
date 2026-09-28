import assert from 'node:assert/strict';
import test from 'node:test';

const storageChangeListeners = [];

function selectValues(data, keys) {
  if (keys === null || keys === undefined) return structuredClone(data);

  const requested = Array.isArray(keys) ? keys : [keys];
  return Object.fromEntries(
    requested
      .filter(key => Object.hasOwn(data, key))
      .map(key => [key, structuredClone(data[key])])
  );
}

function createStorageArea(areaName, initialData = {}) {
  const data = structuredClone(initialData);

  return {
    data,
    QUOTA_BYTES: areaName === 'sync' ? 102400 : 10485760,

    get(keys, callback) {
      callback(selectValues(data, keys));
    },

    set(items, callback) {
      const changes = {};

      for (const [key, value] of Object.entries(items)) {
        changes[key] = {
          oldValue: data[key],
          newValue: structuredClone(value)
        };
        data[key] = structuredClone(value);
      }

      callback?.();
      for (const listener of storageChangeListeners) listener(changes, areaName);
    },

    remove(keys, callback) {
      const changes = {};

      for (const key of (Array.isArray(keys) ? keys : [keys])) {
        if (!Object.hasOwn(data, key)) continue;
        changes[key] = { oldValue: data[key] };
        delete data[key];
      }

      callback?.();
      for (const listener of storageChangeListeners) listener(changes, areaName);
    }
  };
}

const initialSyncData = {
  schemaVersion: 4,
  bookmarks: [{
    id: 'initial',
    name: 'Initial',
    url: 'https://initial.test'
  }],
  folders: [],
  settings: { language: 'en' }
};

globalThis.chrome = {
  runtime: {
    lastError: null,
    getManifest: () => ({ version: '0.7.1' })
  },
  storage: {
    local: createStorageArea('local', { newdesktabStorageMode: 'sync' }),
    sync: createStorageArea('sync', initialSyncData),
    onChanged: {
      addListener(listener) {
        storageChangeListeners.push(listener);
      }
    }
  }
};

const {
  getStorageMode,
  getState,
  hydrateStore,
  setState,
  subscribeToRemoteSyncUpdates
} = await import('../src/js/state/appStore.js');

const waitForStorageRefresh = () => new Promise(resolve => setTimeout(resolve, 80));

test('announces only data updates received from another device', async () => {
  await hydrateStore();

  let remoteUpdates = 0;
  const events = [];
  const unsubscribe = subscribeToRemoteSyncUpdates(event => {
    remoteUpdates += 1;
    events.push(event.type);
  });

  const current = getState().data;
  await setState({
    data: {
      bookmarks: current.bookmarks.map(bookmark => ({
        ...bookmark,
        name: 'Changed here'
      }))
    }
  });
  await waitForStorageRefresh();

  assert.equal(remoteUpdates, 0);

  const remoteData = {
    ...getState().data,
    bookmarks: getState().data.bookmarks.map(bookmark => ({
      ...bookmark,
      name: 'Changed remotely'
    }))
  };

  chrome.storage.sync.set({
    newdesktabSyncMeta: {
      version: 1,
      schemaVersion: remoteData.schemaVersion,
      chunkCount: 1,
      updatedAt: Date.now() + 1,
      writerDeviceId: 'another-device',
      writeId: 'remote-write'
    }
  }, () => {});
  await waitForStorageRefresh();

  assert.equal(remoteUpdates, 0);

  chrome.storage.sync.set({
    'newdesktabSyncChunk:0': JSON.stringify(remoteData)
  }, () => {});
  await waitForStorageRefresh();

  assert.equal(getState().data.bookmarks[0].name, 'Changed remotely');
  assert.equal(remoteUpdates, 1);
  assert.deepEqual(events, ['updated']);
  unsubscribe();
});

test('keeps the visible data and switches to Local after remote Sync deletion', async () => {
  const events = [];
  const unsubscribe = subscribeToRemoteSyncUpdates(event => events.push(event.type));
  const visibleBeforeDeletion = getState().data;

  chrome.storage.sync.remove(Object.keys(chrome.storage.sync.data), () => {});
  await waitForStorageRefresh();

  assert.equal(getStorageMode(), 'local');
  assert.deepEqual(getState().data, visibleBeforeDeletion);
  assert.deepEqual(chrome.storage.local.data.bookmarks, visibleBeforeDeletion.bookmarks);
  assert.equal(chrome.storage.local.data.newdesktabStorageMode, 'local');
  assert.deepEqual(events, ['deleted']);
  unsubscribe();
});
