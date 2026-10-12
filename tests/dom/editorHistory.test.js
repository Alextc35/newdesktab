import { expect, test, vi } from 'vitest';

const messages = vi.hoisted(() => ({ flash: vi.fn() }));
vi.mock('../../src/shared/ui/flash.js', () => ({ flash: messages.flash }));
vi.mock('../../src/platform/i18n/i18n.js', () => ({ t: key => key, subscribeLanguageChange: () => () => {} }));
import { createEditorHistory } from '../../src/shared/ui/editorHistory.js';

const key = (target, { shiftKey = false, metaKey = false } = {}) => {
  const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: !metaKey, metaKey, shiftKey,
    bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

test('dependent draft fields are restored atomically and empty history consumes the shortcut', async () => {
  document.body.innerHTML = '<section><input type="color"><button>Look</button></section>';
  const root = document.querySelector('section');
  let value = { color: 'blue', text: 'white' };
  const history = createEditorHistory({ root, getValue: () => value, applyValue: next => { value = next; }, isActive: () => true });
  value.color = 'white';
  root.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
  value.text = 'black';
  await Promise.resolve();
  expect(key(root.querySelector('button')).defaultPrevented).toBe(true);
  expect(value).toEqual({ color: 'blue', text: 'white' });
  expect(messages.flash).toHaveBeenLastCalledWith('flash.history.undone', 'info', 1000);
  expect(key(root.querySelector('button'), { shiftKey: true, metaKey: true }).defaultPrevented).toBe(true);
  expect(value).toEqual({ color: 'white', text: 'black' });
  expect(messages.flash).toHaveBeenLastCalledWith('flash.history.redone', 'info', 1000);
  history.reset();
  const announced = messages.flash.mock.calls.length;
  expect(key(root.querySelector('button')).defaultPrevented).toBe(true);
  expect(value).toEqual({ color: 'white', text: 'black' });
  expect(messages.flash).toHaveBeenCalledTimes(announced);
  history.destroy();
});

test('native text undo, inactive dialogs, reset and destroyed listeners stay isolated', async () => {
  document.body.innerHTML = '<section><input><button>Look</button></section>';
  const root = document.querySelector('section');
  let value = { color: 'blue' };
  let active = true;
  const history = createEditorHistory({ root, getValue: () => value, applyValue: next => { value = next; }, isActive: () => active });
  expect(key(root.querySelector('input')).defaultPrevented).toBe(false);
  value.color = 'red';
  root.querySelector('button:not([data-editor-history])').click();
  history.reset();
  await Promise.resolve();
  expect(history.undo()).toBe(false);
  value.color = 'green';
  root.querySelector('button:not([data-editor-history])').click();
  await Promise.resolve();
  active = false;
  expect(key(root.querySelector('button')).defaultPrevented).toBe(false);
  expect(value.color).toBe('green');
  active = true;
  history.destroy();
  expect(key(root.querySelector('button')).defaultPrevented).toBe(false);
  expect(value.color).toBe('green');
});

test('draft buttons reflect available changes, respect activity and are removed on destroy', async () => {
  document.body.innerHTML = '<section><header class="edit-bookmark-modal-header"><h2>Editor</h2></header><input type="checkbox"></section>';
  const root = document.querySelector('section');
  let value = { checked: false };
  let active = true;
  const history = createEditorHistory({ root, getValue: () => value, applyValue: next => { value = next; }, isActive: () => active });
  const undo = root.querySelector('[data-editor-history="undo"]');
  const redo = root.querySelector('[data-editor-history="redo"]');
  expect(undo.disabled).toBe(true);
  expect(redo.disabled).toBe(true);
  expect(undo.getAttribute('aria-label')).toBe('workspace.undo');
  expect(redo.getAttribute('aria-keyshortcuts')).toBe('Control+Shift+Z Meta+Shift+Z');
  value.checked = true;
  root.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));
  await Promise.resolve();
  expect(undo.disabled).toBe(false);
  active = false;
  undo.click();
  expect(value.checked).toBe(true);
  active = true;
  undo.click();
  expect(value.checked).toBe(false);
  expect(undo.disabled).toBe(true);
  expect(redo.disabled).toBe(false);
  redo.click();
  expect(value.checked).toBe(true);
  expect(redo.disabled).toBe(true);
  history.reset();
  expect(undo.disabled).toBe(true);
  history.destroy();
  expect(root.querySelector('.editor-history-controls')).toBeNull();
});
