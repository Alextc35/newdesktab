import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  formatShortcut,
  isReservedShortcut,
  shortcutFromKeyboardEvent
} from '../../shared/keyboard/keyboardShortcuts.js';
import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { flashError, flashInfo, flashSuccess } from '../../shared/ui/flash.js';
import {
  getDraftKeyboardShortcuts,
  replaceDraftKeyboardShortcuts,
  setDraftKeyboardShortcut
} from './settingsDraft.js';

/** Initializes the editable keyboard-shortcut settings section. */
export function initShortcutSection({ onRequestSaveStateUpdate }) {
  const buttons = [...document.querySelectorAll('.shortcut-capture')];
  const reset = document.getElementById('shortcut-reset-defaults');
  let recordingAction = null;

  function syncUI() {
    const shortcuts = getDraftKeyboardShortcuts();
    for (const button of buttons) {
      const { shortcutAction: action } = button.dataset;
      const isRecording = action === recordingAction;
      if (isRecording) button.textContent = t('settingsModal.shortcuts.press');
      else renderShortcut(button, shortcuts[action]);
      button.classList.toggle('is-recording', isRecording);
      button.setAttribute('aria-pressed', String(isRecording));
      button.setAttribute('aria-label', t('settingsModal.shortcuts.change', {
        action: t(`settingsModal.shortcuts.actions.${action}.title`),
        shortcut: formatShortcut(shortcuts[action]) || t('settingsModal.shortcuts.unassigned')
      }));
    }
  }

  function startRecording(action) {
    recordingAction = action;
    syncUI();
  }

  function stopRecording() {
    recordingAction = null;
    syncUI();
  }

  for (const button of buttons) {
    button.addEventListener('click', () => startRecording(button.dataset.shortcutAction));
    button.addEventListener('contextmenu', event => {
      event.preventDefault();
      setDraftKeyboardShortcut(button.dataset.shortcutAction, null);
      stopRecording();
      flashInfo('settingsModal.shortcuts.unassignedFlash');
      onRequestSaveStateUpdate();
    });
    button.addEventListener('blur', () => {
      if (recordingAction === button.dataset.shortcutAction) stopRecording();
    });
    button.addEventListener('keydown', event => {
      const action = button.dataset.shortcutAction;
      if (recordingAction !== action) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        stopRecording();
        flashInfo('settingsModal.shortcuts.cancelled');
        return;
      }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;

      const shortcut = shortcutFromKeyboardEvent(event);
      if (!shortcut) {
        flashError('settingsModal.shortcuts.modifierRequired');
        return;
      }
      if (isReservedShortcut(shortcut)) {
        flashError('settingsModal.shortcuts.reserved');
        return;
      }

      const shortcuts = getDraftKeyboardShortcuts();
      const hasConflict = Object.keys(shortcuts).some(
        candidate => candidate !== action && shortcuts[candidate] === shortcut
      );
      if (hasConflict) {
        flashError('settingsModal.shortcuts.conflict');
        return;
      }

      setDraftKeyboardShortcut(action, shortcut);
      stopRecording();
      flashSuccess('settingsModal.shortcuts.updated');
      onRequestSaveStateUpdate();
    });
  }

  reset.addEventListener('click', () => {
    replaceDraftKeyboardShortcuts(DEFAULT_KEYBOARD_SHORTCUTS);
    recordingAction = null;
    syncUI();
    flashSuccess('settingsModal.shortcuts.restored');
    onRequestSaveStateUpdate();
  });

  subscribeLanguageChange(() => syncUI());
  return { syncUI };
}

function renderShortcut(button, shortcut) {
  if (!shortcut) {
    button.textContent = t('settingsModal.shortcuts.unassigned');
    return;
  }
  const parts = formatShortcut(shortcut).split(' + ').filter(Boolean);
  const fragment = document.createDocumentFragment();
  parts.forEach((part, index) => {
    if (index > 0) fragment.append(document.createTextNode('+'));
    const key = document.createElement('kbd');
    key.textContent = part;
    fragment.append(key);
  });
  button.replaceChildren(fragment);
}
