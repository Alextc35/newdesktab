import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraftHistory } from '../src/shared/data/draftHistory.js';

test('native text undo and redo share the draft button stacks, including partial typing', () => {
  const history = createDraftHistory({ name: 'Original' });
  history.record({ name: 'New title' }, { group: 'name' });
  history.syncNative({ name: 'New titl' }, 'undo');
  assert.deepEqual(history.getStatus(), { canUndo: true, canRedo: true });
  history.syncNative({ name: 'New title' }, 'redo');
  assert.deepEqual(history.getStatus(), { canUndo: true, canRedo: false });
  assert.deepEqual(history.undo(), { name: 'New titl' });
  assert.deepEqual(history.undo(), { name: 'Original' });
  history.syncNative({ name: 'New title' }, 'redo');
  assert.deepEqual(history.getStatus(), { canUndo: true, canRedo: false });
  history.syncNative({ name: 'Original' }, 'undo');
  assert.deepEqual(history.getStatus(), { canUndo: false, canRedo: true });
});

test('draft snapshots are isolated, reversible and leave their initial input untouched', () => {
  const original = { color: 'blue', labels: ['original'] };
  const history = createDraftHistory(original);
  original.labels.push('outside');
  const next = { color: 'red', labels: ['red'] };
  history.record(next);
  next.labels.push('outside');
  const undone = history.undo();
  assert.deepEqual(undone, { color: 'blue', labels: ['original'] });
  undone.labels.push('outside');
  assert.deepEqual(history.redo(), { color: 'red', labels: ['red'] });
  assert.deepEqual(history.undo(), { color: 'blue', labels: ['original'] });
  assert.equal(history.undo(), null);
});

test('continuous edits form one step and discrete changes clear the redo branch', () => {
  const history = createDraftHistory({ color: 0 });
  history.record({ color: 1 }, { group: 'drag' });
  history.record({ color: 2 }, { group: 'drag' });
  history.record({ color: 3 }, { group: 'drag' });
  assert.deepEqual(history.undo(), { color: 0 });
  assert.deepEqual(history.redo(), { color: 3 });
  history.record({ color: 4 });
  assert.deepEqual(history.undo(), { color: 3 });
  history.record({ color: 5 });
  assert.equal(history.redo(), null);
  assert.deepEqual(history.undo(), { color: 3 });
});

test('no-ops, bounded history and opening a new session do not resurrect old drafts', () => {
  const history = createDraftHistory({ color: 0 }, { limit: 2 });
  assert.equal(history.record({ color: 0 }), false);
  for (const color of [1, 2, 3]) history.record({ color });
  assert.deepEqual(history.undo(), { color: 2 });
  assert.deepEqual(history.undo(), { color: 1 });
  assert.equal(history.undo(), null);
  history.reset({ color: 9 });
  assert.deepEqual(history.getStatus(), { canUndo: false, canRedo: false });
  assert.equal(history.redo(), null);
});
