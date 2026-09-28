import {
  findShortcutAction,
  formatAriaShortcut,
  normalizeKeyboardShortcuts,
  SHORTCUT_ACTIONS
} from '../../shared/keyboard/keyboardShortcuts.js';
import { getState } from '../../core/store.js';
import { hasOpenModal, isModalActive } from '../../shared/ui/modalManager.js';

let initialized = false;

/** Initializes customizable page shortcuts and their accessibility hints. */
export function initKeyboardShortcuts() {
  if (initialized) return;
  initialized = true;
  document.addEventListener('keydown', handleShortcut, true);
  syncKeyboardShortcutAccessibility(getState().data.settings.keyboardShortcuts);
}

/** Keeps visible controls aligned with the currently persisted shortcuts. */
export function syncKeyboardShortcutAccessibility(shortcuts) {
  const normalized = normalizeKeyboardShortcuts(shortcuts);
  const targets = {
    [SHORTCUT_ACTIONS.TOGGLE_EDITING]: ['#edit-toggle-mode', '#folder-modal-edit-toggle'],
    [SHORTCUT_ACTIONS.ADD_BOOKMARK]: ['#add-bookmark'],
    [SHORTCUT_ACTIONS.ADD_FOLDER]: ['#add-folder'],
    [SHORTCUT_ACTIONS.OPEN_SETTINGS]: ['#settings']
  };

  for (const [action, selectors] of Object.entries(targets)) {
    const ariaShortcut = formatAriaShortcut(normalized[action]);
    for (const selector of selectors) {
      document.querySelector(selector)?.setAttribute('aria-keyshortcuts', ariaShortcut);
    }
  }
}

function handleShortcut(event) {
  if (event.defaultPrevented) return;
  const editableTarget = event.target.closest?.(
    'input, textarea, select, [contenteditable="true"], [data-shortcut-action]'
  );
  if (editableTarget && !editableTarget.closest('.modal[hidden]')) return;

  const action = findShortcutAction(
    event,
    getState().data.settings.keyboardShortcuts
  );
  if (!action) return;

  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) return;

  if (hasOpenModal()) {
    if (action === SHORTCUT_ACTIONS.TOGGLE_EDITING && isModalActive('folder')) {
      document.getElementById('folder-modal-edit-toggle')?.click();
    }
    return;
  }

  const targets = {
    [SHORTCUT_ACTIONS.TOGGLE_EDITING]: 'edit-toggle-mode',
    [SHORTCUT_ACTIONS.ADD_BOOKMARK]: 'add-bookmark',
    [SHORTCUT_ACTIONS.ADD_FOLDER]: 'add-folder',
    [SHORTCUT_ACTIONS.OPEN_SETTINGS]: 'settings'
  };
  document.getElementById(targets[action])?.click();
}
