import assert from 'node:assert/strict';
import test from 'node:test';
import { createStorageIO } from '../src/platform/storage/storageIO.js';
import { DATA_SCHEMA_VERSION } from '../src/platform/storage/schemaVersion.js';
import { migratePersistedData } from '../src/platform/storage/dataSchema.js';
import {
  encodeSyncPayload,
  SYNC_CHUNK_PREFIX,
  SYNC_FORMAT_VERSION,
  SYNC_META_KEY
} from '../src/platform/sync/syncTransport.js';

function selectValues(values, keys) {
  if (keys === null) return structuredClone(values);
  return Object.fromEntries((Array.isArray(keys) ? keys : [keys])
    .filter(key => Object.hasOwn(values, key))
    .map(key => [key, structuredClone(values[key])]));
}

function createReader(initialValues, afterSnapshot) {
  let values = structuredClone(initialValues);
  const reads = [];
  const writers = [];
  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      sync: {
        get(keys, callback) {
          reads.push(keys);
          const snapshot = selectValues(values, keys);
          afterSnapshot?.({
            keys,
            count: reads.length,
            replace: next => { values = structuredClone(next); }
          });
          callback(snapshot);
        }
      }
    }
  };
  const io = createStorageIO({
    getDeviceId: () => 'this-device',
    observeSyncWriter: writer => writers.push(writer)
  });
  return { ...io, reads, writers };
}

function encode(data, writeId = 'first-write') {
  return encodeSyncPayload(data, {
    schemaVersion: data.schemaVersion,
    writerDeviceId: `device-${writeId}`,
    updatedAt: 100,
    writeId
  });
}

const DATA = {
  schemaVersion: DATA_SCHEMA_VERSION,
  bookmarks: [{ id: 'first', name: 'First bookmark', url: 'https://example.test' }],
  folders: [],
  settings: { language: 'es' }
};

test('reads a complete payload spanning multiple synchronized chunks', async () => {
  const data = {
    ...DATA,
    bookmarks: Array.from({ length: 120 }, (_, index) => ({
      id: `bookmark-${index}`,
      name: `Bookmark ${index}: ${'x'.repeat(80)}`,
      url: `https://example.test/${index}`
    }))
  };
  const encoded = encode(data);
  assert.ok(encoded.chunks.length > 1);
  const reader = createReader(encoded.items);

  assert.deepEqual(await reader.readSyncData(), data);
  assert.deepEqual(reader.writers, ['device-first-write']);
});

test('discards a snapshot if another write replaces its metadata before confirmation', async () => {
  const first = encode(DATA);
  const updated = { ...DATA, bookmarks: [{ ...DATA.bookmarks[0], name: 'Updated remotely' }] };
  const second = encode(updated, 'second-write');
  const reader = createReader(first.items, ({ count, replace }) => {
    if (count === 1) replace(second.items);
  });

  assert.deepEqual(await reader.readSyncData(), updated);
  assert.deepEqual(reader.writers, ['device-second-write']);
});

test('stops retrying when synchronized metadata keeps changing', async () => {
  let generation = 0;
  const reader = createReader(encode(DATA).items, ({ keys, replace }) => {
    if (keys === null) replace(encode(DATA, `write-${++generation}`).items);
  });

  await assert.rejects(reader.readSyncData(), /changed while being read/);
  assert.equal(generation, 3);
  assert.deepEqual(reader.writers, []);
});

test('retries when a header arrives before its chunks and accepts the completed payload', async () => {
  const encoded = encode(DATA);
  const reader = createReader({ [SYNC_META_KEY]: encoded.meta }, ({ count, replace }) => {
    if (count === 1) replace(encoded.items);
  });

  assert.deepEqual(await reader.readSyncData(), DATA);
  assert.deepEqual(reader.writers, ['device-first-write']);
});

test('chunks arriving before their header are incomplete data rather than a deletion', async () => {
  const encoded = encode(DATA);
  const incomplete = { [`${SYNC_CHUNK_PREFIX}0`]: encoded.chunks[0] };
  const reader = createReader(incomplete);

  await assert.rejects(reader.readSyncData(), /incomplete/);
  assert.equal(reader.reads.length, 3);
  assert.deepEqual(reader.writers, []);
});

test('accepts chunks once their delayed header becomes available', async () => {
  const encoded = encode(DATA);
  const reader = createReader({ [`${SYNC_CHUNK_PREFIX}0`]: encoded.chunks[0] }, ({ count, replace }) => {
    if (count === 1) replace(encoded.items);
  });

  assert.deepEqual(await reader.readSyncData(), DATA);
});

test('incomplete and invalid payloads fail after bounded retries', async () => {
  const encoded = encode(DATA);
  for (const [values, message] of [
    [{ [SYNC_META_KEY]: encoded.meta }, /incomplete/],
    [{ ...encoded.items, [SYNC_META_KEY]: { ...encoded.meta, payloadChecksum: undefined },
      [`${SYNC_CHUNK_PREFIX}0`]: '{invalid JSON' }, /invalid/]
  ]) {
    const reader = createReader(values);
    await assert.rejects(reader.readSyncData(), message);
    assert.equal(reader.reads.length, 3);
    assert.deepEqual(reader.writers, []);
  }
});

test('keeps legacy direct-key payloads readable and distinguishes an empty Sync area', async () => {
  const legacy = createReader(DATA);
  const restored = await legacy.readSyncData();
  assert.equal(restored.schemaVersion, DATA.schemaVersion);
  assert.deepEqual(restored.bookmarks, DATA.bookmarks);
  assert.deepEqual(restored.settings, DATA.settings);

  const empty = createReader({ unrelatedExtensionSetting: true });
  assert.equal(await empty.readSyncData(), null);
});

test('rejects a future transport format without retrying or observing its writer', async () => {
  const encoded = encode(DATA);
  encoded.items[SYNC_META_KEY].version = SYNC_FORMAT_VERSION + 1;
  const reader = createReader(encoded.items);

  await assert.rejects(reader.readSyncData(), {
    code: 'UNSUPPORTED_SYNC_FORMAT',
    requiredSyncFormatVersion: SYNC_FORMAT_VERSION + 1
  });
  assert.equal(reader.reads.length, 1);
  assert.deepEqual(reader.writers, []);
});

test('preserves a future data schema for the facade compatibility check', async () => {
  const data = { ...DATA, schemaVersion: DATA_SCHEMA_VERSION + 1, futureField: 'preserved' };
  const reader = createReader(encode(data).items);

  assert.deepEqual(await reader.readSyncData(), data);
});

test('retries a valid JSON mixture until chunks match the current header checksum', async () => {
  const oldData = { head: 'old', padding: 'x'.repeat(8000), tail: 'old' };
  const newData = { head: 'new', padding: 'x'.repeat(8000), tail: 'new' };
  const oldPayload = encode(oldData);
  const newPayload = encode(newData, 'new-write');
  const mixed = { ...newPayload.items, [`${SYNC_CHUNK_PREFIX}1`]: oldPayload.chunks[1] };
  const reader = createReader(mixed, ({ count, replace }) => {
    if (count === 1) replace(newPayload.items);
  });

  assert.deepEqual(await reader.readSyncData(), newData);
  assert.deepEqual(reader.writers, ['device-new-write']);
});

test('round-trips bookmarks, nested folders, widgets, workspaces and portable settings', async () => {
  const data = migratePersistedData({
    bookmarks: [{ id: 'link', name: 'Saved link', url: 'https://example.test',
      groupId: 'work', folderId: 'child', iconId: 'music', gx: 1, gy: 2, w: 2, h: 1 }],
    folders: [
      { id: 'parent', name: 'Projects', groupId: 'work', parentId: null },
      { id: 'child', name: 'Nested', groupId: 'work', parentId: 'parent' }
    ],
    widgets: [{ id: 'clock', type: 'clock', version: 1, groupId: 'work',
      gx: 3, gy: 1, w: 2, h: 1, config: { timezone: 'Europe/Madrid' } }],
    settings: {
      language: 'es', interfaceTheme: 'dark', activeBookmarkGroupId: 'work',
      bookmarkGroups: [{ id: 'work', name: 'Work', backgroundColor: '#123456' }],
      mainWorkspace: { backgroundSolid: true, backgroundColor: '#654321' },
      bookmarkPresets: [{ id: 'preset', name: 'Reading', style: { iconId: 'music' } }],
      keyboardShortcuts: { addBookmark: 'Ctrl+Shift+B' }
    }
  });
  const reader = createReader(encode(data).items);
  const restored = await reader.readSyncData();

  assert.deepEqual(restored, data);
  assert.equal(restored.bookmarks[0].folderId, 'child');
  assert.equal(restored.folders[1].parentId, 'parent');
  assert.equal(restored.widgets[0].config.timezone, 'Europe/Madrid');
  assert.equal(restored.settings.bookmarkGroups[0].name, 'Work');
  assert.equal(restored.settings.mainWorkspace.backgroundColor, '#654321');
  assert.equal(restored.settings.bookmarkPresets[0].style.iconId, 'music');
  assert.equal(restored.settings.keyboardShortcuts.addBookmark, 'Ctrl+Shift+B');
});
