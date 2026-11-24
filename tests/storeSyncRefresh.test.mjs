import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultPersistedData } from '../src/platform/storage/persistedDataDefaults.js';
import { DATA_SCHEMA_VERSION } from '../src/platform/storage/schemaVersion.js';
import { encodeSyncPayload } from '../src/platform/sync/syncTransport.js';

const storageChangeListeners = [];

function selectValues(data, keys) {
  if (keys === null || keys === undefined) return structuredClone(data);
  const requested = Array.isArray(keys) ? keys : [keys];
  return Object.fromEntries(requested.filter(key => Object.hasOwn(data, key))
    .map(key => [key, structuredClone(data[key])]));
}

function createStorageArea(areaName, initialData = {}) {
  const data = structuredClone(initialData);
  return {
    data,
    QUOTA_BYTES: areaName === 'sync' ? 102400 : 10485760,
    get(keys, callback) {
      callback(selectValues(data, keys));
    },
    set(items, callback, { notify = true } = {}) {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        if (JSON.stringify(data[key]) === JSON.stringify(value)) continue;
        changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
        data[key] = structuredClone(value);
      }
      callback?.();
      if (notify && Object.keys(changes).length) {
        for (const listener of storageChangeListeners) listener(changes, areaName);
      }
    },
    remove(keys, callback) {
      const changes = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (!Object.hasOwn(data, key)) continue;
        changes[key] = { oldValue: data[key] };
        delete data[key];
      }
      callback?.();
      if (Object.keys(changes).length) {
        for (const listener of storageChangeListeners) listener(changes, areaName);
      }
    }
  };
}

function syncItems(data) {
  const shared = structuredClone(data);
  delete shared.trash;
  return encodeSyncPayload(shared, {
    schemaVersion: DATA_SCHEMA_VERSION,
    writerDeviceId: 'remote-device'
  }).items;
}

const initial = createDefaultPersistedData();
initial.bookmarks = [{ id: 'shared', name: 'Initial', url: 'https://initial.test',
  gx: 0, gy: 0, w: 1, h: 1, createdAt: 1, updatedAt: 1 }];

globalThis.chrome = {
  runtime: { lastError: null, getManifest: () => ({ version: '1.1.2' }) },
  storage: {
    local: createStorageArea('local', {
      newdesktabStorageMode: 'sync',
      newdesktabLocalTrash: [],
      newdesktabDeviceWallpapers: { media: [], rotationSeconds: 0 }
    }),
    sync: createStorageArea('sync', syncItems(initial)),
    onChanged: { addListener: listener => storageChangeListeners.push(listener) }
  }
};

globalThis.window = new EventTarget();
globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { locks: { request: (_name, operation) => operation() } }
});

const { storage } = await import('../src/platform/storage/storageFacade.js');
const { getState, hydrateStore, retryPersistence, setState } = await import('../src/state/appStore.js');
const originalGet = storage.get.bind(storage);
const originalCommit = storage.commit.bind(storage);

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitUntil(predicate, message) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await delay(10);
  assert.ok(predicate(), message);
}

function publish(data, { notify = true } = {}) {
  chrome.storage.sync.set(syncItems(data), undefined, { notify });
}

function renamedData(name) {
  const data = getState().data;
  data.bookmarks = data.bookmarks.map(bookmark => ({ ...bookmark, name }));
  return data;
}

test('Sync refresh recovers changes without switching storage modes', async t => {
  await t.test('does not lose changes received while the initial data is loading', async t => {
    let emitted = false;
    t.mock.method(storage, 'get', async keys => {
      const snapshot = await originalGet(keys);
      if (!emitted) {
        emitted = true;
        const remote = structuredClone(snapshot);
        remote.bookmarks[0].name = 'Arrived during startup';
        publish(remote);
      }
      return snapshot;
    });

    await hydrateStore();
    await waitUntil(() => getState().data.bookmarks[0].name === 'Arrived during startup',
      'the change received during hydration must reach the visible state');
    assert.equal(storage.getMode(), 'sync');
    await delay(80);
  });

  await t.test('an older asynchronous read cannot overwrite a newer storage change', async t => {
    let firstRead = true;
    let readStarted = false;
    let releaseRead;
    const blocked = new Promise(resolve => { releaseRead = resolve; });
    t.mock.method(storage, 'get', async keys => {
      const snapshot = await originalGet(keys);
      if (firstRead) {
        firstRead = false;
        readStarted = true;
        await blocked;
      }
      return snapshot;
    });

    try {
      publish(renamedData('Older snapshot'));
      await waitUntil(() => readStarted, 'the first refresh must begin');
      publish(renamedData('Newest snapshot'));
      await delay(100);
      releaseRead();
      await waitUntil(() => getState().data.bookmarks[0].name === 'Newest snapshot',
        'the newest change must be applied after the stale read completes');
      await delay(80);
      assert.equal(getState().data.bookmarks[0].name, 'Newest snapshot');
    } finally {
      releaseRead();
    }
  });

  await t.test('retries a failed read even when no further storage event arrives', async t => {
    t.mock.method(console, 'error', () => {});
    let failures = 1;
    t.mock.method(storage, 'get', async keys => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('Temporary storage read failure');
      }
      return originalGet(keys);
    });

    publish(renamedData('Recovered after failed read'));
    await waitUntil(() => getState().data.bookmarks[0].name === 'Recovered after failed read',
      'a transient read failure must recover without another event');
    assert.equal(storage.getMode(), 'sync');
    await delay(80);
  });

  await t.test('reconciles storage when the page regains focus', async () => {
    publish(renamedData('Received while inactive'), { notify: false });
    window.dispatchEvent(new Event('focus'));
    await waitUntil(() => getState().data.bookmarks[0].name === 'Received while inactive',
      'focus must reconcile changes received without a notification');
    await delay(80);
  });

  await t.test('reconciles on becoming visible without reading on hide', async () => {
    document.visibilityState = 'hidden';
    publish(renamedData('Received while hidden'), { notify: false });
    document.dispatchEvent(new Event('visibilitychange'));
    await delay(100);
    assert.equal(getState().data.bookmarks[0].name, 'Received while inactive');

    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await waitUntil(() => getState().data.bookmarks[0].name === 'Received while hidden',
      'visibility restoration must reconcile changes received while hidden');
    await delay(80);
  });

  await t.test('keeps unsaved local edits while applying incoming settings', async t => {
    t.mock.method(console, 'error', () => {});
    const remote = getState().data;
    let failures = 1;
    t.mock.method(storage, 'commit', async (...args) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('Temporary write failure');
      }
      return originalCommit(...args);
    });

    await setState({ data: { bookmarks: renamedData('Unsaved local edit').bookmarks } });
    assert.equal(getState().ui.persistence.status, 'error');
    remote.settings.language = 'es';
    publish(remote);
    await waitUntil(() => getState().data.settings.language === 'es',
      'incoming settings must still refresh after a failed local write');
    assert.equal(getState().data.bookmarks[0].name, 'Unsaved local edit');
    assert.equal(getState().ui.persistence.status, 'error');

    await retryPersistence();
    const persisted = await originalGet(null);
    assert.equal(persisted.bookmarks[0].name, 'Unsaved local edit');
    assert.equal(persisted.settings.language, 'es');
    assert.equal(getState().ui.persistence.status, 'saved');
    await delay(80);
  });

  await t.test('preserves the visible workspace when focus reveals a missed Sync deletion', async () => {
    const visible = getState().data;
    for (const key of Object.keys(chrome.storage.sync.data)) delete chrome.storage.sync.data[key];
    window.dispatchEvent(new Event('focus'));

    await waitUntil(() => storage.getMode() === 'local',
      'a missed remote deletion must leave Sync when the page regains focus');
    assert.deepEqual(getState().data, visible);
    const persisted = await originalGet(null);
    assert.deepEqual(persisted.bookmarks, visible.bookmarks);
    assert.equal(persisted.settings.language, visible.settings.language);
    await delay(80);
  });
});
