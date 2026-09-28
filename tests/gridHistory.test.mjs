import assert from 'node:assert/strict';
import test from 'node:test';

import { createGridHistory, hasGridDataChange } from '../src/js/state/gridHistory.js';

const createData = name => ({
  bookmarks: [{ id: name, name }],
  folders: [],
  widgets: [],
  recycleBin: { enabled: true },
  trash: []
});

test('grid history records immutable snapshots and walks undo/redo', () => {
  const history = createGridHistory();
  const first = createData('first');
  const second = createData('second');

  history.record(first);
  first.bookmarks[0].name = 'mutated';

  const undo = history.takeUndo(second);
  assert.equal(undo.data.bookmarks[0].name, 'first');
  assert.deepEqual(undo.status, { canUndo: false, canRedo: true });

  const redo = history.takeRedo(undo.data);
  assert.equal(redo.data.bookmarks[0].name, 'second');
  assert.deepEqual(redo.status, { canUndo: true, canRedo: false });
});

test('recording after undo clears redo and respects the configured limit', () => {
  const history = createGridHistory({ limit: 2 });
  history.record(createData('one'));
  history.record(createData('two'));
  history.record(createData('three'));

  const current = createData('current');
  assert.equal(history.takeUndo(current).data.bookmarks[0].name, 'three');
  assert.equal(history.takeUndo(current).data.bookmarks[0].name, 'two');
  assert.equal(history.takeUndo(current), null);

  history.record(createData('replacement'));
  assert.deepEqual(history.getStatus(), { canUndo: true, canRedo: false });
});

test('grid change detection ignores unrelated data and equal references', () => {
  const data = createData('current');

  assert.equal(hasGridDataChange(undefined, data), false);
  assert.equal(hasGridDataChange({ settings: {} }, data), false);
  assert.equal(hasGridDataChange({ bookmarks: data.bookmarks }, data), false);
  assert.equal(hasGridDataChange({ bookmarks: [] }, data), true);
  assert.equal(hasGridDataChange({ widgets: [] }, data), true);
});
