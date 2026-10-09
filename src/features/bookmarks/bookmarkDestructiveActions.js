import { t } from '../../platform/i18n/i18n.js';
import { showConfirmWithCheckbox } from '../../shared/ui/alertModal.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { closeModal } from '../../shared/ui/modalManager.js';
import { clearBookmarks } from './bookmarkActions.js';
import { runPersistedAction } from '../persistence/persistedAction.js';

/** Confirms and moves every requested bookmark, optionally with folders, to trash. */
export async function deleteAllBookmarks() {
  const { confirmed, checkboxChecked: deleteFolders } = await showConfirmWithCheckbox(
    t('alert.bookmarks.confirmDeleteAll'),
    { checkboxLabel: t('alert.bookmarks.deleteFolders') }
  );

  if (!confirmed) return;

  await runPersistedAction('bookmarks-delete-all', () => clearBookmarks({ includeFolders: deleteFolders }), deleted => {
    if (deleted) {
      flashSuccess(deleteFolders
        ? 'flash.bookmarks.deletedAllWithFolders'
        : 'flash.bookmarks.deletedAll');
      closeModal('settings');
    } else {
      flashError('flash.bookmarks.deleteAllError');
    }
  });
}
