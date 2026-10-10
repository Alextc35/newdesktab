import { downloadBlob } from './blobDownload.js';

/** Downloads a JSON-serializable value through a temporary browser URL. */
export function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json'
  });
  downloadBlob(blob, filename);
}
