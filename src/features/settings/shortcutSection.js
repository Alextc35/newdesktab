import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  formatShortcut,
  shortcutFromKeyboardEvent
} from '../../shared/keyboard/keyboardShortcuts.js';
import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import {
  getDraftKeyboardShortcuts,
  replaceDraftKeyboardShortcuts,
  setDraftKeyboardShortcut
} from './settingsDraft.js';

/** Initializes the editable keyboard-shortcut settings section. */
export function initShortcutSection({ onRequestSaveStateUpdate }) {
  const buttons = [...document.querySelectorAll('.shortcut-capture')];
  const reset = document.getElementById('shortcut-reset-defaults');
  const status = document.getElementById('shortcut-capture-status');
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
        shortcut: formatShortcut(shortcuts[action])
      }));
    }
  }

  function startRecording(action) {
    recordingAction = action;
    clearStatus();
    syncUI();
  }

  function stopRecording() {
    recordingAction = null;
    syncUI();
  }

  function setStatus(key, params = {}, type = 'info') {
    status.textContent = t(key, params);
    status.dataset.status = type;
  }

  function clearStatus() {
    status.textContent = '';
    delete status.dataset.status;
  }

  for (const button of buttons) {
    button.addEventListener('click', () => startRecording(button.dataset.shortcutAction));
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
        setStatus('settingsModal.shortcuts.cancelled');
        return;
      }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;

      const shortcut = shortcutFromKeyboardEvent(event);
      if (!shortcut) {
        setStatus('settingsModal.shortcuts.modifierRequired', {}, 'error');
        return;
      }

      const shortcuts = getDraftKeyboardShortcuts();
      const conflictingAction = Object.keys(shortcuts).find(
        candidate => candidate !== action && shortcuts[candidate] === shortcut
      );
      if (conflictingAction) {
        setStatus('settingsModal.shortcuts.conflict', {
          shortcut: formatShortcut(shortcut),
          action: t(`settingsModal.shortcuts.actions.${conflictingAction}.title`)
        }, 'error');
        return;
      }

      setDraftKeyboardShortcut(action, shortcut);
      stopRecording();
      setStatus('settingsModal.shortcuts.updated', {
        shortcut: formatShortcut(shortcut)
      }, 'success');
      onRequestSaveStateUpdate();
    });
  }

  reset.addEventListener('click', () => {
    replaceDraftKeyboardShortcuts(DEFAULT_KEYBOARD_SHORTCUTS);
    recordingAction = null;
    syncUI();
    setStatus('settingsModal.shortcuts.restored', {}, 'success');
    onRequestSaveStateUpdate();
  });

  subscribeLanguageChange(() => syncUI());
  return { syncUI };
}

function renderShortcut(button, shortcut) {
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
