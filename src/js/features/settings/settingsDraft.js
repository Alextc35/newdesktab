import {
  normalizeBookmarkDragMode,
  normalizeBookmarkResizeMode
} from '../../domain/settings/gridInteractionModes.js';
import { normalizeInterfaceTheme } from '../../domain/settings/interfacePreferences.js';
import { normalizeKeyboardShortcuts } from '../../shared/keyboard/keyboardShortcuts.js';
import { getState } from '../../core/store.js';

/**
 * Draft theme state used while the settings modal is open.
 */
let draftTheme = null;

/**
 * Draft language state used while the settings modal is open.
 */
let draftLanguage = null;
let draftInterfaceTheme = null;
let draftShowRecycleBin = null;

/**
 * Draft bookmark default state used while the settings modal is open.
 */
let draftBookmarkDefault = null;

/** Named appearance presets edited alongside the default bookmark appearance. */
let draftBookmarkPresets = null;

/** Drag collision behavior selected for bookmarks. */
let draftBookmarkDragMode = null;

/** Resize feedback behavior selected for bookmarks and folders. */
let draftBookmarkResizeMode = null;

/** Customizable global keyboard shortcuts. */
let draftKeyboardShortcuts = null;

/**
 * Per-device persistence mode selected in the settings modal.
 * @type {'local'|'sync'|null}
 */
let draftStorageMode = null;

/**
 * Snapshot of the original settings when the modal was opened.
 * Used for change detection and restore flows.
 */
let initialSnapshot = null;

/* ==================================================
   INIT
================================================== */

/**
 * Initializes the draft state from the current persisted settings.
 *
 * This creates an isolated working copy for the settings modal,
 * allowing the user to edit values without immediately saving them.
 *
 * @param {Object} settings
 * @param {'local'|'sync'} storageMode
 */
export function initDraft(settings, storageMode) {
  initialSnapshot = structuredClone(settings);
  initialSnapshot.storageMode = storageMode;

  draftTheme = structuredClone(settings.theme);
  draftLanguage = settings.language;
  draftInterfaceTheme = normalizeInterfaceTheme(settings.interfaceTheme);
  draftShowRecycleBin = settings.showRecycleBin !== false;
  draftBookmarkDefault = structuredClone(settings.bookmarkDefault);
  draftBookmarkPresets = structuredClone(settings.bookmarkPresets ?? []);
  draftBookmarkDragMode = normalizeBookmarkDragMode(settings.bookmarkDragMode);
  draftBookmarkResizeMode = normalizeBookmarkResizeMode(settings.bookmarkResizeMode);
  draftKeyboardShortcuts = normalizeKeyboardShortcuts(settings.keyboardShortcuts);
  draftStorageMode = storageMode;
}

/**
 * Clears all draft state and the initial snapshot.
 *
 * This is typically called after saving or fully cancelling the modal.
 */
export function resetState() {
  draftTheme = null;
  draftLanguage = null;
  draftInterfaceTheme = null;
  draftShowRecycleBin = null;
  draftBookmarkDefault = null;
  draftBookmarkPresets = null;
  draftBookmarkDragMode = null;
  draftBookmarkResizeMode = null;
  draftKeyboardShortcuts = null;
  draftStorageMode = null;
  initialSnapshot = null;
}

/* ==================================================
   GETTERS
================================================== */

/**
 * Returns the current draft theme object.
 *
 * @returns {Object|null}
 */
export function getDraftTheme() {
  return draftTheme;
}

/**
 * Returns the current draft interface appearance.
 *
 * @returns {string|null}
 */
export function getDraftInterfaceTheme() {
  return draftInterfaceTheme;
}

export function setDraftInterfaceTheme(value) {
  draftInterfaceTheme = normalizeInterfaceTheme(value);
}

export function getDraftShowRecycleBin() {
  const { data: { settings } } = getState();
  return draftShowRecycleBin ?? (settings.showRecycleBin !== false);
}

export function setDraftShowRecycleBin(value) {
  draftShowRecycleBin = value === true;
}

/** Returns the draft language preference, including the automatic option. */
export function getDraftLanguage() {
  return draftLanguage;
}

/**
 * Returns the current draft bookmark default object.
 *
 * Falls back to persisted settings if the draft has not been initialized yet.
 *
 * @returns {Object}
 */
export function getDraftBookmarkDefault() {
  const { data: { settings } } = getState();
  return draftBookmarkDefault ?? settings.bookmarkDefault;
}

export function getDraftBookmarkPresets() {
  const { data: { settings } } = getState();
  return draftBookmarkPresets ?? settings.bookmarkPresets ?? [];
}

export function getDraftBookmarkDragMode() {
  const { data: { settings } } = getState();
  return draftBookmarkDragMode
    ?? normalizeBookmarkDragMode(settings.bookmarkDragMode);
}

export function getDraftBookmarkResizeMode() {
  const { data: { settings } } = getState();
  return draftBookmarkResizeMode
    ?? normalizeBookmarkResizeMode(settings.bookmarkResizeMode);
}

export function getDraftKeyboardShortcuts() {
  const { data: { settings } } = getState();
  return draftKeyboardShortcuts
    ?? normalizeKeyboardShortcuts(settings.keyboardShortcuts);
}

/**
 * Returns the selected per-device persistence mode.
 *
 * @returns {'local'|'sync'|null}
 */
export function getDraftStorageMode() {
  return draftStorageMode;
}

/**
 * Returns the original settings snapshot captured when the modal opened.
 *
 * @returns {Object|null}
 */
export function getInitialSnapshot() {
  return initialSnapshot;
}

/* ==================================================
   SETTERS (granular)
================================================== */

/**
 * Updates the draft language value.
 *
 * @param {string} language
 */
export function setDraftLanguage(language) {
  draftLanguage = language;
}

/**
 * Updates the selected per-device persistence mode.
 *
 * @param {'local'|'sync'} storageMode
 */
export function setDraftStorageMode(storageMode) {
  draftStorageMode = storageMode;
}

/**
 * Reconciles a storage-mode change that was already applied outside the normal
 * settings save flow, while preserving every other draft edit.
 */
export function reconcileDraftStorageMode(storageMode) {
  draftStorageMode = storageMode;
  if (initialSnapshot) initialSnapshot.storageMode = storageMode;
}

export function setDraftBookmarkDragMode(mode) {
  draftBookmarkDragMode = normalizeBookmarkDragMode(mode);
}

export function setDraftBookmarkResizeMode(mode) {
  draftBookmarkResizeMode = normalizeBookmarkResizeMode(mode);
}

export function setDraftKeyboardShortcut(action, shortcut) {
  if (!draftKeyboardShortcuts || !Object.hasOwn(draftKeyboardShortcuts, action)) return;
  draftKeyboardShortcuts = {
    ...draftKeyboardShortcuts,
    [action]: shortcut
  };
}

/**
 * Updates a single field inside the draft theme object.
 *
 * Does nothing if the draft theme has not been initialized yet.
 *
 * @param {string} key
 * @param {*} value
 */
export function setDraftThemeValue(key, value) {
  if (!draftTheme) return;
  draftTheme[key] = value;
}

/* ==================================================
   FULL REPLACEMENTS (for resets)
================================================== */

/**
 * Replaces the entire draft theme object.
 *
 * @param {Object} newTheme
 */
export function replaceDraftTheme(newTheme) {
  draftTheme = structuredClone(newTheme);
}

/**
 * Replaces the entire draft bookmark default object.
 *
 * @param {Object} newBookmarkDefault
 */
export function replaceDraftBookmarkDefault(newBookmarkDefault) {
  draftBookmarkDefault = structuredClone(newBookmarkDefault);
}

export function replaceDraftBookmarkPresets(presets) {
  draftBookmarkPresets = structuredClone(presets);
}

export function replaceDraftKeyboardShortcuts(shortcuts) {
  draftKeyboardShortcuts = normalizeKeyboardShortcuts(shortcuts);
}

/** Replaces every editable settings draft while preserving the storage choice. */
export function replaceDraftSettings(settings) {
  draftTheme = structuredClone(settings.theme);
  draftLanguage = settings.language;
  draftInterfaceTheme = normalizeInterfaceTheme(settings.interfaceTheme);
  draftShowRecycleBin = settings.showRecycleBin !== false;
  draftBookmarkDefault = structuredClone(settings.bookmarkDefault);
  draftBookmarkPresets = structuredClone(settings.bookmarkPresets ?? []);
  draftBookmarkDragMode = normalizeBookmarkDragMode(settings.bookmarkDragMode);
  draftBookmarkResizeMode = normalizeBookmarkResizeMode(settings.bookmarkResizeMode);
  draftKeyboardShortcuts = normalizeKeyboardShortcuts(settings.keyboardShortcuts);
}

/* ==================================================
   CHANGE DETECTION
================================================== */

/**
 * Returns whether the current draft differs from the initial snapshot.
 *
 * Compared sections:
 * - storage mode
 * - language
 * - theme
 * - bookmark default
 * - named bookmark presets
 *
 * @returns {boolean}
 */
export function hasChanges() {
  if (!initialSnapshot) return false;

  const draftComparable = {
    storageMode: draftStorageMode,
    language: draftLanguage,
    interfaceTheme: draftInterfaceTheme,
    showRecycleBin: draftShowRecycleBin,
    theme: draftTheme,
    bookmarkDragMode: draftBookmarkDragMode,
    bookmarkResizeMode: draftBookmarkResizeMode,
    keyboardShortcuts: draftKeyboardShortcuts,
    bookmarkDefault: draftBookmarkDefault,
    bookmarkPresets: draftBookmarkPresets
  };
  const initialComparable = {
    storageMode: initialSnapshot.storageMode,
    language: initialSnapshot.language,
    interfaceTheme: normalizeInterfaceTheme(initialSnapshot.interfaceTheme),
    showRecycleBin: initialSnapshot.showRecycleBin !== false,
    theme: initialSnapshot.theme,
    bookmarkDragMode: normalizeBookmarkDragMode(initialSnapshot.bookmarkDragMode),
    bookmarkResizeMode: normalizeBookmarkResizeMode(initialSnapshot.bookmarkResizeMode),
    keyboardShortcuts: normalizeKeyboardShortcuts(initialSnapshot.keyboardShortcuts),
    bookmarkDefault: initialSnapshot.bookmarkDefault,
    bookmarkPresets: initialSnapshot.bookmarkPresets ?? []
  };

  return JSON.stringify(draftComparable) !== JSON.stringify(initialComparable);
}

/* ==================================================
   FINAL BUILDER (SAVE)
================================================== */

/**
 * Builds the final settings object to persist.
 *
 * The returned object is fully cloned where needed
 * to avoid leaking draft references.
 *
 * @returns {Settings}
 */
export function buildNewSettings() {
  return {
    language: draftLanguage,
    interfaceTheme: draftInterfaceTheme,
    showRecycleBin: draftShowRecycleBin,
    theme: structuredClone(draftTheme),
    bookmarkDragMode: draftBookmarkDragMode,
    bookmarkResizeMode: draftBookmarkResizeMode,
    keyboardShortcuts: structuredClone(draftKeyboardShortcuts),
    bookmarkDefault: structuredClone(draftBookmarkDefault),
    bookmarkPresets: structuredClone(draftBookmarkPresets),
    bookmarkGroups: structuredClone(initialSnapshot?.bookmarkGroups ?? []),
    activeBookmarkGroupId: initialSnapshot?.activeBookmarkGroupId ?? null
  };
}
