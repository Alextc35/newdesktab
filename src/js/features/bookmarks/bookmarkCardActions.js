import { t } from '../../platform/i18n/i18n.js';
import { createItemActionButton } from '../../shared/ui/itemActionButton.js';
import { isGridItemSurfaceDark } from '../grid/gridItemAppearance.js';
import { openEditBookmark } from './bookmarkModal.js';

/** Adds the direct edit control owned by a bookmark card. */
export function addBookmarkActions(container, bookmark) {
  const themeClass = isGridItemSurfaceDark(bookmark) ? 'is-dark' : 'is-light';
  const actions = document.createElement('div');
  actions.className = 'item-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', t('bookmarkActions.ariaLabel'));

  const editButton = createItemActionButton('✎', 'edit', themeClass, () => {
    openEditBookmark(bookmark.id);
  });
  editButton.setAttribute('aria-label', t('bookmarkActions.edit'));
  actions.append(editButton);
  container.append(actions);
}
