import '../../types/types.js'; // typedefs
import { debug } from '../../shared/diagnostics/debug.js';
import { getState, setState } from '../../core/store.js';
import {
  applyBookmarkPreset,
  createBookmarkDraft,
  normalizeBookmark as normalizeBookmarkValue,
  validateBookmarkDraft
} from '../../domain/bookmarks/bookmarkModel.js';
import { findFirstFreeSlot } from '../../shared/grid/gridPlacement.js';
import { getGridItemsInGroup } from '../grid/gridSelectors.js';
import {
  moveAllToRecycleBin,
  moveBookmarksToRecycleBin
} from '../recycle-bin/recycleBinActions.js';

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
 * Updates several bookmarks in one state transition and one undo step.
 *
 * @param {Iterable<string>} bookmarkIds
 * @param {(bookmark: Bookmark) => Partial<Bookmark>} updater
 * @returns {Bookmark[]}
 */
export function updateBookmarksByIds(bookmarkIds, updater) {
  const trace = debug.start('Update multiple bookmarks');
  const ids = new Set(bookmarkIds);
  if (!ids.size) {
    trace.end({ status: 'skipped', reason: 'Empty selection' });
    return [];
  }

  const { data: { bookmarks } } = getState();
  const changed = [];
  const updated = bookmarks.map(bookmark => {
    if (!ids.has(bookmark.id)) return bookmark;

    const candidate = {
      ...bookmark,
      ...updater(structuredClone(bookmark))
    };
    const validation = validateBookmarkDraft(candidate);
    if (!validation.isValid) return bookmark;

    const nextBookmark = normalizeBookmarkValue({
      ...candidate,
      ...validation.value
    });
    changed.push(nextBookmark);
    return nextBookmark;
  });

  if (changed.length) setState({ data: { bookmarks: updated } }, { debugTrace: trace });
  else trace.end({ status: 'skipped', reason: 'No changes' });
  return changed;
}

/** @param {Iterable<string>} bookmarkIds */
export function deleteBookmarksByIds(bookmarkIds) {
  return moveBookmarksToRecycleBin(bookmarkIds);
}

/**
 * Applies appearance only, preserving identity and layout.
 *
 * @param {Iterable<string>} bookmarkIds
 * @param {BookmarkPreset} preset
 */
export function applyPresetToBookmarks(bookmarkIds, preset) {
  return updateBookmarksByIds(bookmarkIds, bookmark => (
    applyBookmarkPreset(bookmark, preset)
  ));
}

/**
 * Duplicates several bookmarks in one state transition. Each copy is placed in
 * the first free slot of its source workspace and immediately reserves that
 * slot for the next copy.
 *
 * @param {Iterable<string>} bookmarkIds
 * @param {Object} bounds
 * @param {number} bounds.columns
 * @param {number} bounds.rows
 * @param {string} [bounds.nameSuffix='copy']
 * @returns {{duplicates: Bookmark[], skipped: number}}
 */
export function duplicateBookmarksByIds(bookmarkIds, {
  columns,
  rows,
  nameSuffix = 'copy'
} = {}) {
  const trace = debug.start('Duplicate bookmarks');
  const ids = new Set(bookmarkIds);
  if (!ids.size) {
    trace.end({ status: 'skipped', reason: 'Empty selection' });
    return { duplicates: [], skipped: 0 };
  }

  const { data } = getState();
  const { bookmarks } = data;
  const sources = bookmarks.filter(bookmark => ids.has(bookmark.id));
  const occupied = [
    ...bookmarks.filter(bookmark => !bookmark.folderId),
    ...data.folders,
    ...(data.settings.showRecycleBin ? [data.recycleBin] : [])
  ];
  const duplicates = [];
  let skipped = 0;

  for (const bookmark of sources) {
    const groupBookmarks = occupied.filter(item => (
      (item.groupId ?? null) === (bookmark.groupId ?? null)
    ));
    const position = findFirstFreeSlot(groupBookmarks, {
      columns,
      rows,
      w: bookmark.w,
      h: bookmark.h
    });

    if (!position) {
      skipped += 1;
      continue;
    }

    const duplicate = createBookmarkDuplicate(bookmark, position, nameSuffix);
    duplicates.push(duplicate);
    occupied.push(duplicate);
  }

  if (duplicates.length) {
    setState({ data: { bookmarks: [...bookmarks, ...duplicates] } }, { debugTrace: trace });
  } else trace.end({ status: 'skipped', reason: 'No duplicates', skipped });

  return { duplicates, skipped };
}

function createBookmarkDuplicate(bookmark, position, nameSuffix) {
  const duplicate = structuredClone(bookmark);
  delete duplicate.id;
  delete duplicate.createdAt;
  delete duplicate.updatedAt;

  return normalizeBookmarkValue({
    ...duplicate,
    ...position,
    folderId: null,
    name: `${bookmark.name} (${nameSuffix})`
  });
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
