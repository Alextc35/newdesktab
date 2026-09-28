import { debug } from '../shared/diagnostics/debug.js';
import { finishDebugStartup, initDebugTools } from './applicationDiagnostics.js';
import { initI18n } from '../platform/i18n/i18n.js';
import { applyInterfaceTheme } from '../shared/ui/interfaceTheme.js';
import {
  getState,
  getSyncCompatibility,
  hydrateStore,
  subscribe,
  subscribeToRemoteSyncUpdates
} from '../core/store.js';
import {
  ensureRecycleBinPosition,
  purgeExpiredRecycleBinEntries
} from '../features/recycle-bin/recycleBinActions.js';
import { initRecycleBinEditorModal } from '../features/recycle-bin/recycleBinEditorModal.js';
import { initRecycleBinModal } from '../features/recycle-bin/recycleBinModal.js';
import { initBookmarkModal } from '../features/bookmarks/bookmarkModal.js';
import { initFolderController } from '../features/folders/folderController.js';
import { initFolderEditorModal } from '../features/folders/folderEditorModal.js';
import { initFolderModal } from '../features/folders/folderModal.js';
import { initHistoryControls } from '../features/history/historyControls.js';
import { initSearchModal } from '../features/search/searchModal.js';
import { initSettingsModal } from '../features/settings/settingsModal.js';
import { initWorkspaceToolbar } from '../features/workspaces/workspaceToolbar.js';
import { preloadLocalImages } from '../platform/images/localImages.js';
import { initGridBulkActions } from '../features/grid/gridBulkActions.js';
import { initGridKeyboardNavigation } from '../features/grid/gridKeyboardController.js';
import { initGridKeyboardMovement } from '../features/grid/gridKeyboardMovement.js';
import { initAlertModal } from '../shared/ui/alertModal.js';
import { flashInfo } from '../shared/ui/flash.js';
import { initFloatingMenu } from '../features/launcher/floatingMenu.js';
import { initKeyboardShortcuts } from '../features/keyboard/keyboardShortcutController.js';
import { initAppShell } from './appShell.js';
import { initializeWidgets } from '../widgets/widgetRegistry.js';
import { createAppController } from './appController.js';
import { registerGridItemTypes } from './registerGridItemTypes.js';

const RECYCLE_BIN_PURGE_INTERVAL_MS = 60 * 60 * 1000;

/** Starts NewDeskTab and reports bootstrap failures at the application boundary. */
export async function startApplication() {
  const startedAt = performance.now();
  const trace = debug.start('Initial load');

  try {
    await bootstrapApplication({ trace, startedAt });
  } catch (error) {
    trace.end({ status: 'error', error: error.message });
    console.error('[NewDeskTab] Could not initialize the page:', error);
  }
}

/**
 * Composes the bundled features, hydrates state and connects UI controllers.
 * Ordering is intentional: state and localization are ready before UI setup.
 */
export async function bootstrapApplication({ trace, startedAt }) {
  const elements = getApplicationElements();
  registerGridItemTypes();

  await hydrateStore();
  purgeExpiredRecycleBinEntries();
  ensureRecycleBinPosition();
  setInterval(purgeExpiredRecycleBinEntries, RECYCLE_BIN_PURGE_INTERVAL_MS);
  trace.mark('Load and migrate data');

  applyInterfaceTheme(getState().data.settings.interfaceTheme);
  await preloadLocalImages(getState().data);
  trace.mark('Load local images');

  await initI18n(getState().data.settings);
  trace.mark('Load language');

  const appController = createAppController({ container: elements.container });
  subscribe(appController.handleStateChange);
  subscribeToRemoteSyncUpdates(event => {
    if (event.type === 'deleted') {
      flashInfo('flash.sync.deletedFromOtherDevice', 6000);
      return;
    }
    ensureRecycleBinPosition();
    flashInfo('flash.sync.updatedFromOtherDevice', 4000);
  });

  initializeUserInterface(elements);

  if (getSyncCompatibility()) {
    flashInfo('flash.sync.versionBlocked', 8000);
  }

  trace.mark('Initialize UI');
  initDebugTools();
  void finishDebugStartup(trace, startedAt).catch(error => {
    debug.info('Could not complete the startup report', { error: error.message });
  });
}

function getApplicationElements() {
  return {
    container: document.getElementById('bookmark-container'),
    gridOverlay: document.getElementById('grid-overlay'),
    toggleButton: document.getElementById('edit-toggle-mode')
  };
}

function initializeUserInterface({ container, gridOverlay, toggleButton }) {
  initAppShell({ container, gridOverlay, toggleButton });
  initializeWidgets({
    launcher: document.getElementById('add-options'),
    modalHost: document.body
  });
  initFloatingMenu();
  initModals();
  initHistoryControls();
  initWorkspaceToolbar();
  initGridBulkActions();
  initGridKeyboardNavigation(container);
  initGridKeyboardMovement();
  initFolderController();
  initKeyboardShortcuts();
}

function initModals() {
  initAlertModal();
  initSearchModal();
  initFolderModal();
  initFolderEditorModal();
  initRecycleBinModal();
  initRecycleBinEditorModal();
  initSettingsModal();
  initBookmarkModal();
}
