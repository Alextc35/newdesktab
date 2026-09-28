import { beforeEach, expect, test, vi } from 'vitest';

import {
  clearGridItemSelection,
  getSelectedGridItems,
  pruneGridItemSelection,
  subscribeToGridItemSelection,
  toggleGridItemSelection
} from '../../src/features/grid/gridSelection.js';

beforeEach(() => clearGridItemSelection());

test('selection toggles, publishes snapshots and prunes deleted grid items', () => {
  const listener = vi.fn();
  const unsubscribe = subscribeToGridItemSelection(listener);

  toggleGridItemSelection('bookmark', 'one');
  toggleGridItemSelection('bookmark', 'two');
  toggleGridItemSelection('bookmark', 'one');
  pruneGridItemSelection({ bookmarkIds: ['one'] });

  expect(getSelectedGridItems()).toEqual([]);
  expect(listener).toHaveBeenCalledTimes(5);
  unsubscribe();
});

test('keeps bookmark, folder and widget identities distinct in a mixed selection', () => {
  toggleGridItemSelection('bookmark', 'shared-id');
  toggleGridItemSelection('folder', 'shared-id');
  toggleGridItemSelection('folder', 'other-folder');
  toggleGridItemSelection('widget', 'shared-id');
  toggleGridItemSelection('widget', 'clock');

  expect(getSelectedGridItems()).toEqual([
    { kind: 'bookmark', id: 'shared-id' },
    { kind: 'folder', id: 'shared-id' },
    { kind: 'folder', id: 'other-folder' },
    { kind: 'widget', id: 'shared-id' },
    { kind: 'widget', id: 'clock' }
  ]);

  pruneGridItemSelection({
    bookmarkIds: ['shared-id'],
    folderIds: ['other-folder'],
    widgetIds: ['clock']
  });
  expect(getSelectedGridItems()).toEqual([
    { kind: 'bookmark', id: 'shared-id' },
    { kind: 'folder', id: 'other-folder' },
    { kind: 'widget', id: 'clock' }
  ]);
});
