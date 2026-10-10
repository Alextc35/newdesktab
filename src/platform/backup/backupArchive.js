import { BlobReader, BlobWriter, ZipReader, ZipWriter } from './vendor/zip.js';
import { collectLocalVideoReferences, MAX_VIDEO_BYTES } from '../images/localVideos.js';
import { createBackupEnvelope, parseBackupPayload } from '../storage/dataSchema.js';

const MANIFEST = 'backup.json';
const FORMAT = 'newdesktab-backup-zip';
const VERSION = 1;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 128;
const VIDEO_EXTENSIONS = new Map([['video/mp4', 'mp4'], ['video/webm', 'webm'], ['video/ogg', 'ogg']]);
const ZIP_OPTIONS = { useWebWorkers: false, chunkSize: 256 * 1024 };

/** Videos are already compressed: STORE keeps streaming fast and avoids base64. */
export async function createBackupArchive(data, localImages, localVideos) {
  const videos = {};
  const files = [];
  for (const reference of collectLocalVideoReferences(data)) {
    const record = localVideos[reference];
    const extension = VIDEO_EXTENSIONS.get(record?.blob?.type);
    if (!extension || !record.blob.size || record.blob.size > MAX_VIDEO_BYTES
      || typeof record.name !== 'string' || record.name.length > 1024) throw invalidArchive();
    const path = `videos/${files.length + 1}.${extension}`;
    videos[reference] = { path, type: record.blob.type, name: record.name };
    files.push({ path, blob: record.blob });
  }
  if (files.length + 1 > MAX_ENTRIES) throw invalidArchive();
  const manifest = new Blob([JSON.stringify({
    format: FORMAT, archiveVersion: VERSION, backup: createBackupEnvelope(data, { localImages }), videos
  }, null, 2)], { type: 'application/json' });
  if (manifest.size > MAX_MANIFEST_BYTES) throw invalidArchive();
  const writer = new ZipWriter(new BlobWriter('application/zip'), { ...ZIP_OPTIONS, level: 0 });
  try {
    await writer.add(MANIFEST, new BlobReader(manifest));
    for (const { path, blob } of files) await writer.add(path, new BlobReader(blob));
    return await writer.close();
  } catch (error) {
    await writer.close().catch(() => {});
    throw error;
  }
}

/** Validates the whole archive before handing files to any persistence operation. */
export async function readBackupArchive(file, currentData) {
  const reader = new ZipReader(new BlobReader(file), {
    ...ZIP_OPTIONS, strictness: 'strict', checkCrc32: true, checkOverlappingEntry: true
  });
  try {
    const entries = new Map();
    for await (const entry of reader.getEntriesGenerator()) {
      if (entries.size >= MAX_ENTRIES || entries.has(entry.filename) || entry.directory
        || entry.encrypted || entry.symlink || !Number.isSafeInteger(entry.uncompressedSize)
        || entry.uncompressedSize < 0) throw invalidArchive();
      const limit = entry.filename === MANIFEST ? MAX_MANIFEST_BYTES : MAX_VIDEO_BYTES;
      if (entry.uncompressedSize > limit) throw invalidArchive();
      entries.set(entry.filename, entry);
    }
    const manifestEntry = entries.get(MANIFEST);
    if (!manifestEntry) throw invalidArchive();
    const manifest = JSON.parse(await (await readEntry(manifestEntry, 'application/json')).text());
    if (manifest?.format !== FORMAT || manifest.archiveVersion !== VERSION
      || manifest.backup?.format !== 'newdesktab-backup'
      || !manifest.videos || typeof manifest.videos !== 'object' || Array.isArray(manifest.videos)
      || Object.keys(manifest.backup.localVideos ?? {}).length) throw invalidArchive();
    const data = parseBackupPayload(manifest.backup, currentData);
    const references = collectLocalVideoReferences(data);
    if (Object.keys(manifest.videos).length !== references.size) throw invalidArchive();
    const usedPaths = new Set([MANIFEST]);
    const localVideos = {};
    for (const reference of references) {
      const record = manifest.videos[reference];
      const extension = VIDEO_EXTENSIONS.get(record?.type);
      if (!extension || !new RegExp(`^videos/[1-9][0-9]*\\.${extension}$`).test(record.path)
        || usedPaths.has(record.path) || typeof record.name !== 'string' || record.name.length > 1024) {
        throw invalidArchive();
      }
      const entry = entries.get(record.path);
      if (!entry || !entry.uncompressedSize) throw invalidArchive();
      usedPaths.add(record.path);
      localVideos[reference] = { blob: await readEntry(entry, record.type), name: record.name };
    }
    if (usedPaths.size !== entries.size) throw invalidArchive();
    return { data, localImages: manifest.backup.localImages, localVideos };
  } finally {
    await reader.close();
  }
}

/** Bounds actual decoded bytes too, rather than trusting ZIP directory sizes. */
async function readEntry(entry, type) {
  const output = new BlobWriter(type);
  const target = output.writable.getWriter();
  let written = 0;
  const bounded = new WritableStream({
    write(chunk) {
      written += chunk.byteLength;
      if (written > entry.uncompressedSize) throw invalidArchive();
      return target.write(chunk);
    },
    close: () => target.close(),
    abort: reason => target.abort(reason)
  });
  try {
    await entry.getData(bounded, { ...ZIP_OPTIONS, checkCrc32: true, checkOverlappingEntry: true });
    const blob = await output.getData();
    if (blob.size !== entry.uncompressedSize) throw invalidArchive();
    return blob;
  } catch (error) {
    await target.abort(error).catch(() => {});
    throw error;
  } finally {
    target.releaseLock();
  }
}

export async function isBackupArchive(file) {
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function invalidArchive() {
  const error = new Error('Invalid NewDeskTab ZIP backup.');
  error.code = 'INVALID_BACKUP';
  return error;
}
