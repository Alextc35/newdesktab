import assert from 'node:assert/strict';
import test from 'node:test';

import { describeStateChange } from '../src/state/stateChangeDescription.js';

const previous = {
  bookmarks: [{ id: 'bookmark' }],
  folders: [{ id: 'folder' }],
  settings: {
    activeBookmarkGroupId: 'workspace-a',
    bookmarkGroups: [{ id: 'workspace-a' }]
  }
};

test('state change descriptions classify UI, workspace and grid updates', () => {
  assert.equal(describeStateChange({ ui: { isEditing: true } }, previous), 'Update UI state');
  assert.equal(describeStateChange({ data: {
    settings: { ...previous.settings, bookmarkGroups: [...previous.settings.bookmarkGroups, { id: 'b' }] }
  } }, previous), 'Create workspace');
  assert.equal(describeStateChange({ data: { folders: [] } }, previous), 'Delete folder');
  assert.equal(describeStateChange({ data: { bookmarks: [] } }, previous), 'Delete bookmarks');
  assert.equal(describeStateChange({ data: {
    settings: { ...previous.settings, activeBookmarkGroupId: 'workspace-b' }
  } }, previous), 'Switch workspace');
  assert.equal(describeStateChange({ data: { widgets: [] } }, previous), 'Update bookmarks / grid');
});
