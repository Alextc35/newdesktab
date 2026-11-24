import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultPersistedData } from '../src/platform/storage/persistedDataDefaults.js';
import { DATA_SCHEMA_VERSION } from '../src/platform/storage/schemaVersion.js';
import { encodeSyncPayload } from '../src/platform/sync/syncTransport.js';

const storageChangeListeners = [];

function selectValues(data, keys) {
  if (keys === null || keys === undefined) return structuredClone(data);
  return Object.fromEntries((Array.isArray(keys) ? keys : [keys])
    .filter(key => Object.hasOwn(data, key)).map(key => [key, structuredClone(data[key])]));
}

function createStorageArea(areaName, initialData = {}) {
  const data = structuredClone(initialData);
  return {
    data,
    QUOTA_BYTES: areaName === 'sync' ? 102400 : 10485760,
    get: (keys, callback) => callback(selectValues(data, keys)),
    set(items, callback) {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        if (JSON.stringify(data[key]) === JSON.stringify(value)) continue;
        changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
        data[key] = structuredClone(value);
      }
      callback?.();
      if (Object.keys(changes).length) {
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
const { changeStorageMode, getState, hydrateStore, retryPersistence, setState } = await import('../src/state/appStore.js');
const originalGet = storage.get.bind(storage);
const originalCommit = storage.commit.bind(storage);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitUntil(predicate, message) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await delay(10);
  assert.ok(predicate(), message);
}

function publish(data) {
  chrome.storage.sync.set(syncItems(data));
}

function renamedData(name) {
  const data = getState().data;
  data.bookmarks[0].name = name;
  return data;
}

function pauseNextRead(t) {
  let first = true;
  let started = false;
  let release;
  const paused = new Promise(resolve => { release = resolve; });
  t.mock.method(storage, 'get', async keys => {
    const snapshot = await originalGet(keys);
    if (first) {
      first = false;
      started = true;
      await paused;
    }
    return snapshot;
  });
  return { release, wait: () => waitUntil(() => started, 'a storage refresh must start') };
}

test('Sync reconciliation survives concurrent editing and storage-mode changes', async t => {
  let hydrated = false;
  await t.test('recovers a transient initial read error and applies an update received during retry', async t => {
    t.mock.method(console, 'error', () => {});
    let failures = 1;
    t.mock.method(storage, 'get', async keys => {
      if (failures > 0) {
        failures -= 1;
        const remote = structuredClone(initial);
        remote.bookmarks[0].name = 'Received during initial failure';
        publish(remote);
        throw new Error('Temporary initial Sync read failure');
      }
      return originalGet(keys);
    });

    await hydrateStore();
    hydrated = true;
    await waitUntil(() => getState().data.bookmarks[0].name === 'Received during initial failure',
      'startup must recover automatically without reloading or switching mode');
    assert.equal(storage.getMode(), 'sync');
    await delay(80);
  });
  if (!hydrated) await hydrateStore();

  await t.test('a successful edit started during a remote read retains local and remote changes', async t => {
    const read = pauseNextRead(t);
    const remote = getState().data;
    remote.settings.language = 'es';
    publish(remote);
    try {
      await read.wait();
      await setState({ data: { bookmarks: renamedData('Edited during remote read').bookmarks } });
      read.release();
      await waitUntil(() => getState().data.settings.language === 'es', 'incoming settings must survive a concurrent save');
      await delay(100);
      assert.equal(getState().data.bookmarks[0].name, 'Edited during remote read');
      assert.equal(getState().ui.persistence.status, 'saved');
      const persisted = await originalGet(null);
      assert.equal(persisted.bookmarks[0].name, 'Edited during remote read');
      assert.equal(persisted.settings.language, 'es');
    } finally {
      read.release();
    }
  });

  await t.test('a failed edit during a remote read is merged even without another storage event', async t => {
    t.mock.method(console, 'error', () => {});
    const read = pauseNextRead(t);
    let failures = 1;
    t.mock.method(storage, 'commit', async (...args) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('Write failed before any storage event');
      }
      return originalCommit(...args);
    });
    const remote = getState().data;
    remote.settings.language = 'de';
    publish(remote);
    try {
      await read.wait();
      await setState({ data: { bookmarks: renamedData('Unsaved during remote read').bookmarks } });
      assert.equal(getState().ui.persistence.status, 'error');
      read.release();
      await waitUntil(() => getState().data.settings.language === 'de',
        'invalidated read must be retried without waiting for the failed save to emit an event');
      assert.equal(getState().data.bookmarks[0].name, 'Unsaved during remote read');
      assert.equal(getState().ui.persistence.status, 'error');
      await retryPersistence();
      const persisted = await originalGet(null);
      assert.equal(persisted.bookmarks[0].name, 'Unsaved during remote read');
      assert.equal(persisted.settings.language, 'de');
      await delay(80);
    } finally {
      read.release();
    }
  });

  await t.test('switching to Local while a Sync read is pending cannot apply the old Sync snapshot', async t => {
    const read = pauseNextRead(t);
    const local = renamedData('Chosen local workspace');
    publish(renamedData('Old Sync snapshot'));
    try {
      await read.wait();
      await changeStorageMode('local', local);
      read.release();
      await delay(200);
      assert.equal(storage.getMode(), 'local');
      assert.equal(getState().data.bookmarks[0].name, 'Chosen local workspace');
      assert.equal((await originalGet(null)).bookmarks[0].name, 'Chosen local workspace');
    } finally {
      read.release();
    }
  });
});
