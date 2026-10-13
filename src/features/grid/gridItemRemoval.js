import { getState } from '../../state/appStore.js';
import { moveBookmarksToRecycleBin, moveFolderToRecycleBin } from '../recycle-bin/recycleBinActions.js';
import { t } from '../../platform/i18n/i18n.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { flashSuccess } from '../../shared/ui/flash.js';
import { runPersistedAction } from '../persistence/persistedAction.js';

let confirming = false;

/** One recoverable delete flow for direct buttons and Shift + middle click. */
export async function confirmItemRecycle(kind, id) {
  if (confirming || !['bookmark', 'folder'].includes(kind)) return;
  const { data } = getState();
  const item = data[kind === 'folder' ? 'folders' : 'bookmarks'].find(item => item.id === id);
  if (!item) return;
  confirming = true;
  try {
    const confirmed = await showAlert(t(kind === 'folder' ? 'folder.confirmDelete' : 'alert.bookmark.confirmDelete', {
      name: item.name,
      count: data.bookmarks.filter(bookmark => bookmark.folderId === id).length
    }), { type: 'confirm' });
    if (!confirmed) return;
    await runPersistedAction(`quick-delete:${kind}:${id}`, () => kind === 'folder'
      ? moveFolderToRecycleBin(id).deleted : moveBookmarksToRecycleBin([id]) > 0, deleted => {
      if (deleted) flashSuccess('flash.recycleBin.moved');
    });
  } finally { confirming = false; }
}
