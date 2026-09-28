import { t } from '../../platform/i18n/i18n.js';
import { showConfirmWithCheckbox } from '../../shared/ui/alertModal.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { closeModal } from '../../shared/ui/modalManager.js';
import { clearBookmarks } from './bookmarkActions.js';

/** Confirms and moves every requested bookmark, optionally with folders, to trash. */
export async function deleteAllBookmarks() {
  const { confirmed, checkboxChecked: deleteFolders } = await showConfirmWithCheckbox(
    t('alert.bookmarks.confirmDeleteAll'),
    { checkboxLabel: t('alert.bookmarks.deleteFolders') }
  );

  if (!confirmed) return;

  const deleted = clearBookmarks({ includeFolders: deleteFolders });
  if (deleted) {
    flashSuccess(deleteFolders
      ? 'flash.bookmarks.deletedAllWithFolders'
      : 'flash.bookmarks.deletedAll');
    closeModal();
  } else {
    flashError('flash.bookmarks.deleteAllError');
  }
}
