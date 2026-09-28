export const SYNC_META_KEY = 'newdesktabSyncMeta';
export const SYNC_CHUNK_PREFIX = 'newdesktabSyncChunk:';
export const SYNC_FORMAT_VERSION = 1;

const SYNC_ITEM_SAFE_BYTES = 7600;

/**
 * Splits serialized data into values that remain below storage.sync's
 * per-item quota, including escaped JSON string characters.
 *
 * @param {string} serialized
 * @returns {string[]}
 */
export function splitSyncPayload(serialized) {
  if (!serialized) return [''];

  const encoder = new TextEncoder();
  const chunks = [];
  let start = 0;

  while (start < serialized.length) {
    let low = start + 1;
    let high = serialized.length;
    let best = start;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = serialized.slice(start, middle);
      const bytes = encoder.encode(JSON.stringify(candidate)).length;

      if (bytes <= SYNC_ITEM_SAFE_BYTES) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    if (best === start) {
      throw new Error('A synchronized storage chunk could not be created.');
    }

    chunks.push(serialized.slice(start, best));
    start = best;
  }

  return chunks;
}

/** @param {number} chunkCount */
export function getSyncChunkKeys(chunkCount) {
  return Array.from(
    { length: chunkCount },
    (_, index) => `${SYNC_CHUNK_PREFIX}${index}`
  );
}

/**
 * Creates the exact key/value representation written to storage.sync.
 *
 * @param {*} data
 * @param {{schemaVersion: number, writerDeviceId: string|null, updatedAt?: number, writeId?: string}} options
 */
export function encodeSyncPayload(data, options) {
  const chunks = splitSyncPayload(JSON.stringify(data));
  const items = Object.fromEntries(
    chunks.map((chunk, index) => [`${SYNC_CHUNK_PREFIX}${index}`, chunk])
  );
  const meta = {
    version: SYNC_FORMAT_VERSION,
    schemaVersion: options.schemaVersion,
    chunkCount: chunks.length,
    updatedAt: options.updatedAt ?? Date.now(),
    writerDeviceId: options.writerDeviceId,
    writeId: options.writeId ?? crypto.randomUUID()
  };

  items[SYNC_META_KEY] = meta;
  return { chunks, items, meta };
}

/**
 * Validates the transport header before callers allocate or request chunks.
 *
 * @param {*} meta
 * @returns {*}
 */
export function validateSyncMetadata(meta) {
  if (meta?.version > SYNC_FORMAT_VERSION) {
    const error = new Error('The synchronized NewDeskTab data uses a newer format.');
    error.code = 'UNSUPPORTED_SYNC_FORMAT';
    error.requiredSyncFormatVersion = meta.version;
    error.supportedSyncFormatVersion = SYNC_FORMAT_VERSION;
    throw error;
  }

  if (
    meta?.version !== SYNC_FORMAT_VERSION
    || !Number.isInteger(meta.chunkCount)
    || meta.chunkCount < 1
  ) {
    throw new Error('The synchronized NewDeskTab data has an unsupported format.');
  }

  return meta;
}

/**
 * Decodes a complete sync payload and reports protocol errors explicitly.
 *
 * @param {*} meta
 * @param {Record<string, *>} values
 * @returns {*}
 */
export function decodeSyncPayload(meta, values) {
  validateSyncMetadata(meta);
  const keys = getSyncChunkKeys(meta.chunkCount);
  if (keys.some(key => typeof values[key] !== 'string')) {
    throw new Error('The synchronized NewDeskTab data is incomplete.');
  }

  try {
    return JSON.parse(keys.map(key => values[key]).join(''));
  } catch (error) {
    throw new Error('The synchronized NewDeskTab data is invalid.', { cause: error });
  }
}

/**
 * Best-effort decoding for diagnostics. Invalid or incomplete payloads do not
 * prevent the rest of the storage usage report from being displayed.
 *
 * @param {Record<string, *>} values
 * @returns {*|null}
 */
export function tryDecodeSyncPayload(values) {
  try {
    return decodeSyncPayload(values[SYNC_META_KEY], values);
  } catch {
    return null;
  }
}

/** @param {string} key */
export function isSyncTransportKey(key) {
  return key === SYNC_META_KEY || key.startsWith(SYNC_CHUNK_PREFIX);
}
