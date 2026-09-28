import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  findShortcutAction,
  formatAriaShortcut,
  formatShortcut,
  normalizeKeyboardShortcuts,
  normalizeShortcut,
  SHORTCUT_ACTIONS,
  shortcutFromKeyboardEvent
} from '../src/shared/keyboard/keyboardShortcuts.js';

test('normalizes editable shortcuts into a stable modifier order', () => {
  assert.equal(normalizeShortcut('shift + control + k'), 'Ctrl+Shift+K');
  assert.equal(normalizeShortcut('Option+ArrowDown'), 'Alt+ArrowDown');
  assert.equal(normalizeShortcut('Meta+F12'), 'Meta+F12');
  assert.equal(normalizeShortcut('E'), null);
  assert.equal(normalizeShortcut('Ctrl'), null);
  assert.equal(normalizeShortcut('Ctrl+Unknown'), null);
});

test('fills missing shortcuts and rejects a conflicting persisted map', () => {
  assert.deepEqual(normalizeKeyboardShortcuts({
    toggleEditing: 'Ctrl+Shift+E'
  }), {
    ...DEFAULT_KEYBOARD_SHORTCUTS,
    toggleEditing: 'Ctrl+Shift+E'
  });
  assert.deepEqual(normalizeKeyboardShortcuts({
    toggleEditing: 'Ctrl+B',
    addBookmark: 'Ctrl+B'
  }), DEFAULT_KEYBOARD_SHORTCUTS);
});

test('converts keyboard events and resolves their configured actions', () => {
  const event = {
    code: 'KeyK',
    key: 'k',
    ctrlKey: true,
    altKey: false,
    shiftKey: true,
    metaKey: false
  };
  const shortcuts = {
    ...DEFAULT_KEYBOARD_SHORTCUTS,
    addBookmark: 'Ctrl+Shift+K'
  };

  assert.equal(shortcutFromKeyboardEvent(event), 'Ctrl+Shift+K');
  assert.equal(findShortcutAction(event, shortcuts), SHORTCUT_ACTIONS.ADD_BOOKMARK);
  assert.equal(formatShortcut('Ctrl+Shift+K'), 'Ctrl + Shift + K');
  assert.equal(formatAriaShortcut('Ctrl+Shift+K'), 'Control+Shift+K');
});
