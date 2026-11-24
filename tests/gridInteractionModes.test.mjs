import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOKMARK_DRAG_MODES,
  BOOKMARK_RESIZE_MODES,
  WINDOW_RESIZE_MODES,
  normalizeBookmarkDragMode,
  normalizeBookmarkResizeMode,
  normalizeWindowResizeMode
} from '../src/domain/settings/gridInteractionModes.js';
import { DEFAULT_SETTINGS } from '../src/domain/settings/settingsDefaults.js';

test('normalizes persisted drag modes without changing supported values', () => {
  for (const mode of Object.values(BOOKMARK_DRAG_MODES)) {
    assert.equal(normalizeBookmarkDragMode(mode), mode);
  }
  assert.equal(normalizeBookmarkDragMode('unknown'), BOOKMARK_DRAG_MODES.NONE);
  assert.equal(normalizeBookmarkDragMode(undefined), BOOKMARK_DRAG_MODES.NONE);
});

test('normalizes persisted resize modes without changing supported values', () => {
  for (const mode of Object.values(BOOKMARK_RESIZE_MODES)) {
    assert.equal(normalizeBookmarkResizeMode(mode), mode);
  }
  assert.equal(normalizeBookmarkResizeMode('unknown'), BOOKMARK_RESIZE_MODES.SMOOTH);
  assert.equal(normalizeBookmarkResizeMode(undefined), BOOKMARK_RESIZE_MODES.SMOOTH);
});

test('preserves supported window resize modes and defaults to keeping bookmark size', () => {
  for (const mode of Object.values(WINDOW_RESIZE_MODES)) {
    assert.equal(normalizeWindowResizeMode(mode), mode);
  }
  assert.equal(DEFAULT_SETTINGS.windowResizeMode, WINDOW_RESIZE_MODES.RELATIVE);
  for (const invalid of ['unknown', undefined, null, false, 1]) {
    assert.equal(normalizeWindowResizeMode(invalid), WINDOW_RESIZE_MODES.RELATIVE);
  }
});
