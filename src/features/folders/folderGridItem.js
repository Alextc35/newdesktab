import { isGridKeyboardActive } from '../grid/gridKeyboardController.js';
import { countFolderTreeBookmarks } from '../../domain/folders/folderTree.js';
import { createFolderListItem } from './folderListItem.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceSelectors.js';
import { createFolderElement, enableFolderEditing } from './folderCard.js';
import { openFolderEditor } from './folderEditorModal.js';
import { openFolderModal } from './folderModal.js';
import { moveFolderToRecycleBin } from '../recycle-bin/recycleBinActions.js';
import { permanentlyDeleteGridItem } from '../grid/gridItemActions.js';
import { t } from '../../platform/i18n/i18n.js';

export const folderGridItem = Object.freeze({
  type: 'folder',
  order: { grid: 20, list: 20 },
  selector: '.bookmark-folder[data-folder-id]',
  getElementId: element => element.dataset.folderId,
  selectable: true,
  select(state) {
    const bookmarksByFolderId = new Map();
    for (const bookmark of state.data.bookmarks) {
      if (!bookmark.folderId) continue;
      const contents = bookmarksByFolderId.get(bookmark.folderId) ?? [];
      contents.push(bookmark);
      bookmarksByFolderId.set(bookmark.folderId, contents);
    }
    return state.data.folders
      .filter(folder => !folder.parentId && (folder.groupId ?? null) === getActiveWorkspaceId(state.data))
      .map(item => ({ item, bookmarks: bookmarksByFolderId.get(item.id) ?? [] }));
  },
  render({ view, container, item, bookmarks, state }) {
    if (view === 'list') {
      return createFolderListItem(item, {
        count: bookmarks.length,
        active: isGridKeyboardActive(item.id),
        onOpen: () => openFolderModal(item.id)
      });
    }
    return createFolderElement({
      container,
      folder: item,
      bookmarks,
      isEditing: state.ui.isEditing
    });
  },
  enableEditing: enableFolderEditing,
  open: ({ item }) => openFolderModal(item.id),
  edit: ({ item }) => openFolderEditor(item.id),
  getRemovalConfirmation({ item, state, permanent }) {
    const count = countFolderTreeBookmarks(state.data.folders, state.data.bookmarks, [item.id]);
    if (!permanent && count === 0) return null;
    return t(permanent
      ? 'folder.confirmPermanentDelete'
      : 'folder.confirmDelete', {
      name: item.name,
      count
    });
  },
  remove({ item, permanent }) {
    return permanent
      ? permanentlyDeleteGridItem('folder', item.id).deleted
      : moveFolderToRecycleBin(item.id).deleted;
  }
});
