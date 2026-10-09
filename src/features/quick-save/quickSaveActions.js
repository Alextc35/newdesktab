import { getState, waitForPersistence } from '../../state/appStore.js';
import { addBookmark, updateBookmarkById } from '../bookmarks/bookmarkActions.js';
import { prepareQuickBookmark } from './quickSaveModel.js';

let pendingCreationId = null;

/** Saves against the latest state, then waits for the durable storage commit. */
export async function saveQuickBookmark(request) {
  const data = getState().data;
  if (!data.bookmarks.some(bookmark => bookmark.id === pendingCreationId)) pendingCreationId = null;
  const result = prepareQuickBookmark({
    ...data, bookmarks: data.bookmarks.filter(bookmark => bookmark.id !== pendingCreationId)
  }, request);
  if (result.reason) return result;

  const created = pendingCreationId
    ? updateBookmarkById(pendingCreationId, result.bookmark)
    : addBookmark(result.bookmark);
  if (!created) return { reason: 'invalid-bookmark' };
  pendingCreationId = created.id;
  const persistence = await waitForPersistence();
  if (persistence.status !== 'saved') {
    return { reason: 'storage-error', error: persistence.error };
  }
  pendingCreationId = null;
  return { reason: null, bookmark: created };
}
