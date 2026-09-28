import { t } from '../../platform/i18n/i18n.js';
import { isGridKeyboardActive } from '../grid/gridKeyboardController.js';
import { applyGridItemPosition } from '../grid/gridItemLayout.js';
import { addGridItemPointerControls } from '../grid/gridPointerController.js';
import { isGridItemSelected } from '../grid/gridSelection.js';
import { addFolderActions } from './folderCardActions.js';
import { openFolderModal } from './folderModal.js';
import { applyFolderAppearance, createFolderVisual } from './folderVisual.js';

/** Creates a resizable folder card for the bookmark grid. */
export function createFolderElement({ container, folder, bookmarks, isEditing }) {
  const element = document.createElement('div');
  element.className = 'bookmark bookmark-folder';
  element.dataset.folderId = folder.id;
  element.classList.toggle('is-single-cell', folder.w === 1 && folder.h === 1);
  element.classList.toggle('is-editing', isEditing);
  element.classList.toggle('is-selected', isGridItemSelected('folder', folder.id));
  element.classList.toggle('is-keyboard-active', isGridKeyboardActive(folder.id));
  applyFolderAppearance(element, folder);
  applyGridItemPosition(container, element, folder);

  const button = document.createElement('button');
  button.className = 'folder-open';
  button.type = 'button';
  button.title = folder.name;
  button.setAttribute('aria-label', t('folder.open', {
    name: folder.name,
    count: bookmarks.length
  }));

  const visual = createFolderVisual(folder, bookmarks);

  const title = document.createElement('span');
  title.className = 'folder-title';
  title.textContent = folder.name;

  const count = document.createElement('span');
  count.className = 'folder-count';
  count.textContent = t('folder.count', { count: bookmarks.length });

  const caption = document.createElement('span');
  caption.className = 'folder-caption';
  caption.append(title, count);

  const dropFeedback = document.createElement('span');
  dropFeedback.className = 'folder-drop-feedback';
  dropFeedback.textContent = t('folder.dropHint');

  button.append(visual, caption, dropFeedback);
  button.addEventListener('click', event => {
    if (element.classList.contains('is-editing')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (element.dataset.suppressFolderOpen === 'true') {
      event.preventDefault();
      return;
    }
    openFolderModal(folder.id);
  });
  element.append(button);

  if (isEditing) {
    enableFolderEditing(container, element, folder);
  }

  return element;
}

/** Adds controls and interactions which only exist while the grid is editable. */
export function enableFolderEditing(container, element, folder) {
  element.classList.add('is-editing');
  if (element.dataset.editingControlsAttached === 'true') return;

  element.dataset.editingControlsAttached = 'true';
  addFolderActions(element, folder);
  addGridItemPointerControls(container, element, folder, { kind: 'folder' });
}
