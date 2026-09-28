import { getState } from '../../state/appStore.js';
import { t } from '../../platform/i18n/i18n.js';
import { closeModal, openModal, registerModal } from '../../shared/ui/modalManager.js';
import { getWorkspaces } from '../workspaces/workspaceSelectors.js';
import { searchBookmarks } from './searchBookmarks.js';

let initialized = false;
let input;
let results;

export function initSearchModal() {
  if (initialized) return;
  initialized = true;

  const modal = document.getElementById('search-modal');
  input = document.getElementById('search-modal-input');
  results = document.getElementById('search-modal-results');

  input.addEventListener('input', renderResults);
  document.getElementById('search-modal-close').addEventListener('click', closeModal);
  document.getElementById('search-bookmarks').addEventListener('click', openSearchModal);

  registerModal({
    id: 'search',
    element: modal,
    closeOnEsc: true,
    closeOnOverlay: true,
    shortcut: '/',
    onShortcut: openSearchModal,
    initialFocus: input
  });
}

export function openSearchModal() {
  input.value = '';
  renderResults();
  openModal('search', { onCancel: closeModal, initialFocus: input });
}

function renderResults() {
  const { data } = getState();
  const { bookmarks, folders } = data;
  const workspaces = new Map(getWorkspaces(data).map(workspace => [
    workspace.id,
    workspace.name
  ]));
  const folderNames = new Map(folders.map(folder => [folder.id, folder.name]));
  const matches = searchBookmarks(bookmarks, input.value);

  results.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = t('search.empty');
    results.append(empty);
    return;
  }

  for (const bookmark of matches) {
    const link = document.createElement('a');
    link.className = 'search-result';
    link.href = bookmark.url || '#';
    link.setAttribute('role', 'option');
    link.addEventListener('click', () => closeModal());

    const name = document.createElement('strong');
    name.textContent = bookmark.name;
    const detail = document.createElement('small');
    const workspace = workspaces.get(bookmark.groupId) ?? t('workspace.main');
    const folder = folderNames.get(bookmark.folderId);
    detail.textContent = [
      workspace,
      folder ? t('search.inFolder', { name: folder }) : null,
      bookmark.url || t('search.noUrl')
    ].filter(Boolean).join(' · ');
    link.append(name, detail);
    results.append(link);
  }
}
