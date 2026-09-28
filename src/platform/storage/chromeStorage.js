/** Promise adapter for callback-based chrome.storage methods. */
export function callStorage(area, method, value) {
  return new Promise((resolve, reject) => {
    area[method](value, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

/** Estimates the bytes Chrome attributes to a group of storage entries. */
export function getStorageBytes(items) {
  const encoder = new TextEncoder();
  return Object.entries(items).reduce((total, [key, value]) => (
    total + encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length
  ), 0);
}
