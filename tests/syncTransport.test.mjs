import assert from 'node:assert/strict';
import test from 'node:test';
import { DATA_SCHEMA_VERSION } from '../src/platform/storage/schemaVersion.js';

import {
  decodeSyncPayload,
  encodeSyncPayload,
  getSyncChunkKeys,
  isSyncTransportKey,
  splitSyncPayload,
  SYNC_CHUNK_PREFIX,
  SYNC_FORMAT_VERSION,
  SYNC_META_KEY,
  tryDecodeSyncPayload,
  validateSyncMetadata
} from '../src/platform/sync/syncTransport.js';

const encoder = new TextEncoder();

test('splits escaped and multibyte payloads below the sync per-item limit', () => {
  const serialized = JSON.stringify({
    text: 'NewDeskTab 🚀 "quoted" \\ '.repeat(900)
  });
  const chunks = splitSyncPayload(serialized);

  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(''), serialized);
  for (const chunk of chunks) {
    assert.ok(encoder.encode(JSON.stringify(chunk)).length <= 7600);
  }
});

test('encodes metadata and round-trips a synchronized payload', () => {
  const data = {
    schemaVersion: DATA_SCHEMA_VERSION,
    bookmarks: [{ id: 'bookmark-1', name: 'Example' }],
    folders: [],
    settings: { language: 'es' }
  };
  const encoded = encodeSyncPayload(data, {
    schemaVersion: DATA_SCHEMA_VERSION,
    writerDeviceId: 'device-1',
    updatedAt: 1234,
    writeId: 'write-1'
  });

  assert.deepEqual(encoded.meta, {
    version: SYNC_FORMAT_VERSION,
    schemaVersion: DATA_SCHEMA_VERSION,
    chunkCount: encoded.chunks.length,
    payloadChecksum: encoded.meta.payloadChecksum,
    updatedAt: 1234,
    writerDeviceId: 'device-1',
    writeId: 'write-1'
  });
  assert.match(encoded.meta.payloadChecksum, /^[0-9a-f]{8}$/);
  assert.deepEqual(getSyncChunkKeys(encoded.chunks.length), [
    `${SYNC_CHUNK_PREFIX}0`
  ]);
  assert.deepEqual(decodeSyncPayload(encoded.meta, encoded.items), data);
  assert.deepEqual(tryDecodeSyncPayload(encoded.items), data);
});

test('distinguishes unsupported, incomplete, and invalid sync payloads', () => {
  assert.throws(
    () => decodeSyncPayload({ version: SYNC_FORMAT_VERSION + 1, chunkCount: 1 }, {}),
    error => error.code === 'UNSUPPORTED_SYNC_FORMAT'
      && error.requiredSyncFormatVersion === SYNC_FORMAT_VERSION + 1
  );
  assert.throws(
    () => decodeSyncPayload({ version: SYNC_FORMAT_VERSION, chunkCount: 1 }, {}),
    /incomplete/
  );
  assert.throws(
    () => decodeSyncPayload(
      { version: SYNC_FORMAT_VERSION, chunkCount: 1 },
      { [`${SYNC_CHUNK_PREFIX}0`]: '{' }
    ),
    /invalid/
  );
  assert.equal(tryDecodeSyncPayload({ [SYNC_META_KEY]: { version: 0 } }), null);
  assert.throws(
    () => validateSyncMetadata({ version: SYNC_FORMAT_VERSION, chunkCount: 0 }),
    /unsupported format/
  );
});

test('recognizes only transport-owned sync keys', () => {
  assert.equal(isSyncTransportKey(SYNC_META_KEY), true);
  assert.equal(isSyncTransportKey(`${SYNC_CHUNK_PREFIX}3`), true);
  assert.equal(isSyncTransportKey('bookmarks'), false);
  assert.equal(isSyncTransportKey('unrelatedExtensionData'), false);
});

test('detects mixed chunks even when they still form valid JSON', () => {
  const oldData = { head: 'old', padding: 'x'.repeat(8000), tail: 'old' };
  const newData = { head: 'new', padding: 'x'.repeat(8000), tail: 'new' };
  const options = { schemaVersion: DATA_SCHEMA_VERSION, writerDeviceId: 'writer' };
  const oldPayload = encodeSyncPayload(oldData, options);
  const newPayload = encodeSyncPayload(newData, options);
  assert.ok(newPayload.chunks.length > 1);
  const mixed = { ...newPayload.items, [`${SYNC_CHUNK_PREFIX}1`]: oldPayload.chunks[1] };
  const serialized = getSyncChunkKeys(newPayload.chunks.length).map(key => mixed[key]).join('');
  assert.deepEqual(JSON.parse(serialized), { ...newData, tail: 'old' });
  assert.throws(() => decodeSyncPayload(newPayload.meta, mixed), { code: 'SYNC_PAYLOAD_MISMATCH' });
  assert.deepEqual(decodeSyncPayload(newPayload.meta, newPayload.items), newData);
});

test('accepts older payloads without checksum and hashes Unicode consistently', () => {
  const data = { text: 'DeskTab 🚀 áéí \\"'.repeat(200) };
  const options = { schemaVersion: DATA_SCHEMA_VERSION, writerDeviceId: 'writer' };
  const first = encodeSyncPayload(data, options);
  const second = encodeSyncPayload(data, options);
  assert.equal(first.meta.payloadChecksum, second.meta.payloadChecksum);
  assert.deepEqual(decodeSyncPayload(first.meta, first.items), data);
  const legacyMeta = { ...first.meta };
  delete legacyMeta.payloadChecksum;
  assert.deepEqual(decodeSyncPayload(legacyMeta, first.items), data);
});
