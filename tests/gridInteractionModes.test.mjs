import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOKMARK_DRAG_MODES,
  BOOKMARK_RESIZE_MODES,
  normalizeBookmarkDragMode,
  normalizeBookmarkResizeMode
} from '../src/js/domain/settings/gridInteractionModes.js';

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
