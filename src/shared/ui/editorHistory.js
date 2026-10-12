import { createDraftHistory } from '../data/draftHistory.js';
import { flash } from './flash.js';
import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { createHistorySvg } from './svgIcons.js';

/** Records complete draft changes after dependent fields have settled. */
export function createEditorHistory({ root, getValue, applyValue, isActive, onRestore = () => {} }) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const history = createDraftHistory(getValue());
  let pending = null;
  let restoring = false;
  let revision = 0;
  const nativeHistoryReset = new WeakSet();
  const announce = direction => flash(t(direction === 'redo' ? 'flash.history.redone' : 'flash.history.undone'), 'info', 1000);
  const toolbar = document.createElement('div');
  toolbar.className = 'editor-history-controls';
  toolbar.setAttribute('role', 'group');
  const buttons = Object.fromEntries(['undo', 'redo'].map(direction => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'editor-history-button';
    button.dataset.editorHistory = direction;
    button.dataset.i18nAriaLabel = `workspace.${direction}`;
    button.setAttribute('aria-keyshortcuts', direction === 'undo' ? 'Control+Z Meta+Z' : 'Control+Shift+Z Meta+Shift+Z');
    button.append(createHistorySvg(direction));
    button.addEventListener('click', event => {
      event.stopPropagation();
      restore(direction);
    }, options);
    toolbar.append(button);
    return [direction, button];
  }));
  const header = root.querySelector('.edit-bookmark-modal-header, .editor-history-header');
  if (header) {
    header.classList.add('editor-history-header');
    header.append(toolbar);
  } else root.prepend(toolbar);
  function translateControls() {
    toolbar.setAttribute('aria-label', t('itemEditor.history'));
    for (const [direction, button] of Object.entries(buttons)) {
      const label = t(`workspace.${direction}`);
      button.setAttribute('aria-label', label);
      button.title = `${label} (Ctrl/Cmd + ${direction === 'undo' ? 'Z' : 'Shift + Z'})`;
    }
  }
  translateControls();
  const unsubscribeLanguage = subscribeLanguageChange(translateControls);
  function syncButtons() {
    const { canUndo, canRedo } = history.getStatus();
    buttons.undo.disabled = !canUndo;
    buttons.redo.disabled = !canRedo;
  }
  syncButtons();

  function flush() {
    if (!pending) return;
    const { group, direction } = pending;
    pending = null;
    if (!restoring && isActive()) {
      if (direction) {
        if (history.syncNative(getValue(), direction)) announce(direction);
      } else history.record(getValue(), { group });
    }
    syncButtons();
  }
  function record(event) {
    if (restoring || !isActive()) return;
    const direction = event.type === 'input' && ['historyUndo', 'historyRedo'].includes(event.inputType)
      ? (event.inputType === 'historyRedo' ? 'redo' : 'undo') : null;
    if (event.type === 'input' && !direction) nativeHistoryReset.delete(event.target);
    const group = event.type === 'input' && !['historyUndo', 'historyRedo'].includes(event.inputType)
      && !['checkbox', 'radio', 'file'].includes(event.target.type) ? event.target : null;
    if (pending) { pending.group = group; pending.direction = direction; return; }
    pending = { group, direction };
    const queuedRevision = revision;
    queueMicrotask(() => { if (revision === queuedRevision) flush(); });
  }
  function restore(direction) {
    if (!isActive()) return false;
    flush();
    const value = history[direction]();
    if (!value) return false;
    restoring = true;
    try {
      const textValues = [...root.querySelectorAll('input, textarea')].filter(isNativeText).map(input => [input, input.value]);
      applyValue(value);
      for (const [input, previous] of textValues) {
        if (input.value !== previous) nativeHistoryReset.add(input);
      }
      onRestore();
      announce(direction);
    } finally { restoring = false; syncButtons(); }
    return true;
  }
  for (const type of ['input', 'change', 'click']) root.addEventListener(type, record, options);
  for (const type of ['pointerdown', 'focusin']) {
    root.addEventListener(type, () => { flush(); history.breakGroup(); }, options);
  }
  root.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.isComposing || !isActive()
      || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    const target = event.target;
    if (isNativeText(target) && !nativeHistoryReset.has(target)) return;
    event.preventDefault();
    event.stopPropagation();
    restore(event.shiftKey ? 'redo' : 'undo');
  }, options);
  return {
    reset() { revision++; pending = null; history.reset(getValue()); syncButtons(); },
    undo: () => restore('undo'),
    redo: () => restore('redo'),
    destroy() { revision++; pending = null; events.abort(); unsubscribeLanguage(); toolbar.remove(); }
  };
}

function isNativeText(target) {
  return target.isContentEditable || (target.matches?.('input, textarea') && !target.readOnly && !target.disabled
    && !['checkbox', 'radio', 'color', 'range', 'file', 'button', 'submit', 'reset'].includes(target.type));
}
