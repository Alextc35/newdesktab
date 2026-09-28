import { debug } from '../core/debug.js';
import { changeLanguage } from '../platform/i18n/i18n.js';
import { applyInterfaceTheme } from '../shared/ui/interfaceTheme.js';
import { applyGlobalTheme } from '../core/theme.js';
import { enableGridEditing, renderGrid } from '../features/grid/gridRenderer.js';
import { clearGridItemSelection } from '../features/grid/gridSelection.js';
import { preloadLocalImages } from '../platform/images/localImages.js';
import {
  syncKeyboardShortcutAccessibility
} from '../features/keyboard/keyboardShortcutController.js';
import { updateAppShellEditing } from './appShell.js';
import { detectApplicationChanges } from './appStateChanges.js';

/**
 * Coordinates application-wide UI effects caused by store transitions. Domain
 * commands stay in their features; this controller only routes state changes
 * to the relevant presentation and platform boundaries.
 */
export function createAppController({ container }) {
  return Object.freeze({
    handleStateChange(state, previousState) {
      if (!previousState) {
        applyGlobalTheme(state.data.settings);
        updateAppShellEditing(state.ui.isEditing);
        const trace = debug.start('Initial grid render');
        renderGrid(container);
        trace.end();
        return;
      }

      const changes = detectApplicationChanges(state, previousState);

      if (changes.editing && !state.ui.isEditing) {
        clearGridItemSelection();
      }

      if (changes.settings) {
        applyInterfaceTheme(state.data.settings.interfaceTheme);
        void changeLanguage(state.data.settings);
        syncKeyboardShortcutAccessibility(state.data.settings.keyboardShortcuts);
      }

      if (changes.grid) {
        renderChangedGrid(container, state, changes.settings);
      } else if (changes.editing) {
        if (state.ui.isEditing) enableGridEditing(container);
        else renderGrid(container);
      }

      if (changes.editing) updateAppShellEditing(state.ui.isEditing);
    }
  });
}

function renderChangedGrid(container, state, settingsChanged) {
  const trace = debug.start('Render grid', {
    bookmarks: state.data.bookmarks.length,
    folders: state.data.folders.length,
    widgets: state.data.widgets.length
  });
  void preloadLocalImages(state.data).then(() => {
    trace.mark('Resolve local images');
    if (settingsChanged) applyGlobalTheme(state.data.settings);
    renderGrid(container);
    trace.mark('Build grid DOM');
    trace.end();
  }).catch(error => {
    trace.end({ status: 'error', error: error.message });
    console.error('[LOCAL_IMAGE] Could not load local image:', error);
    if (settingsChanged) applyGlobalTheme(state.data.settings);
    renderGrid(container);
  });
}
