import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackupArchive, isBackupArchive, readBackupArchive } from '../src/platform/backup/backupArchive.js';
import { BlobReader, BlobWriter, ZipWriter } from '../src/platform/backup/vendor/zip.js';
import { createBackupEnvelope, migratePersistedData } from '../src/platform/storage/dataSchema.js';
import { MAX_VIDEO_BYTES } from '../src/platform/images/localVideos.js';

const reference = 'newdesktab-local-video:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
const data = migratePersistedData({ bookmarks: [], settings: { theme: {
  backgroundMedia: [{ id: 'video', type: 'video', local: reference, source: 'local' }]
} } });
const content = 'binary video fixture 🎬';
const video = { blob: new Blob([content], { type: 'video/webm' }), name: 'Vídeo 🎬.webm' };
const descriptor = { path: 'videos/1.webm', type: 'video/webm', name: video.name };
const manifest = () => ({ format: 'newdesktab-backup-zip', archiveVersion: 1,
  backup: createBackupEnvelope(data), videos: { [reference]: descriptor } });

async function fixture({ payload = manifest(), files = [{ name: 'videos/1.webm', blob: video.blob }], level = 0 } = {}) {
  const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false, level });
  await writer.add('backup.json', new BlobReader(new Blob([JSON.stringify(payload)])));
  for (const { name, blob, options } of files) await writer.add(name, new BlobReader(blob), options);
  return writer.close();
}

test('binary ZIP round trip preserves Unicode names and video bytes without base64', async () => {
  const archive = await createBackupArchive(data, {}, { [reference]: video });
  assert.equal(archive.type, 'application/zip');
  assert.equal(await isBackupArchive(archive), true);
  const restored = await readBackupArchive(archive);
  assert.equal(restored.data.settings.theme.backgroundMedia[0].local, reference);
  assert.equal(restored.localVideos[reference].name, video.name);
  assert.equal(restored.localVideos[reference].blob.type, 'video/webm');
  assert.equal(await restored.localVideos[reference].blob.text(), content);
  const bytes = Buffer.from(await archive.arrayBuffer());
  assert.ok(bytes.includes(Buffer.from(content)));
  assert.equal(bytes.includes(Buffer.from('data:video/webm;base64,')), false);
});

test('recompressed backups remain readable using the native streaming inflater', async () => {
  const restored = await readBackupArchive(await fixture({ level: 6 }));
  assert.equal(await restored.localVideos[reference].blob.text(), content);
});

test('JSON and truncated inputs are not mistaken for ZIP backups', async () => {
  assert.equal(await isBackupArchive(new Blob(['{}'])), false);
  assert.equal(await isBackupArchive(new Blob([])), false);
  await assert.rejects(readBackupArchive(new Blob(['PKbroken'])));
});

for (const [name, change] of [
  ['unsupported archive version', value => { value.archiveVersion = 2; }],
  ['missing referenced file', value => { value.videos[reference].path = 'videos/2.webm'; }],
  ['unsupported video MIME', value => { value.videos[reference].type = 'text/html'; }],
  ['unsafe manifest path', value => { value.videos[reference].path = '../1.webm'; }],
  ['unreferenced metadata', value => { value.videos.unused = descriptor; }],
  ['oversized filename metadata', value => { value.videos[reference].name = 'x'.repeat(1025); }],
  ['mixed base64 and binary representations', value => { value.backup.localVideos[reference] = { dataUrl: 'data:video/webm;base64,AA==' }; }]
]) {
  test(`rejects ${name} before restoration`, async () => {
    const value = JSON.parse(JSON.stringify(manifest()));
    change(value);
    await assert.rejects(readBackupArchive(await fixture({ payload: value })));
  });
}

test('rejects an unexpected file and an empty referenced video', async () => {
  await assert.rejects(readBackupArchive(await fixture({ files: [
    { name: 'videos/1.webm', blob: video.blob }, { name: 'extra.txt', blob: new Blob(['extra']) }
  ] })));
  await assert.rejects(readBackupArchive(await fixture({ files: [
    { name: 'videos/1.webm', blob: new Blob([]) }
  ] })));
});

test('CRC verification rejects damaged video data', async () => {
  const bytes = Buffer.from(await (await fixture()).arrayBuffer());
  const offset = bytes.indexOf(Buffer.from(content));
  assert.ok(offset > 0);
  bytes[offset] ^= 1;
  await assert.rejects(readBackupArchive(new Blob([bytes])));
});

test('rejects a directory claiming an oversized video before decoding it', async () => {
  const bytes = Buffer.from(await (await fixture()).arrayBuffer());
  const directory = bytes.lastIndexOf(Buffer.from('videos/1.webm')) - 46;
  assert.equal(bytes.readUInt32LE(directory), 0x02014b50);
  bytes.writeUInt32LE(MAX_VIDEO_BYTES + 1, directory + 24);
  await assert.rejects(readBackupArchive(new Blob([bytes])));
});
