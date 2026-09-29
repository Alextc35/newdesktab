import '../../types/types.js';

/** New-folder defaults; older folders without noOuterBackground keep their card. */
export const DEFAULT_FOLDER_STYLE = Object.freeze({
  noBackground: false,
  backgroundColor: '#38bdf8',
  outerBackgroundColor: null,
  noOuterBackground: true,
  backgroundImageUrl: null,
  backgroundImageLocal: null,
  backgroundImageSource: 'url',
  backgroundImageUrlLocked: false,
  textColor: '#f8fafc',
  showFolder: true,
  showPreviews: true,
  showName: true,
  showCount: true
});
