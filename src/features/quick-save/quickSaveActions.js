import { getState, waitForPersistence } from '../../state/appStore.js';
import { addBookmark } from '../bookmarks/bookmarkActions.js';
import { prepareQuickBookmark } from './quickSaveModel.js';

/** Saves against the latest state, then waits for the durable storage commit. */
export async function saveQuickBookmark(request) {
  const result = prepareQuickBookmark(getState().data, request);
  if (result.reason) return result;

  const created = addBookmark(result.bookmark);
  if (!created) return { reason: 'invalid-bookmark' };
  const persistence = await waitForPersistence();
  if (persistence.status !== 'saved') {
    return { reason: 'storage-error', error: persistence.error };
  }
  return { reason: null, bookmark: created };
}
