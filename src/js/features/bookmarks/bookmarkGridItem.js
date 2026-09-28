import { createBookmarkElement } from './bookmarkCard.js';
import { openEditBookmark } from './bookmarkModal.js';
import { moveBookmarksToRecycleBin } from '../recycle-bin/recycleBinActions.js';
import { permanentlyDeleteGridItem } from '../grid/gridItemActions.js';
import { addBookmarkActions } from './bookmarkCardActions.js';
import { isGridKeyboardActive } from '../grid/gridKeyboardController.js';
import { addGridItemPointerControls } from '../grid/gridPointerController.js';
import { isGridItemSelected } from '../grid/gridSelection.js';
import { createBookmarkListItem } from './bookmarkListItem.js';
import { applyGridItemPosition } from '../grid/gridItemLayout.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceSelectors.js';
import { t } from '../../platform/i18n/i18n.js';

export const bookmarkGridItem = Object.freeze({
  type: 'bookmark',
  order: { grid: 10, list: 30 },
  selector: '.bookmark[data-bookmark-id]',
  getElementId: element => element.dataset.bookmarkId,
  selectable: true,
  clearKeyboardOnOpen: true,
  select: state => state.data.bookmarks
    .filter(bookmark => !bookmark.folderId
      && (bookmark.groupId ?? null) === getActiveWorkspaceId(state.data)),
  render({ view, container, item, state }) {
    if (view === 'list') {
      return createBookmarkListItem(item, {
        active: isGridKeyboardActive(item.id)
      });
    }

    const element = createBookmarkElement(item, { isEditing: state.ui.isEditing });
    element.dataset.bookmarkId = item.id;
    element.classList.toggle('is-selected', isGridItemSelected('bookmark', item.id));
    element.classList.toggle('is-keyboard-active', isGridKeyboardActive(item.id));
    applyGridItemPosition(container, element, item);
    if (state.ui.isEditing) enableBookmarkEditing(container, element, item);
    element.addEventListener('click', event => {
      if (!element.classList.contains('is-editing')) return;
      event.preventDefault();
      event.stopPropagation();
    });
    return element;
  },
  enableEditing: enableBookmarkEditing,
  open({ element }) {
    const link = element?.querySelector('.bookmark-link');
    if (link?.href) window.location.assign(link.href);
  },
  edit: ({ item }) => openEditBookmark(item.id),
  getRemovalConfirmation({ item, permanent }) {
    return t(permanent
      ? 'alert.bookmark.confirmPermanentDelete'
      : 'alert.bookmark.confirmDelete', { name: item.name });
  },
  remove({ item, permanent }) {
    return permanent
      ? permanentlyDeleteGridItem('bookmark', item.id).deleted
      : moveBookmarksToRecycleBin([item.id]) > 0;
  }
});

export function enableBookmarkEditing(container, element, bookmark) {
  if (element.dataset.editingControlsAttached === 'true') return;
  element.dataset.editingControlsAttached = 'true';
  element.classList.add('is-editing');
  element.querySelector('.bookmark-link')?.classList.add('is-editing');
  addBookmarkActions(element, bookmark);
  addGridItemPointerControls(container, element, bookmark);
}
