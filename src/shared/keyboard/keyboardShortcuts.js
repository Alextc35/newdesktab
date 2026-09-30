/** Stable application actions that can be bound to keyboard shortcuts. */
export const SHORTCUT_ACTIONS = Object.freeze({
  TOGGLE_EDITING: 'toggleEditing',
  ADD_BOOKMARK: 'addBookmark',
  ADD_FOLDER: 'addFolder',
  OPEN_WIDGETS: 'openWidgets',
  OPEN_SETTINGS: 'openSettings'
});

export const SHORTCUT_ACTION_ORDER = Object.freeze([
  SHORTCUT_ACTIONS.TOGGLE_EDITING,
  SHORTCUT_ACTIONS.ADD_BOOKMARK,
  SHORTCUT_ACTIONS.ADD_FOLDER,
  SHORTCUT_ACTIONS.OPEN_WIDGETS,
  SHORTCUT_ACTIONS.OPEN_SETTINGS
]);

export const DEFAULT_KEYBOARD_SHORTCUTS = Object.freeze({
  [SHORTCUT_ACTIONS.TOGGLE_EDITING]: 'E',
  [SHORTCUT_ACTIONS.ADD_BOOKMARK]: 'B',
  [SHORTCUT_ACTIONS.ADD_FOLDER]: 'F',
  [SHORTCUT_ACTIONS.OPEN_WIDGETS]: 'W',
  [SHORTCUT_ACTIONS.OPEN_SETTINGS]: 'S'
});

const LEGACY_DEFAULT_KEYBOARD_SHORTCUTS = Object.freeze({
  [SHORTCUT_ACTIONS.TOGGLE_EDITING]: 'Ctrl+E',
  [SHORTCUT_ACTIONS.ADD_BOOKMARK]: 'Ctrl+B',
  [SHORTCUT_ACTIONS.ADD_FOLDER]: 'Ctrl+F',
  [SHORTCUT_ACTIONS.OPEN_SETTINGS]: 'Ctrl+S'
});

// Browser- and OS-owned navigation/closing shortcuts must never be assigned.
const RESERVED_SHORTCUTS = new Set([
  'Ctrl+W', 'Ctrl+F4', 'Ctrl+Shift+W', 'Ctrl+L', 'Alt+D', 'Alt+E', 'Alt+F',
  'Ctrl+T', 'Ctrl+Shift+T', 'Ctrl+N', 'Ctrl+Shift+N',
  'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+Q', 'Ctrl+Shift+Q',
  'Ctrl+PageUp', 'Ctrl+PageDown', 'Ctrl+Shift+PageUp', 'Ctrl+Shift+PageDown',
  'Alt+F4', 'Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+Home', 'Alt+Space',
  'Meta+W', 'Meta+Shift+W', 'Meta+L', 'Meta+T', 'Meta+Shift+T',
  'Meta+N', 'Meta+Shift+N',
  'Meta+R', 'Meta+Q', 'Meta+D', 'Meta+E',
  ...Array.from({ length: 9 }, (_, index) => `Ctrl+${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `Meta+${index + 1}`)
]);

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const MODIFIER_ALIASES = new Map([
  ['control', 'Ctrl'],
  ['ctrl', 'Ctrl'],
  ['alt', 'Alt'],
  ['option', 'Alt'],
  ['shift', 'Shift'],
  ['meta', 'Meta'],
  ['cmd', 'Meta'],
  ['command', 'Meta']
]);
const SPECIAL_KEYS = new Map([
  ['arrowdown', 'ArrowDown'],
  ['arrowleft', 'ArrowLeft'],
  ['arrowright', 'ArrowRight'],
  ['arrowup', 'ArrowUp'],
  ['backspace', 'Backspace'],
  ['comma', 'Comma'],
  ['delete', 'Delete'],
  ['end', 'End'],
  ['enter', 'Enter'],
  ['equal', 'Equal'],
  ['home', 'Home'],
  ['insert', 'Insert'],
  ['minus', 'Minus'],
  ['pagedown', 'PageDown'],
  ['pageup', 'PageUp'],
  ['period', 'Period'],
  ['slash', 'Slash'],
  ['space', 'Space']
]);

/** Returns a safe, unique shortcut map with defaults for missing values. */
export function normalizeKeyboardShortcuts(value) {
  const source = value && typeof value === 'object' ? value : {};
  if (Object.keys(source).length === Object.keys(LEGACY_DEFAULT_KEYBOARD_SHORTCUTS).length
    && Object.entries(LEGACY_DEFAULT_KEYBOARD_SHORTCUTS).every(
      ([action, shortcut]) => source[action] === shortcut
    )) return structuredClone(DEFAULT_KEYBOARD_SHORTCUTS);

  const normalized = Object.fromEntries(SHORTCUT_ACTION_ORDER.map(action => [
    action,
    source[action] === null
      ? null
      : normalizeShortcut(source[action]) ?? DEFAULT_KEYBOARD_SHORTCUTS[action]
  ]));

  const assigned = Object.values(normalized).filter(Boolean);
  return new Set(assigned).size === assigned.length
    ? normalized
    : structuredClone(DEFAULT_KEYBOARD_SHORTCUTS);
}

/** Converts user or persisted shortcut text into the canonical form. */
export function normalizeShortcut(value) {
  if (typeof value !== 'string') return null;
  const tokens = value.split('+').map(token => token.trim()).filter(Boolean);
  const modifiers = new Set();
  let baseKey = null;

  for (const token of tokens) {
    const modifier = MODIFIER_ALIASES.get(token.toLowerCase());
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }
    if (baseKey) return null;
    baseKey = normalizeBaseKey(token);
    if (!baseKey) return null;
  }

  if (!baseKey || (modifiers.size === 0 && !/^[A-Z]$/.test(baseKey))) return null;
  const shortcut = [...MODIFIER_ORDER.filter(modifier => modifiers.has(modifier)), baseKey].join('+');
  return isReservedShortcut(shortcut) ? null : shortcut;
}

/** Recognizes combinations owned by the browser or operating system. */
export function isReservedShortcut(shortcut) {
  return RESERVED_SHORTCUTS.has(shortcut);
}

/** Converts a keydown event into a persistable shortcut. */
export function shortcutFromKeyboardEvent(event) {
  const baseKey = baseKeyFromEvent(event);
  const modifiers = [
    event.ctrlKey && 'Ctrl',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
    event.metaKey && 'Meta'
  ].filter(Boolean);

  if (!baseKey || (modifiers.length === 0 && !/^[A-Z]$/.test(baseKey))) return null;
  return [...modifiers, baseKey].join('+');
}

/** Finds the action assigned to a keyboard event, if any. */
export function findShortcutAction(event, shortcuts) {
  const pressed = shortcutFromKeyboardEvent(event);
  if (!pressed) return null;
  const normalized = normalizeKeyboardShortcuts(shortcuts);
  return SHORTCUT_ACTION_ORDER.find(action => normalized[action] === pressed) ?? null;
}

/** Formats the canonical value for a visible keyboard button. */
export function formatShortcut(value) {
  return (normalizeShortcut(value) ?? '').split('+').filter(Boolean).join(' + ');
}

/** Formats the canonical value for aria-keyshortcuts. */
export function formatAriaShortcut(value) {
  return (normalizeShortcut(value) ?? '')
    .replace('Ctrl', 'Control')
    .split('+')
    .join('+');
}

function normalizeBaseKey(value) {
  const token = value.trim();
  if (/^[a-z]$/i.test(token)) return token.toUpperCase();
  if (/^[0-9]$/.test(token)) return token;
  if (/^f(?:[1-9]|1[0-2])$/i.test(token)) return token.toUpperCase();
  return SPECIAL_KEYS.get(token.toLowerCase()) ?? null;
}

function baseKeyFromEvent(event) {
  const { code = '', key = '' } = event;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1[0-2])$/.test(code)) return code;

  const codeKeys = {
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ArrowUp: 'ArrowUp',
    Backspace: 'Backspace',
    Comma: 'Comma',
    Delete: 'Delete',
    End: 'End',
    Enter: 'Enter',
    Equal: 'Equal',
    Home: 'Home',
    Insert: 'Insert',
    Minus: 'Minus',
    PageDown: 'PageDown',
    PageUp: 'PageUp',
    Period: 'Period',
    Slash: 'Slash',
    Space: 'Space'
  };
  return codeKeys[code] ?? normalizeBaseKey(key);
}
