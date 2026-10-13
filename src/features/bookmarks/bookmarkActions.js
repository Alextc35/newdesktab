import '../../types/types.js'; // typedefs
import { debug } from '../../shared/diagnostics/debug.js';
import { getState, setState } from '../../state/appStore.js';
import {
  createBookmarkDraft,
  normalizeBookmark as normalizeBookmarkValue,
  validateBookmarkDraft
} from '../../domain/bookmarks/bookmarkModel.js';
import { getGridItemsInGroup } from '../grid/gridSelectors.js';
import { moveAllToRecycleBin } from '../recycle-bin/recycleBinActions.js';

/**
 * Adds a new bookmark to the application state.
 *
 * The input data can be partial. Missing properties
 * will be normalized with default values.
 *
 * @param {Partial<Bookmark>} data - Partial bookmark data.
 * @returns {Bookmark} The created bookmark.
 */
export function addBookmark(data) {
  const trace = debug.start('Create bookmark');
  const { data: { bookmarks, settings } } = getState();
  const validation = validateBookmarkDraft(data);
  if (!validation.isValid) {
    trace.end({ status: 'skipped', reason: 'Invalid data' });
    return null;
  }

  const bookmark = normalizeBookmarkValue(validation.value, {
    preset: settings.bookmarkDefault
  });
  const updated = [...bookmarks, bookmark];

  setState({ data: { bookmarks: updated } }, { debugTrace: trace });

  return bookmark;
}

/**
 * Updates an existing bookmark by its id.
 *
 * Merges the provided partial data with the current bookmark
 * and normalizes the result to ensure all required properties exist.
 *
 * @param {string} bookmarkId - The id of the bookmark to update.
 * @param {Partial<Bookmark>} updatedData - Partial data to merge into the bookmark.
 * @returns {Bookmark|null} The updated bookmark, or null if not found.
 */
export function updateBookmarkById(bookmarkId, updatedData) {
  const trace = debug.start('Edit bookmark', { bookmarkId });
  const { data } = getState();
  const { bookmarks } = data;

  let updatedBookmark = null;

  const updated = bookmarks.map(b => {
    if (b.id !== bookmarkId) return b;

    const validation = validateBookmarkDraft({
      ...b,
      ...updatedData
    });

    if (!validation.isValid) return b;
    updatedBookmark = normalizeBookmarkValue({
      ...b,
      ...validation.value
    });

    return updatedBookmark;
  });

  if (!updatedBookmark) {
    trace.end({ status: 'skipped', reason: 'Not found or invalid data' });
    return null;
  }

  setState({ data: { bookmarks: updated } }, { debugTrace: trace });

  return updatedBookmark;
}

/**
 * Removes all bookmarks from the state.
 * 
 * @param {Object} [options]
 * @param {boolean} [options.includeFolders=false]
 * @return {boolean} True if all requested data was removed, false otherwise.
 */
export function clearBookmarks({ includeFolders = false } = {}) {
  return moveAllToRecycleBin({ includeFolders });
}

/**
 * Returns every item reserving a cell in a workspace.
 * Kept here as a bookmark-facing helper for placement controllers.
 *
 * @param {string|null} groupId
 */
export function getOccupiedGridItems(groupId) {
  return getGridItemsInGroup(getState().data, groupId);
}

export { createBookmarkDraft };
