/**
 * Portable, dependency-free editable-project ZIP packager.
 * Run from any working directory: node promo-video/scripts/package.mjs
 *
 * The ZIP uses STORE (uncompressed) entries. Audio/video/font assets already
 * account for most bytes, and this avoids an OS-specific archiver dependency.
 * Every local header, central directory record and payload CRC is re-read and
 * verified before the completed archive replaces the final output filename.
 */
import { open, readdir, lstat, readFile, mkdir, rename, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'output', 'newdesktab-promo-editable.zip');
const temporary = `${output}.tmp`;
const prefix = 'newdesktab-promo/';
const U32_MAX = 0xffffffff;
const utf8Flag = 0x0800;

const requiredRootFiles = [
  'README.md', 'RESEARCH.md', 'LICENSE-ASSETS.md',
  'package.json', 'package-lock.json', 'tsconfig.json', 'remotion.config.ts', '.gitignore',
];
const requiredReports = ['output/capture-report.json', 'output/validation-report.json'];
const optionalReports = [
  'output/main-render.json', 'output/vertical-render.json',
  'output/main-preview-render.json', 'output/vertical-preview-render.json',
  'output/QA-report.md', 'output/QA-report.json',
  'output/qa-report.md', 'output/qa-report.json',
  'output/preview/QA-report.md', 'output/preview/QA-report.json',
  'output/preview/qa-report.md', 'output/preview/qa-report.json',
];
// Only these trees and extensions are eligible. No arbitrary root directory,
// hidden folder, browser profile, symlink or media in output/ can enter the ZIP.
const sourceTrees = new Map([
  ['src', new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.json', '.svg'])],
  ['scripts', new Set(['.mjs', '.js', '.ts', '.json'])],
  ['public/branding', new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.json', '.md', '.txt'])],
  ['public/assets', new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.ttf', '.otf', '.woff', '.woff2', '.json', '.md', '.txt'])],
  ['public/audio', new Set(['.wav', '.mp3', '.ogg', '.m4a', '.json', '.md', '.txt'])],
  ['public/captures', new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.json', '.md', '.txt'])],
]);
const blockedDirectories = new Set(['node_modules', '_raw', '.cache', '.git', '.capture-profile']);
const blockedFiles = new Set(['capture-error.png']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function exists(file) {
  try { await access(file, constants.F_OK); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function safeArchivePath(path) {
  assert(path.startsWith(prefix), `Entry is outside archive prefix: ${path}`);
  assert(!path.includes('\\') && !path.includes('\0') && !path.includes(':'), `Invalid archive path: ${path}`);
  assert(path.split('/').every(part => part && part !== '.' && part !== '..'), `Unsafe archive path: ${path}`);
}

const files = new Map();
let excludedFiles = 0;
async function include(relative, source = join(root, relative)) {
  const entry = prefix + relative.replaceAll('\\', '/');
  safeArchivePath(entry);
  const stat = await lstat(source);
  assert(stat.isFile() && !stat.isSymbolicLink(), `Expected a regular file: ${relative}`);
  assert(stat.size <= U32_MAX, `ZIP64 would be required for ${relative}.`);
  assert(!files.has(entry), `Duplicate archive path: ${entry}`);
  files.set(entry, { source, stat });
}
async function includeTree(relative, extensions) {
  const directory = join(root, relative);
  const stat = await lstat(directory);
  assert(stat.isDirectory() && !stat.isSymbolicLink(), `Expected a real source directory: ${relative}`);
  const children = await readdir(directory, { withFileTypes: true });
  children.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const child of children) {
    const nested = `${relative}/${child.name}`;
    if (child.name.startsWith('.') || blockedDirectories.has(child.name) || blockedFiles.has(child.name) || child.isSymbolicLink()) {
      excludedFiles++;
      continue;
    }
    if (child.isDirectory()) await includeTree(nested, extensions);
    else if (child.isFile() && extensions.has(extname(child.name).toLowerCase())) await include(nested);
    else excludedFiles++;
  }
}

// Packaging a final deliverable requires the actual final technical QA result.
const validationFile = join(root, 'output', 'validation-report.json');
assert(await exists(validationFile), 'Render and validate both final videos before packaging: npm run validate');
const validation = JSON.parse(await readFile(validationFile, 'utf8'));
assert(validation.status === 'passed', `Final validation must pass before packaging (current: ${validation.status ?? 'unknown'}).`);
for (const id of ['landscape', 'vertical']) {
  assert(validation.exports?.some(item => item.id === id && item.status === 'passed'), `The ${id} export has not passed validation.`);
}
for (const relative of [...requiredRootFiles, ...requiredReports]) await include(relative);
const localLicense = join(root, 'LICENSE');
await include('LICENSE', await exists(localLicense) ? localLicense : join(root, '..', 'LICENSE'));
for (const [directory, extensions] of sourceTrees) await includeTree(directory, extensions);
for (const relative of optionalReports) if (await exists(join(root, relative))) await include(relative);
assert(files.size < 0xffff, 'This archive would require ZIP64 entry counts.');

// IEEE CRC-32, as specified by the ZIP format (polynomial 0xEDB88320).
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  crcTable[n] = crc >>> 0;
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function dosDateTime(date) {
  const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
  };
}

async function verifyArchive(file, expected) {
  const zip = await readFile(file);
  assert(zip.length >= 22, 'ZIP end record is missing.');
  const end = zip.length - 22;
  assert(zip.readUInt32LE(end) === 0x06054b50, 'Invalid ZIP end signature.');
  assert(zip.readUInt16LE(end + 4) === 0 && zip.readUInt16LE(end + 6) === 0, 'Unexpected multi-disk ZIP.');
  assert(zip.readUInt16LE(end + 8) === expected.size && zip.readUInt16LE(end + 10) === expected.size, 'ZIP entry count mismatch.');
  assert(zip.readUInt16LE(end + 20) === 0, 'Unexpected ZIP archive comment.');
  const centralSize = zip.readUInt32LE(end + 12);
  const centralOffset = zip.readUInt32LE(end + 16);
  assert(centralOffset + centralSize === end, 'ZIP central directory bounds mismatch.');
  let cursor = centralOffset;
  let previousPayloadEnd = 0;
  const seen = new Set();
  for (let i = 0; i < expected.size; i++) {
    assert(cursor + 46 <= end, 'Truncated central directory.');
    assert(zip.readUInt32LE(cursor) === 0x02014b50, 'Invalid central header signature.');
    assert(zip.readUInt16LE(cursor + 8) === utf8Flag && zip.readUInt16LE(cursor + 10) === 0, 'Unexpected encryption, flags or compression.');
    const crc = zip.readUInt32LE(cursor + 16);
    const size = zip.readUInt32LE(cursor + 20);
    assert(size === zip.readUInt32LE(cursor + 24), 'STORE entry has mismatched sizes.');
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const nameEnd = cursor + 46 + nameLength;
    assert(nameEnd + extraLength + commentLength <= end, 'Central directory name is out of bounds.');
    const name = zip.subarray(cursor + 46, nameEnd).toString('utf8');
    safeArchivePath(name);
    assert(expected.has(name) && !seen.has(name), `Unexpected or duplicate entry: ${name}`);
    assert(localOffset === previousPayloadEnd && localOffset + 30 <= centralOffset, `Invalid local offset: ${name}`);
    assert(zip.readUInt32LE(localOffset) === 0x04034b50, `Invalid local signature: ${name}`);
    assert(zip.readUInt16LE(localOffset + 6) === utf8Flag && zip.readUInt16LE(localOffset + 8) === 0, `Local entry flags differ: ${name}`);
    assert(zip.readUInt32LE(localOffset + 14) === crc, `Local CRC differs: ${name}`);
    assert(zip.readUInt32LE(localOffset + 18) === size && zip.readUInt32LE(localOffset + 22) === size, `Local size differs: ${name}`);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    assert(dataOffset + size <= centralOffset, `Entry data is out of bounds: ${name}`);
    assert(zip.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8') === name, `Local name differs: ${name}`);
    assert(crc32(zip.subarray(dataOffset, dataOffset + size)) === crc, `Payload CRC failed: ${name}`);
    seen.add(name);
    previousPayloadEnd = dataOffset + size;
    cursor = nameEnd + extraLength + commentLength;
  }
  assert(previousPayloadEnd === centralOffset && cursor === end, 'Unaccounted ZIP bytes.');
  return { entries: seen.size, bytes: zip.length, crcVerified: true };
}

await mkdir(dirname(output), { recursive: true });
const archive = await open(temporary, 'w');
const centralRecords = [];
let offset = 0;
try {
  async function append(buffer) {
    assert(offset + buffer.length <= U32_MAX, 'This archive would require ZIP64 offsets.');
    let written = 0;
    while (written < buffer.length) {
      const result = await archive.write(buffer, written, buffer.length - written, offset + written);
      assert(result.bytesWritten > 0, 'Archive write made no progress.');
      written += result.bytesWritten;
    }
    offset += buffer.length;
  }
  // Stable path order makes archive contents predictable and reviewable.
  for (const [name, { source, stat }] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const data = await readFile(source);
    const encodedName = Buffer.from(name, 'utf8');
    const stamp = dosDateTime(stat.mtime);
    const crc = crc32(data);
    const localOffset = offset;
    assert(data.length <= U32_MAX && encodedName.length <= 0xffff, `Entry exceeds ZIP32 limits: ${name}`);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(utf8Flag, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10); local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(encodedName.length, 26);
    await append(local); await append(encodedName); await append(data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(utf8Flag, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12); central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(encodedName.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); central.writeUInt32LE(localOffset, 42);
    centralRecords.push(central, encodedName);
  }
  const centralOffset = offset;
  for (const record of centralRecords) await append(record);
  const centralSize = offset - centralOffset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(centralOffset, 16);
  await append(end);
  await archive.sync();
  await archive.close();
  const verified = await verifyArchive(temporary, files);
  await rename(temporary, output);
  console.log(JSON.stringify({ output, ...verified, excludedItems: excludedFiles, includesFinalMp4: false }, null, 2));
} catch (error) {
  await archive.close().catch(() => {});
  await rm(temporary, { force: true }).catch(() => {});
  throw error;
}
