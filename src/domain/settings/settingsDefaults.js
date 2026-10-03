import '../../types/types.js';
import { DEFAULT_BOOKMARK_STYLE } from '../bookmarks/bookmarkDefaults.js';
import {
  BOOKMARK_DRAG_MODES,
  BOOKMARK_RESIZE_MODES
} from './gridInteractionModes.js';
import { DEFAULT_KEYBOARD_SHORTCUTS } from '../../shared/keyboard/keyboardShortcuts.js';
import { DEFAULT_WALLPAPER_INTERVAL } from './wallpaperMedia.js';
import { DEFAULT_RECYCLE_BIN_RETENTION_DAYS } from './recycleBinRetention.js';

/** Default settings used when no persisted preference exists. */
export const DEFAULT_SETTINGS = {
  language: 'system',
  interfaceTheme: 'system',
  bookmarkDragMode: BOOKMARK_DRAG_MODES.NONE,
  bookmarkResizeMode: BOOKMARK_RESIZE_MODES.SMOOTH,
  keyboardShortcuts: structuredClone(DEFAULT_KEYBOARD_SHORTCUTS),
  showRecycleBin: true,
  recycleBinRetentionDays: DEFAULT_RECYCLE_BIN_RETENTION_DAYS,

  theme: {
    backgroundDefault: true,
    backgroundSolid: false,
    backgroundColor: '#ffffff',
    backgroundImageColor: '#ffffff',
    backgroundImageUrl: null,
    backgroundImageLocal: null,
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: false,
    backgroundPrimaryType: 'image',
    backgroundVideo: { url: null, local: null, source: 'url' },
    backgroundMedia: [],
    backgroundRotationSeconds: DEFAULT_WALLPAPER_INTERVAL
  },

  bookmarkDefault: {
    ...DEFAULT_BOOKMARK_STYLE
  },

  bookmarkPresets: [],
  bookmarkGroups: [],
  activeBookmarkGroupId: null
};
