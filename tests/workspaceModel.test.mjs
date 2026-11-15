import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorkspace,
  getAdjacentWorkspaceId,
  getWorkspaceIds,
  normalizeMainWorkspace,
  normalizeWorkspaces,
  resolveWorkspaceId
} from '../src/domain/workspaces/workspaceModel.js';

test('creates and normalizes workspace entities without changing persisted identity', () => {
  assert.deepEqual(createWorkspace({ id: 'work', name: '  Work  ' }), {
    id: 'work',
    name: 'Work',
    backgroundImageUrl: null,
    backgroundImageLocal: null,
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: false,
    backgroundMedia: [],
    backgroundRotationSeconds: 0,
    themeEnabled: false,
    backgroundSolid: false,
    backgroundColor: '#101827'
  });
  assert.equal(createWorkspace({ id: 'work', name: '  ' }), null);

  assert.deepEqual(normalizeWorkspaces([
    { id: 'work', name: '  Work  ' },
    { id: '', name: '' },
    null
  ]), [
    {
      id: 'work', name: 'Work', backgroundImageUrl: null, backgroundImageLocal: null,
      backgroundImageSource: 'url', backgroundImageUrlLocked: false,
      backgroundMedia: [], backgroundRotationSeconds: 0, themeEnabled: false,
      backgroundSolid: false, backgroundColor: '#101827'
    },
    {
      id: 'workspace-2', name: 'Workspace 2', backgroundImageUrl: null,
      backgroundImageLocal: null, backgroundImageSource: 'url', backgroundImageUrlLocked: false,
      backgroundMedia: [], backgroundRotationSeconds: 0, themeEnabled: false,
      backgroundSolid: false, backgroundColor: '#101827'
    }
  ]);
});

test('normalizes a workspace URL and preserves local-upload selection separately', () => {
  const workspaces = normalizeWorkspaces([{
    id: 'work',
    name: 'Work',
    backgroundImageUrl: ' https://images.example/wallpaper.jpg ',
    backgroundImageLocal: 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9',
    backgroundImageSource: 'local'
  }, {
    id: 'invalid', name: 'Invalid', backgroundImageUrl: 'javascript:alert(1)'
  }]);

  assert.equal(workspaces[0].backgroundImageUrl, 'https://images.example/wallpaper.jpg');
  assert.equal(workspaces[0].backgroundImageLocal,
    'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9');
  assert.equal(workspaces[0].backgroundImageSource, 'local');
  assert.equal(workspaces[1].backgroundImageUrl, null);
  assert.equal(normalizeWorkspaces([{
    id: 'inline', name: 'Inline',
    backgroundImageUrl: 'data:image/png;base64,aGVsbG8='
  }])[0].backgroundImageUrl, null);
});

test('normalizes the editable Main workspace settings', () => {
  assert.deepEqual(normalizeMainWorkspace({
    name: ' Main ',
    backgroundImageUrl: 'https://images.example/main.jpg'
  }), {
    name: 'Main',
    backgroundImageUrl: 'https://images.example/main.jpg',
    backgroundImageLocal: null,
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: false,
    backgroundMedia: [{ id: 'workspace-wallpaper-legacy', type: 'image',
      backgroundImageUrl: 'https://images.example/main.jpg', backgroundImageLocal: null,
      backgroundImageSource: 'url', backgroundColor: null }],
    backgroundRotationSeconds: 0,
    themeEnabled: true,
    backgroundSolid: false,
    backgroundColor: '#101827'
  });
});

test('normalizes per-workspace global and solid background theme options', () => {
  const [global, solid] = normalizeWorkspaces([
    { id: 'global', name: 'Global', themeEnabled: false, backgroundSolid: true },
    { id: 'solid', name: 'Solid', backgroundSolid: true, backgroundColor: '#336699' }
  ]);
  assert.equal(global.themeEnabled, false);
  assert.equal(solid.themeEnabled, true);
  assert.equal(solid.backgroundSolid, true);
  assert.equal(solid.backgroundColor, '#336699');
  assert.equal(normalizeWorkspaces([{ id: 'bad', name: 'Bad', backgroundColor: 'red' }])[0]
    .backgroundColor, '#101827');
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
