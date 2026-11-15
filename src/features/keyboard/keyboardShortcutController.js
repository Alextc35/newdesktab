import {
  findShortcutAction,
  formatAriaShortcut,
  normalizeKeyboardShortcuts,
  normalizeShortcut,
  shortcutFromKeyboardEvent,
  SHORTCUT_ACTIONS
} from '../../shared/keyboard/keyboardShortcuts.js';
import { getSettings, getState } from '../../state/appStore.js';
import { hasOpenModal, isModalActive } from '../../shared/ui/modalManager.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceSelectors.js';
import { openWorkspaceSettings } from '../workspaces/workspaceSettingsModal.js';

let initialized = false;

/** Initializes customizable page shortcuts and their accessibility hints. */
export function initKeyboardShortcuts() {
  if (initialized) return;
  initialized = true;
  document.addEventListener('keydown', handleShortcut, true);
  syncKeyboardShortcutAccessibility(getSettings().keyboardShortcuts);
}

/** Keeps visible controls aligned with the currently persisted shortcuts. */
export function syncKeyboardShortcutAccessibility(shortcuts) {
  const normalized = normalizeKeyboardShortcuts(shortcuts);
  const targets = {
    [SHORTCUT_ACTIONS.TOGGLE_EDITING]: ['#edit-toggle-mode', '#folder-modal-edit-toggle'],
    [SHORTCUT_ACTIONS.ADD_BOOKMARK]: ['#add-bookmark'],
    [SHORTCUT_ACTIONS.ADD_FOLDER]: ['#add-folder'],
    [SHORTCUT_ACTIONS.OPEN_WIDGETS]: ['#add-widgets'],
    [SHORTCUT_ACTIONS.OPEN_SETTINGS]: ['#settings']
  };

  for (const [action, selectors] of Object.entries(targets)) {
    const ariaShortcut = formatAriaShortcut(normalized[action]);
    for (const selector of selectors) {
      const control = document.querySelector(selector);
      if (ariaShortcut) control?.setAttribute('aria-keyshortcuts', ariaShortcut);
      else control?.removeAttribute('aria-keyshortcuts');
    }
  }
  const workspaceControl = document.getElementById('workspace-settings-current');
  const workspaceShortcut = formatAriaShortcut(getWorkspaceSettingsShortcut(normalized));
  if (workspaceShortcut) workspaceControl?.setAttribute('aria-keyshortcuts', workspaceShortcut);
  else workspaceControl?.removeAttribute('aria-keyshortcuts');
}

/** Adds Control to settings unless that combination already has another owner. */
function getWorkspaceSettingsShortcut(shortcuts) {
  const settingsShortcut = shortcuts[SHORTCUT_ACTIONS.OPEN_SETTINGS];
  if (!settingsShortcut || settingsShortcut.split('+').includes('Ctrl')) return null;
  const workspaceShortcut = normalizeShortcut(`Ctrl+${settingsShortcut}`);
  return workspaceShortcut && !Object.values(shortcuts).includes(workspaceShortcut)
    ? workspaceShortcut
    : null;
}

function handleShortcut(event) {
  if (event.defaultPrevented) return;
  const editableTarget = event.target.closest?.(
    'input, textarea, select, [contenteditable="true"], [data-shortcut-action]'
  );
  if (editableTarget && !editableTarget.closest('.modal[hidden]')) return;

  const shortcuts = normalizeKeyboardShortcuts(getSettings().keyboardShortcuts);
  const action = findShortcutAction(event, shortcuts);
  const workspaceShortcut = getWorkspaceSettingsShortcut(shortcuts);
  const opensWorkspaceSettings = !action && workspaceShortcut
    && workspaceShortcut === shortcutFromKeyboardEvent(event);
  if (!action && (!opensWorkspaceSettings || hasOpenModal())) return;

  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) return;

  if (hasOpenModal()) {
    if (action === SHORTCUT_ACTIONS.TOGGLE_EDITING && isModalActive('folder')) {
      document.getElementById('folder-modal-edit-toggle')?.click();
    }
    return;
  }

  if (opensWorkspaceSettings) {
    openWorkspaceSettings(getActiveWorkspaceId(getState().data));
    return;
  }

  const targets = {
    [SHORTCUT_ACTIONS.TOGGLE_EDITING]: 'edit-toggle-mode',
    [SHORTCUT_ACTIONS.ADD_BOOKMARK]: 'add-bookmark',
    [SHORTCUT_ACTIONS.ADD_FOLDER]: 'add-folder',
    [SHORTCUT_ACTIONS.OPEN_WIDGETS]: 'add-widgets',
    [SHORTCUT_ACTIONS.OPEN_SETTINGS]: 'settings'
  };
  document.getElementById(targets[action])?.click();
}
