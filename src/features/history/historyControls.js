import { redoBookmarks, subscribe, undoBookmarks } from '../../state/appStore.js';
import { t } from '../../platform/i18n/i18n.js';
import { flash } from '../../shared/ui/flash.js';
import { runPersistedAction } from '../persistence/persistedAction.js';

let initialized = false;

/** Connects the global undo and redo controls to the store history. */
export function initHistoryControls() {
  if (initialized) return;
  initialized = true;

  const undoButton = document.getElementById('history-undo');
  const redoButton = document.getElementById('history-redo');

  undoButton.addEventListener('click', async () => {
    await runPersistedAction('history-undo', undoBookmarks, changed => {
      if (changed) flash(t('flash.history.undone'), 'info', 1000);
    });
  });
  redoButton.addEventListener('click', async () => {
    await runPersistedAction('history-redo', redoBookmarks, changed => {
      if (changed) flash(t('flash.history.redone'), 'info', 1000);
    });
  });

  subscribe(state => {
    undoButton.disabled = !state.ui.history.canUndo;
    redoButton.disabled = !state.ui.history.canRedo;
  });

  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    event.preventDefault();
    (event.shiftKey ? redoButton : undoButton).click();
  });
}
