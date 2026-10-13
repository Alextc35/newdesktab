import '../../types/types.js'; // typedefs
import { getState, setState } from '../../state/appStore.js';
import { ensureRecycleBinPosition } from '../recycle-bin/recycleBinActions.js';

/**
 * Updates the current settings in the application state by merging
 * a partial settings object into the existing settings.
 *
 * @param {Partial<Settings>} partial - Partial settings to update.
 * @returns {Promise<Settings>} The updated settings object.
 */
export async function updateSettings(partial) {
  const { data: { settings } } = getState();

  const updated = {
    ...settings,
    ...partial
  };

  await setState({ data: { settings: updated } });
  if (partial.showRecycleBin === true) ensureRecycleBinPosition();

  return updated;
}
