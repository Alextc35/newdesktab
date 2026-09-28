import { changeLanguage } from '../../platform/i18n/i18n.js';
import { getInitialSnapshot } from './settingsDraft.js';
import {
  getDraftLanguage,
  setDraftLanguage
} from './settingsDraft.js';

/**
 * Initializes the language section inside the settings modal.
 *
 * This section is responsible for:
 * - syncing the language select with the draft settings state
 * - applying language changes immediately for live preview
 * - restoring the initial language when changes are cancelled
 *
 * @param {Object} params
 * @param {Function} params.onRequestSaveStateUpdate - Callback used to refresh save-state indicators.
 * @returns {{ syncUI: Function, restoreInitialLanguage: Function }}
 */
export function initLanguageSection({
  onRequestSaveStateUpdate
}) {
  /* ==================================================
     DOM
  ================================================== */

  /**
   * Language selector used to switch the current UI language.
   */
  const languageSelect = document.getElementById('language-select');
  const systemNote = document.getElementById('language-system-note');

  /* ==================================================
     Sync
  ================================================== */

  /**
   * Synchronizes the language select with the current draft language.
   */
  function syncUI() {
    languageSelect.value = getDraftLanguage();
    const followsBrowser = languageSelect.value === 'system';
    systemNote.classList.toggle('is-hidden', !followsBrowser);
    if (followsBrowser) languageSelect.setAttribute('aria-describedby', systemNote.id);
    else languageSelect.removeAttribute('aria-describedby');
  }

  /**
   * Restores the language that was active when the settings modal was opened.
   *
   * This is used when the user cancels changes after previewing
   * a different language inside the modal.
   */
  async function restoreInitialLanguage() {
    const initialLanguage = getInitialSnapshot().language;
    await changeLanguage({ language: initialLanguage });
  }

  /* ==================================================
     Events
  ================================================== */

  /**
   * Updates the draft language when the selection changes,
   * applies the new language immediately, and refreshes save-state indicators.
   */
  languageSelect.addEventListener('change', async () => {
    const value = languageSelect.value;

    setDraftLanguage(value);
    syncUI();

    await changeLanguage({ language: value });

    onRequestSaveStateUpdate();
  });

  /* ==================================================
     API
  ================================================== */

  /**
   * Public API for the language settings section.
   */
  return {
    syncUI,
    restoreInitialLanguage
  };
}
