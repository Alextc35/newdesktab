import '../../types/types.js';

export const RECYCLE_BIN_ID = 'newdesktab-recycle-bin';

/** Default appearance for the recycle-bin card. */
export const DEFAULT_RECYCLE_BIN_STYLE = Object.freeze({
  animateIcon: true,
  noBackground: true,
  backgroundColor: null,
  backgroundImageUrl: null,
  backgroundImageLocal: null,
  backgroundImageSource: 'url',
  backgroundImageUrlLocked: false,
  iconColor: '#475569',
  textColor: null,
  showName: true
});

/** The recycle bin is a first-class grid item, visible only in Main. */
export const DEFAULT_RECYCLE_BIN = Object.freeze({
  id: RECYCLE_BIN_ID,
  ...DEFAULT_RECYCLE_BIN_STYLE,
  gx: 0,
  gy: 0,
  w: 1,
  h: 1,
  groupId: null,
  updatedAt: 0
});
