import { t } from '../../platform/i18n/i18n.js';
import { applyFolderAppearance, createFolderVisual } from './folderVisual.js';

/** Creates one read-only folder row for the compact workspace list. */
export function createFolderListItem(folder, {
  count = 0,
  active = false,
  onOpen
} = {}) {
  const row = document.createElement('li');
  row.className = 'bookmark bookmark-list-item bookmark-folder';
  row.dataset.folderId = folder.id;
  row.classList.toggle('is-keyboard-active', active);
  applyFolderAppearance(row, folder);

  const button = document.createElement('button');
  button.className = 'bookmark-list-link folder-open';
  button.type = 'button';
  button.title = folder.name;
  button.setAttribute('aria-label', t('folder.open', { name: folder.name, count }));
  button.addEventListener('click', onOpen);

  const icon = document.createElement('span');
  icon.className = 'bookmark-list-icon is-folder-icon';
  icon.append(createFolderVisual(folder, [], { compact: true }));

  const copy = document.createElement('span');
  copy.className = 'bookmark-list-copy';
  const name = document.createElement('span');
  name.className = 'bookmark-list-name';
  name.textContent = folder.name || '—';
  const detail = document.createElement('span');
  detail.className = 'bookmark-list-detail';
  detail.textContent = t('folder.count', { count });
  copy.append(name, detail);

  const arrow = document.createElement('span');
  arrow.className = 'bookmark-list-arrow';
  arrow.textContent = '›';
  arrow.setAttribute('aria-hidden', 'true');
  button.append(icon, copy, arrow);
  row.append(button);
  return row;
}
