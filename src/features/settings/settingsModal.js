import { showAlert } from '../../shared/ui/alertModal.js';
import { flashSuccess, flashError } from '../../shared/ui/flash.js';
import { registerModal, openModal, closeModal } from '../../shared/ui/modalManager.js';
import { createSettingsSectionSvg } from '../../shared/ui/svgIcons.js';
import { initTabs } from '../../shared/ui/tabs.js';
import { ensurePanelFits } from '../../shared/ui/viewportMode.js';

import { changeLanguage, t } from '../../platform/i18n/i18n.js';
import { DEFAULT_SETTINGS } from '../../domain/settings/settingsDefaults.js';
import {
  changeStorageMode,
  clearAllLocalData,
  getState,
  getStorageMode
} from '../../state/appStore.js';
import { ensureRecycleBinPosition } from '../recycle-bin/recycleBinActions.js';


import { initGeneralSection } from './generalSection.js';
import { initThemeSection } from './themeSection.js';
import { initBookmarkSection } from './bookmarkSection.js';
import { initLanguageSection } from './languageSection.js';
import { initSyncSection } from './syncSection.js';
import { initShortcutSection } from './shortcutSection.js';
import {
  initDraft,
  resetState,
  hasChanges,
  buildNewSettings,
  getDraftStorageMode,
  reconcileDraftStorageMode,
  replaceDraftSettings
} from './settingsDraft.js';
import { updateSettings } from './settingsActions.js';

/**
 * Initializes the settings modal.
 *
 * This module is responsible for:
 * - registering the settings modal
 * - initializing section controllers
 * - managing modal open/cancel/save flows
 * - syncing draft state with the UI
 */
export function initSettingsModal() {
  /**
   * Main settings modal controls.
   */
  const settingsBtn = document.getElementById('settings');
  const settingsModal = document.getElementById('settings-modal');
  const settingsSave = document.getElementById('settings-modal-save');
  const settingsCancel = document.getElementById('settings-modal-cancel');

  for (const icon of settingsModal.querySelectorAll('[data-settings-icon]')) {
    icon.replaceChildren(createSettingsSectionSvg(icon.dataset.settingsIcon));
  }

  /* ==================================================
     Helpers
  ================================================== */

  /**
   * Updates the save button visibility and disabled state
   * depending on whether the draft settings have changed.
   */
  function updateSaveButtonState() {
    const changed = hasChanges();
    settingsSave.disabled = !changed;
    settingsSave.classList.toggle('is-hidden', !changed);
  }

  /**
   * Initializes the top-level settings tabs.
   */
  const tabs = initTabs({
    root: '#settings-modal',
    tabButtonSelector: '.settings-modal-tab-btn',
    tabContentSelector: '.settings-modal-tab-content'
  });

  /**
   * Initializes section controllers.
   *
   * Each section notifies this module whenever its draft state changes
   * so the save button can be updated accordingly.
   */
  const themeSection = initThemeSection({
    onRequestSaveStateUpdate: updateSaveButtonState
  });

  settingsModal.querySelector('[data-tab="settings-modal-tab-theme"]')
    ?.addEventListener('click', () => themeSection.syncUI());

  const bookmarkSection = initBookmarkSection({
    onRequestSaveStateUpdate: updateSaveButtonState
  });

  const languageSection = initLanguageSection({
    onRequestSaveStateUpdate: updateSaveButtonState
  });

  const syncSection = initSyncSection({
    onRequestSaveStateUpdate: updateSaveButtonState
  });

  const shortcutSection = initShortcutSection({
    onRequestSaveStateUpdate: updateSaveButtonState
  });

  const generalSection = initGeneralSection({
    onRequestSaveStateUpdate: updateSaveButtonState,
    onResetSettings: async () => {
      replaceDraftSettings(DEFAULT_SETTINGS);
      generalSection.syncUI();
      themeSection.syncUI();
      bookmarkSection.syncUI();
      languageSection.syncUI();
      shortcutSection.syncUI();
      await changeLanguage(DEFAULT_SETTINGS);
      updateSaveButtonState();
      await saveSettings();
    },
    onDeleteAllData: async () => {
      try {
        await clearAllLocalData();
        await changeLanguage(DEFAULT_SETTINGS);
        resetState();
        closeModal('settings');
        flashSuccess('flash.settings.deletedAllData');
      } catch (error) {
        console.error('[SETTINGS] Could not delete all data:', error);
        flashError('flash.settings.deleteAllDataError');
      }
    },
    onBackupImported: () => {
      ensureRecycleBinPosition();
      resetState();
      closeModal('settings');
    }
  });

  /* ==================================================
     Modal registration
  ================================================== */

  /** Registers the settings modal with the modal manager. */
  registerModal({
    id: 'settings',
    element: settingsModal,
    requiresWideViewport: true,
    closeOnEsc: true,
    closeOnOverlay: false,
    acceptOnEnter: false,
    initialFocus: null
  });

  /**
   * Handles modal cancellation.
   *
   * Behavior:
   * - closes immediately if nothing changed
   * - otherwise asks for confirmation
   * - restores section state if the user confirms cancellation
   *
   * @returns {Promise<boolean>} Whether the cancel flow completed.
   */
  async function handleCancel() {
    if (!hasChanges()) {
      closeModal('settings');
      return true;
    }

    const ok = await showAlert(
      t('alert.settings.cancel'),
      { type: 'confirm' }
    );

    if (!ok) return false;

    generalSection.restoreInitialTheme();
    await languageSection.restoreInitialLanguage();
    resetState();
    closeModal('settings');
    return true;
  }

  /* ==================================================
     OPEN
  ================================================== */

  /**
   * Opens the settings modal.
   *
   * On open:
   * - current persisted settings are loaded into draft state
   * - each section syncs its UI from the draft
   * - default tabs are activated
   * - modal cancel behavior is attached
   */
  settingsBtn.addEventListener('click', () => {
    if (!ensurePanelFits()) return;
    const { data: { settings } } = getState();

    initDraft(settings, getStorageMode());

    generalSection.syncUI();

    themeSection.syncUI();
    bookmarkSection.syncUI();
    languageSection.syncUI();
    syncSection.syncUI();
    shortcutSection.syncUI();

    updateSaveButtonState();

    tabs.activate('settings-modal-tab-general');

    openModal('settings', {
      onCancel: handleCancel
    });
  });

  /* ==================================================
     CANCEL / SAVE
  ================================================== */

  /**
   * Binds the explicit cancel button to the cancel flow.
   */
  settingsCancel.addEventListener('click', handleCancel);

  /**
   * Saves the current draft settings.
   *
   * Flow:
   * - build the next settings object from draft state
   * - persist the settings
   * - show success feedback
   * - reset draft tracking
   * - close the modal
   */
  async function saveSettings() {
    const newSettings = buildNewSettings();
    const currentStorageMode = getStorageMode();
    const nextStorageMode = getDraftStorageMode();

    settingsSave.disabled = true;

    try {
      if (nextStorageMode !== currentStorageMode) {
        const currentData = getState().data;
        const source = await changeStorageMode(nextStorageMode, {
          ...currentData,
          settings: newSettings
        });

        if (nextStorageMode === 'sync' && source === 'existing') {
          flashSuccess('flash.sync.remoteLoaded');
        } else if (nextStorageMode === 'sync') {
          flashSuccess('flash.sync.enabled');
        } else {
          flashSuccess('flash.sync.localEnabled');
        }
      } else {
        await updateSettings(newSettings);
        flashSuccess('flash.settings.saved');
      }

      ensureRecycleBinPosition();

      resetState();
      closeModal('settings');
    } catch (err) {
      console.error('[SETTINGS] Storage mode change failed:', err);
      if (err?.code === 'SYNC_REQUIRES_NEWER_VERSION') {
        reconcileDraftStorageMode(getStorageMode());
        syncSection.syncUI();
        flashError('flash.sync.versionBlocked');
      } else {
        flashError(
          err?.code === 'SYNC_QUOTA_EXCEEDED'
            ? 'flash.sync.quotaError'
            : 'flash.sync.error'
        );
      }
      updateSaveButtonState();
    }
  }

  settingsSave.addEventListener('click', saveSettings);
}
