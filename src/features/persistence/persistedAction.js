import { getState, requirePersistence, retryPersistence, subscribe } from '../../state/appStore.js';
import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { subscribeModalChanges } from '../../shared/ui/modalManager.js';

const pendingActions = new Map();
const runningActions = new Set();
let feedback;
let retryButton;

/** Executes a command once; a repeated failed command retries its write only. */
export async function runPersistedAction(key, operation, onSaved = () => {}) {
  if (runningActions.has(key)) return false;
  runningActions.add(key);
  try {
    if (pendingActions.size && getState().ui.persistence.status === 'saved') {
      const savedActions = [...pendingActions.entries()];
      await requirePersistence();
      completePendingActions(savedActions);
    }
    let pending = pendingActions.get(key);
    if (pending) {
      await retryPersistence();
    } else {
      const result = await operation();
      pending = { result, onSaved };
      pendingActions.set(key, pending);
      await requirePersistence();
    }
    completePendingActions([[key, pending]]);
    return true;
  } catch {
    flashError('settingsModal.sync.status.error');
    return false;
  } finally {
    runningActions.delete(key);
  }
}

function completePendingActions(actions) {
  for (const [key, action] of actions) {
    if (pendingActions.get(key) !== action) continue;
    pendingActions.delete(key);
    action.onSaved(action.result);
  }
}

/** A durable retry control also covers writes initiated by dragging or shortcuts. */
export function initPersistenceFeedback() {
  if (feedback) return;
  feedback = document.createElement('div');
  feedback.id = 'persistence-feedback';
  feedback.className = 'persistence-feedback';
  feedback.setAttribute('role', 'alert');
  const message = document.createElement('span');
  retryButton = document.createElement('button');
  retryButton.id = 'persistence-retry';
  retryButton.type = 'button';
  feedback.append(message, retryButton);
  document.body.append(feedback);
  subscribeModalChanges(activeModal => {
    (activeModal ?? document.body).append(feedback);
    feedback.inert = false;
    feedback.removeAttribute('aria-hidden');
    delete feedback.dataset.modalInert;
  });
  const translate = () => {
    message.textContent = t('persistence.unsaved');
    retryButton.textContent = t('persistence.retry');
  };
  translate();
  subscribeLanguageChange(translate);
  let retrying = false;
  subscribe(state => {
    feedback.hidden = state.ui.persistence.status !== 'error' && !retrying;
  });
  retryButton.addEventListener('click', async () => {
    if (retrying) return;
    retrying = true;
    retryButton.disabled = true;
    const actions = [...pendingActions.entries()];
    try {
      await retryPersistence();
      completePendingActions(actions);
      flashSuccess('persistence.saved');
    } catch {
      flashError('settingsModal.sync.status.error');
    } finally {
      retrying = false;
      retryButton.disabled = false;
      feedback.hidden = getState().ui.persistence.status !== 'error';
    }
  });
}
