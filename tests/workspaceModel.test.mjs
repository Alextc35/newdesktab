import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorkspace,
  getAdjacentWorkspaceId,
  getWorkspaceIds,
  normalizeWorkspaces,
  resolveWorkspaceId
} from '../src/domain/workspaces/workspaceModel.js';

test('creates and normalizes workspace entities without changing persisted identity', () => {
  assert.deepEqual(createWorkspace({ id: 'work', name: '  Work  ' }), {
    id: 'work',
    name: 'Work'
  });
  assert.equal(createWorkspace({ id: 'work', name: '  ' }), null);

  assert.deepEqual(normalizeWorkspaces([
    { id: 'work', name: '  Work  ' },
    { id: '', name: '' },
    null
  ]), [
    { id: 'work', name: 'Work' },
    { id: 'workspace-2', name: 'Workspace 2' }
  ]);
});

test('resolves unknown workspace references to Main', () => {
  const workspaces = [{ id: 'work', name: 'Work' }];
  assert.equal(resolveWorkspaceId(workspaces, 'work'), 'work');
  assert.equal(resolveWorkspaceId(workspaces, 'missing'), null);
  assert.equal(resolveWorkspaceId(workspaces, null), null);
  assert.deepEqual(getWorkspaceIds(workspaces), [null, 'work']);
});

test('cycles through workspaces in both directions including Main', () => {
  const workspaces = [
    { id: 'work', name: 'Work' },
    { id: 'play', name: 'Play' }
  ];

  assert.equal(getAdjacentWorkspaceId(workspaces, null, 1), 'work');
  assert.equal(getAdjacentWorkspaceId(workspaces, null, -1), 'play');
  assert.equal(getAdjacentWorkspaceId(workspaces, 'work', -1), null);
  assert.equal(getAdjacentWorkspaceId(workspaces, 'play', 1), null);
  assert.equal(getAdjacentWorkspaceId(workspaces, 'missing', 0), null);
});
