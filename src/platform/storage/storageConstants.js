export const STORAGE_MODES = Object.freeze({
  LOCAL: 'local',
  SYNC: 'sync'
});

export const STORAGE_MODE_KEY = 'newdesktabStorageMode';
export const SYNC_COMPATIBILITY_KEY = 'newdesktabSyncCompatibility';
export const DEVICE_ID_KEY = 'newdesktabDeviceId';
export const LOCAL_IMAGE_STORAGE_PREFIX = 'newdesktabLocalImage:';
export const LEGACY_SYNC_KEYS = [
  'schemaVersion',
  'bookmarks',
  'folders',
  'widgets',
  'recycleBin',
  'trash',
  'settings'
];
export const SYNC_LOCAL_SYSTEM_KEYS = new Set(['schemaVersion', 'settings', 'recycleBin']);
export const SYNC_LOCAL_BOOKMARK_KEYS = new Set(['bookmarks', 'folders']);
