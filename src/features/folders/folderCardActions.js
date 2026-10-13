import { t } from '../../platform/i18n/i18n.js';
import { createItemActionButton } from '../../shared/ui/itemActionButton.js';
import { isGridItemSurfaceDark } from '../grid/gridItemAppearance.js';
import { openFolderEditor } from './folderEditorModal.js';
import { confirmItemRecycle } from '../grid/gridItemRemoval.js';

export function addFolderActions(container, folder) {
  const themeClass = isFolderActionSurfaceDark(folder) ? 'is-dark' : 'is-light';
  const actions = document.createElement('div');
  actions.className = 'item-actions folder-item-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', t('folder.actions.ariaLabel'));

  const editButton = createItemActionButton(
    '✎',
    'edit',
    themeClass,
    () => openFolderEditor(folder.id)
  );
  editButton.setAttribute('aria-label', t('folder.actions.customize'));

  const deleteButton = createItemActionButton('', 'delete', themeClass, () => {
    void confirmItemRecycle('folder', folder.id);
  });
  deleteButton.setAttribute('aria-label', t('folder.actions.delete'));
  actions.append(editButton, deleteButton);
  container.append(actions);
}

function isFolderActionSurfaceDark(folder) {
  if (folder.outerBackgroundColor && !folder.noOuterBackground) {
    return isGridItemSurfaceDark({ backgroundColor: folder.outerBackgroundColor });
  }
  return true;
}
