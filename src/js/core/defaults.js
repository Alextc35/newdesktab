import '../types/types.js'; // typedefs
import {
  BOOKMARK_DRAG_MODES,
  BOOKMARK_RESIZE_MODES
} from '../domain/settings/gridInteractionModes.js';
import { DEFAULT_KEYBOARD_SHORTCUTS } from '../shared/keyboard/keyboardShortcuts.js';
import {
  DEFAULT_BOOKMARK,
  DEFAULT_BOOKMARK_STRUCTURE,
  DEFAULT_BOOKMARK_STYLE
} from '../domain/bookmarks/bookmarkDefaults.js';
import { DEFAULT_FOLDER_STYLE } from '../domain/folders/folderDefaults.js';
import {
  DEFAULT_RECYCLE_BIN,
  DEFAULT_RECYCLE_BIN_STYLE,
  RECYCLE_BIN_ID
} from '../domain/recycle-bin/recycleBinDefaults.js';
import { DATA_SCHEMA_VERSION } from '../platform/storage/schemaVersion.js';

export {
  DEFAULT_BOOKMARK,
  DEFAULT_BOOKMARK_STRUCTURE,
  DEFAULT_BOOKMARK_STYLE,
  DEFAULT_FOLDER_STYLE,
  DEFAULT_RECYCLE_BIN,
  DEFAULT_RECYCLE_BIN_STYLE,
  DATA_SCHEMA_VERSION,
  RECYCLE_BIN_ID
};

/**
 * Initial bookmarks used when no persisted data exists.
 *
 * These are only applied on first application load.
 * Each bookmark:
 * - Generates a runtime `id`
 * - Extends DEFAULT_BOOKMARK
 *
 * Currently, this is an empty array, but can be populated with default bookmarks if desired.
 * 
 * @type {Bookmark[]}
 */
export const DEFAULT_BOOKMARKS = [
  // {
  //   id: crypto.randomUUID(),
  //   ...DEFAULT_BOOKMARK,
  //   name: 'DEVELOPED BY',
  //   url: 'https://www.alextc.es',
  //   urlLocked: true,
  //   noBackground: false,
  //   backgroundColor: '#161b22',
  //   gy: 1,
  // },
  // {
  //   id: crypto.randomUUID(),
  //   ...DEFAULT_BOOKMARK,
  //   name: 'banana',
  //   backgroundImageUrl: 'https://cdn.osxdaily.com/wp-content/uploads/2013/07/dancing-banana.gif',
  //   backgroundImageUrlLocked: true,
  //   backgroundFavicon: false,
  //   noBackground: false,
  //   backgroundColor: '#eeff00',
  //   showText: false,
  //   showFavicon: false,
  //   gx: 1,
  //   gy: 1
  // }
];

/**
 * Default application settings.
 *
 * Defines the initial Settings state used
 * when no persisted settings exist.
 *
 * @type {Settings}
 */
export const DEFAULT_SETTINGS = {
  language: 'system',
  interfaceTheme: 'system',
  bookmarkDragMode: BOOKMARK_DRAG_MODES.NONE,
  bookmarkResizeMode: BOOKMARK_RESIZE_MODES.SMOOTH,
  keyboardShortcuts: structuredClone(DEFAULT_KEYBOARD_SHORTCUTS),
  showRecycleBin: true,

  theme: {
    backgroundDefault: true,
    backgroundSolid: false,
    backgroundColor: '#ffffff',
    backgroundImageColor: '#ffffff',
    backgroundImageUrl: null,
    backgroundImageLocal: null,
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: false
  },

  bookmarkDefault: {
    ...DEFAULT_BOOKMARK_STYLE
  },

  bookmarkPresets: [],
  bookmarkGroups: [],
  activeBookmarkGroupId: null
};

/**
 * Default application state.
 *
 * Acts as the single source of truth for
 * the full initial AppState structure.
 *
 * @type {AppState}
 */
export const DEFAULT_STATE = {
  data: {
    schemaVersion: DATA_SCHEMA_VERSION,
    bookmarks: structuredClone(DEFAULT_BOOKMARKS),
    folders: [],
    widgets: [],
    recycleBin: structuredClone(DEFAULT_RECYCLE_BIN),
    trash: [],
    settings: structuredClone(DEFAULT_SETTINGS)
  },
  ui: {
    isEditing: false,
    persistence: {
      status: 'idle',
      error: null,
      updatedAt: null
    },
    history: {
      canUndo: false,
      canRedo: false
    }
  }
};
