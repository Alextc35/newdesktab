import '../../types/types.js';

/** Default visual style for a bookmark. */
export const DEFAULT_BOOKMARK_STYLE = {
  backgroundImageUrl: null,
  backgroundImageLocal: null,
  backgroundImageSource: 'url',
  backgroundImageUrlLocked: false,
  backgroundFavicon: true,
  invertColorBg: false,
  noBackground: true,
  backgroundColor: '#000000',
  showText: true,
  textColor: '#ffffff',
  showFavicon: true,
  invertColorIcon: false
};

/** Default structural values for a bookmark. */
export const DEFAULT_BOOKMARK_STRUCTURE = {
  name: '',
  url: '',
  urlLocked: false,
  gx: 0,
  gy: 0,
  w: 1,
  h: 1,
  groupId: null,
  folderId: null,
  createdAt: 0,
  updatedAt: 0
};

/** Canonical defaults for every bookmark property except its runtime id. */
export const DEFAULT_BOOKMARK = {
  ...DEFAULT_BOOKMARK_STRUCTURE,
  ...DEFAULT_BOOKMARK_STYLE
};

/** Starter bookmarks for a new profile. Kept empty until a curated set exists. */
export const DEFAULT_BOOKMARKS = [];
