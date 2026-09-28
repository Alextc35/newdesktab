import { clockWidget as clockGridItem } from './clockGridItem.js';
import { initClockSettings, openCreateClock } from './clockSettings.js';

/** Complete bundled definition: grid capabilities plus its owned UI surface. */
export const clockWidget = Object.freeze({
  ...clockGridItem,
  catalog: Object.freeze({
    nameKey: 'clock.name',
    descriptionKey: 'clock.description',
    icon: '◷'
  }),
  create: openCreateClock,
  initialize: initClockSettings
});
