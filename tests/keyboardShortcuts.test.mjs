import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  findShortcutAction,
  formatAriaShortcut,
  formatShortcut,
  isReservedShortcut,
  normalizeKeyboardShortcuts,
  normalizeShortcut,
  SHORTCUT_ACTIONS,
  shortcutFromKeyboardEvent
} from '../src/shared/keyboard/keyboardShortcuts.js';

test('normalizes editable shortcuts into a stable modifier order', () => {
  assert.equal(normalizeShortcut('w'), 'W');
  assert.equal(normalizeShortcut('shift + control + k'), 'Ctrl+Shift+K');
  assert.equal(normalizeShortcut('Option+ArrowDown'), 'Alt+ArrowDown');
  assert.equal(normalizeShortcut('Meta+F12'), 'Meta+F12');
  assert.equal(normalizeShortcut('Space'), null);
  assert.equal(normalizeShortcut('Ctrl'), null);
  assert.equal(normalizeShortcut('Ctrl+Unknown'), null);
  assert.equal(normalizeShortcut('Ctrl+W'), null);
  assert.equal(normalizeShortcut('Ctrl+F4'), null);
  assert.equal(normalizeShortcut('Ctrl+L'), null);
  assert.equal(normalizeShortcut('Alt+F'), null);
  assert.equal(isReservedShortcut('Ctrl+W'), true);
  assert.equal(isReservedShortcut('W'), false);
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
  assert.deepEqual(normalizeKeyboardShortcuts({
    toggleEditing: 'Ctrl+E',
    addBookmark: 'Ctrl+B',
    addFolder: 'Ctrl+F',
    openSettings: 'Ctrl+S'
  }), DEFAULT_KEYBOARD_SHORTCUTS);
  assert.deepEqual(normalizeKeyboardShortcuts({
    ...DEFAULT_KEYBOARD_SHORTCUTS,
    openWidgets: 'Ctrl+W'
  }), DEFAULT_KEYBOARD_SHORTCUTS);
  assert.deepEqual(normalizeKeyboardShortcuts({
    ...DEFAULT_KEYBOARD_SHORTCUTS,
    addFolder: null,
    openWidgets: null
  }), {
    ...DEFAULT_KEYBOARD_SHORTCUTS,
    addFolder: null,
    openWidgets: null
  });
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
  assert.equal(findShortcutAction({
    code: 'KeyW', key: 'w', ctrlKey: false, altKey: false,
    shiftKey: false, metaKey: false
  }, DEFAULT_KEYBOARD_SHORTCUTS), SHORTCUT_ACTIONS.OPEN_WIDGETS);
});
