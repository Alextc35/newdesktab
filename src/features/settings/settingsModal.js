import { showAlert } from '../../shared/ui/alertModal.js';
import { flashSuccess, flashError } from '../../shared/ui/flash.js';
import { registerModal, openModal, closeModal } from '../../shared/ui/modalManager.js';
import { initTabs } from '../../shared/ui/tabs.js';
import { initCustomSelect } from '../../shared/ui/customSelect.js';
import { ensurePanelFits } from '../../shared/ui/viewportMode.js';
import { debug } from '../../shared/diagnostics/debug.js';

import { changeLanguage, t } from '../../platform/i18n/i18n.js';
import { DEFAULT_SETTINGS } from '../../domain/settings/settingsDefaults.js';
import {
  changeStorageMode,
  clearAllLocalData,
  getState,
  getSettings,
  getStorageMode,
  requirePersistence
} from '../../state/appStore.js';
import {
  ensureRecycleBinPosition,
  purgeExpiredRecycleBinEntries
} from '../recycle-bin/recycleBinActions.js';


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
  let isStorageModeChanging = false;

  /* ==================================================
     Helpers
  ================================================== */

  /**
   * Updates the save button visibility and disabled state
   * depending on whether the draft settings have changed.
   */
  function updateSaveButtonState() {
    const changed = hasChanges();
    settingsSave.disabled = !changed || isStorageModeChanging;
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

  settingsModal.querySelectorAll('select[data-custom-select]')
    .forEach(initCustomSelect);

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
  settingsModal.querySelectorAll('.settings-modal-tab-btn:not([data-tab="settings-modal-tab-theme"])')
    .forEach(button => button.addEventListener('click', () => themeSection.pausePreview()));

  const bookmarkSection = initBookmarkSection({
    onRequestSaveStateUpdate: updateSaveButtonState
  });

  const languageSection = initLanguageSection({
    onRequestSaveStateUpdate: updateSaveButtonState
  });

  const syncSection = initSyncSection({
    onRequestSaveStateUpdate: updateSaveButtonState,
    onApplyStorageMode: applyStorageMode
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
    if (isStorageModeChanging) return false;
    if (!hasChanges()) {
      await themeSection.discardUploadedMedia();
      themeSection.pausePreview();
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
    await themeSection.discardUploadedMedia();
    themeSection.pausePreview();
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
    const trace = debug.start('Open settings');
    settingsModal.querySelector('#settings-information-year').textContent = String(new Date().getFullYear());
    const settings = getSettings();

    initDraft(settings, getStorageMode());
    trace.mark('Prepare settings draft');

    generalSection.syncUI();

    themeSection.syncUI();
    bookmarkSection.syncUI();
    languageSection.syncUI();
    syncSection.syncUI();
    shortcutSection.syncUI();
    trace.mark('Synchronize controls');

    updateSaveButtonState();

    tabs.activate('settings-modal-tab-general');

    openModal('settings', {
      onCancel: handleCancel
    });
    trace.mark('Open modal');
    trace.end();
  });

  /* ==================================================
     CANCEL / SAVE
  ================================================== */

  /** Apply the confirmed storage switch without saving unrelated draft edits. */
  async function applyStorageMode(mode) {
    if (themeSection.isUploading() || isStorageModeChanging) return;
    isStorageModeChanging = true;
    settingsCancel.disabled = true;
    updateSaveButtonState();
    try {
      const source = await changeStorageMode(mode);
      if (source === 'existing') {
        try {
          await themeSection.discardUploadedMedia();
        } catch (error) {
          console.error('[SETTINGS] Could not discard draft media:', error);
        }
        initDraft(getState().data.settings, getStorageMode());
        themeSection.syncUI();
        bookmarkSection.syncUI();
        languageSection.syncUI();
        shortcutSection.syncUI();
      } else {
        reconcileDraftStorageMode(getStorageMode());
      }
      generalSection.syncUI();
      await changeLanguage(buildNewSettings());
      purgeExpiredRecycleBinEntries();
      ensureRecycleBinPosition();
      flashSuccess(source === 'existing' ? 'flash.sync.remoteLoaded'
        : mode === 'sync' ? 'flash.sync.enabled' : 'flash.sync.localEnabled');
    } catch (error) {
      console.error('[SETTINGS] Storage mode change failed:', error);
      reconcileDraftStorageMode(getStorageMode());
      flashError(error?.code === 'SYNC_REQUIRES_NEWER_VERSION' ? 'flash.sync.versionBlocked'
        : error?.code === 'SYNC_QUOTA_EXCEEDED' ? 'flash.sync.quotaError' : 'flash.sync.error');
    } finally {
      isStorageModeChanging = false;
      settingsCancel.disabled = false;
      syncSection.syncUI();
      updateSaveButtonState();
    }
  }

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
    if (themeSection.isUploading() || isStorageModeChanging) return;
    const newSettings = buildNewSettings();
    const previousTheme = getState().data.settings.theme;
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
        await requirePersistence();
        flashSuccess('flash.settings.saved');
      }

      purgeExpiredRecycleBinEntries();
      ensureRecycleBinPosition();

      try {
        await themeSection.cleanupLocalMedia(previousTheme, getState().data.settings.theme);
      } catch (cleanupError) {
        console.error('[SETTINGS] Could not remove unused local videos:', cleanupError);
      }

      resetState();
      themeSection.pausePreview();
      closeModal('settings');
    } catch (err) {
      console.error('[SETTINGS] Storage mode change failed:', err);
      if (err?.code === 'SYNC_REQUIRES_NEWER_VERSION') {
        reconcileDraftStorageMode(getStorageMode());
        syncSection.syncUI();
        flashError('flash.sync.versionBlocked');
      } else {
        flashError(
          err?.code === 'PERSISTENCE_FAILED'
            ? 'settingsModal.sync.status.error'
            : err?.code === 'SYNC_QUOTA_EXCEEDED'
            ? 'flash.sync.quotaError'
            : 'flash.sync.error'
        );
      }
      updateSaveButtonState();
    }
  }

  settingsSave.addEventListener('click', saveSettings);
}
