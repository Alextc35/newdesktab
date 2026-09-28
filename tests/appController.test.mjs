import assert from 'node:assert/strict';
import test from 'node:test';

import { detectApplicationChanges } from '../src/app/appStateChanges.js';

function createState() {
  return {
    data: {
      bookmarks: [],
      folders: [],
      widgets: [],
      recycleBin: { id: 'recycle-bin' },
      trash: [],
      settings: { interfaceTheme: 'system' }
    },
    ui: { isEditing: false }
  };
}

test('detects grid collections and settings that require a render', () => {
  const previous = createState();
  const state = {
    ...previous,
    data: { ...previous.data, widgets: [{ id: 'clock' }] }
  };

  assert.deepEqual(detectApplicationChanges(state, previous), {
    settings: false,
    bookmarks: false,
    folders: false,
    widgets: true,
    recycleBin: false,
    editing: false,
    grid: true
  });
});

test('keeps edit-only transitions separate from grid data changes', () => {
  const previous = createState();
  const state = { ...previous, ui: { isEditing: true } };

  assert.deepEqual(detectApplicationChanges(state, previous), {
    settings: false,
    bookmarks: false,
    folders: false,
    widgets: false,
    recycleBin: false,
    editing: true,
    grid: false
  });
});
