import '../../types/types.js';
import { DEFAULT_BOOKMARKS } from '../../domain/bookmarks/bookmarkDefaults.js';
import { DEFAULT_RECYCLE_BIN } from '../../domain/recycle-bin/recycleBinDefaults.js';
import { DEFAULT_SETTINGS } from '../../domain/settings/settingsDefaults.js';
import { DATA_SCHEMA_VERSION } from './schemaVersion.js';

/** Creates an isolated default value for the complete persisted-data contract. */
export function createDefaultPersistedData() {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    bookmarks: structuredClone(DEFAULT_BOOKMARKS),
    folders: [],
    widgets: [],
    recycleBin: structuredClone(DEFAULT_RECYCLE_BIN),
    trash: [],
    settings: structuredClone(DEFAULT_SETTINGS)
  };
}
