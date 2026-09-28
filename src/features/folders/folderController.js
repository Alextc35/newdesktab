import { openCreateFolder } from './folderEditorModal.js';

let initialized = false;

export function initFolderController() {
  if (initialized) return;
  initialized = true;

  document.getElementById('add-folder')?.addEventListener('click', openCreateFolder);
}
