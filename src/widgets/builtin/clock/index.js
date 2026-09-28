import { clockWidget as clockGridItem } from './clockGridItem.js';
import { initClockSettings } from './clockSettings.js';

/** Complete bundled definition: grid capabilities plus its owned UI surface. */
export const clockWidget = Object.freeze({
  ...clockGridItem,
  initialize: initClockSettings
});
