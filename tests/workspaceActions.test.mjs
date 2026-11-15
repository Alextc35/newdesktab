import assert from 'node:assert/strict';
import test from 'node:test';

const storedData = {};
const createArea = () => ({
  QUOTA_BYTES: 102400,
  get(keys, callback) {
    const requested = keys === null ? Object.keys(storedData) : (Array.isArray(keys) ? keys : [keys]);
    callback(Object.fromEntries(
      requested.filter(key => Object.hasOwn(storedData, key)).map(key => [key, storedData[key]])
    ));
  },
  set(items, callback) {
    Object.assign(storedData, structuredClone(items));
    callback?.();
  },
  remove(keys, callback) {
    for (const key of (Array.isArray(keys) ? keys : [keys])) delete storedData[key];
    callback?.();
  }
});

globalThis.chrome = {
  runtime: {
    lastError: null,
    getManifest: () => ({ version: '0.1.2' })
  },
  storage: {
    local: createArea(),
    sync: createArea(),
    onChanged: { addListener() {} }
  }
};

const {
  createWorkspace,
  deleteWorkspace,
  reorderWorkspaces,
  setActiveWorkspace,
  updateWorkspace
} = await import(
  '../src/features/workspaces/workspaceActions.js'
);
const { getState, hydrateStore, setState } = await import('../src/state/appStore.js');
const { moveGridItemsToWorkspace } = await import('../src/features/grid/gridItemActions.js');

test('deleting a workspace removes its bookmarks, folders and widgets without moving them to Main', async () => {
  await hydrateStore();
  await setState({
    data: {
      bookmarks: [
        { id: 'main', name: 'Main', groupId: null, gx: 0, gy: 0, w: 1, h: 1 },
        { id: 'temporary', name: 'Temporary', groupId: 'temporary', gx: 0, gy: 0, w: 1, h: 1 }
      ],
      folders: [
        { id: 'main-folder', name: 'Main folder', groupId: null, gx: 1, gy: 0, w: 1, h: 1 },
        { id: 'temporary-folder', name: 'Temporary folder', groupId: 'temporary', gx: 1, gy: 0, w: 1, h: 1 }
      ],
      widgets: [
        { id: 'main-clock', type: 'clock', groupId: null, gx: 2, gy: 0, w: 1, h: 1 },
        { id: 'temporary-clock', type: 'clock', groupId: 'temporary', gx: 2, gy: 0, w: 1, h: 1 }
      ],
      settings: {
        ...getState().data.settings,
        bookmarkGroups: [{ id: 'temporary', name: 'Temporary' }],
        activeBookmarkGroupId: 'temporary'
      }
    }
  });

  assert.equal(deleteWorkspace('temporary'), true);
  assert.deepEqual(getState().data.bookmarks.map(bookmark => bookmark.id), ['main']);
  assert.deepEqual(getState().data.folders.map(folder => folder.id), ['main-folder']);
  assert.deepEqual(getState().data.widgets.map(widget => widget.id), ['main-clock']);
  assert.deepEqual(getState().data.settings.bookmarkGroups, []);
  assert.equal(getState().data.settings.activeBookmarkGroupId, null);
});

test('creates, activates and safely resolves workspaces through feature actions', async () => {
  const workspace = createWorkspace('  Personal  ');
  assert.equal(workspace.name, 'Personal');
  assert.equal(getState().data.settings.activeBookmarkGroupId, workspace.id);

  assert.equal(await setActiveWorkspace('missing'), true);
  assert.equal(getState().data.settings.activeBookmarkGroupId, null);
  assert.equal(await setActiveWorkspace(null), false);
});

test('reorders workspaces while preserving their data and active selection', () => {
  const alpha = { id: 'alpha', name: 'Alpha', backgroundColor: '#112233' };
  const beta = { id: 'beta', name: 'Beta', backgroundImageUrl: 'https://images.example/beta.jpg' };
  setState({ data: { settings: {
    ...getState().data.settings,
    bookmarkGroups: [alpha, beta],
    activeBookmarkGroupId: 'alpha'
  } } });

  assert.equal(reorderWorkspaces(['beta', 'alpha']), true);
  assert.deepEqual(getState().data.settings.bookmarkGroups, [beta, alpha]);
  assert.equal(getState().data.settings.activeBookmarkGroupId, 'alpha');
  assert.equal(reorderWorkspaces(['beta', 'missing']), false);
  assert.equal(reorderWorkspaces(['beta', 'beta']), false);
});

test('updates a workspace name and wallpaper without changing its identity', async () => {
  const workspace = createWorkspace('Studio');
  const updated = updateWorkspace(workspace.id, {
    name: '  Research  ',
    backgroundImageUrl: 'https://images.example/research.jpg',
    backgroundImageSource: 'url'
  });

  assert.equal(updated.name, 'Research');
  assert.equal(updated.id, workspace.id);
  assert.equal(updated.backgroundImageUrl, 'https://images.example/research.jpg');
  assert.equal(updateWorkspace(workspace.id, { name: '  ' }), null);
  assert.equal(updateWorkspace('missing', { name: 'Unused' }), null);
});

test('updates Main workspace name and wallpaper without adding a custom workspace', () => {
  setState({ data: { settings: {
    ...getState().data.settings,
    bookmarkGroups: [],
    activeBookmarkGroupId: null
  } } });
  const updated = updateWorkspace(null, {
    name: 'Home',
    backgroundImageUrl: 'https://images.example/home.jpg'
  });

  assert.equal(updated.name, 'Home');
  assert.equal(getState().data.settings.mainWorkspace.backgroundImageUrl,
    'https://images.example/home.jpg');
  assert.equal(getState().data.settings.bookmarkGroups.length, 0);
});

test('moves bookmarks into available cells in the requested workspace', async () => {
  await setState({
    data: {
      bookmarks: [
        { id: 'source', name: 'Source', groupId: null, folderId: null, gx: 0, gy: 0, w: 1, h: 1 },
        { id: 'occupied', name: 'Occupied', groupId: 'work', folderId: null, gx: 0, gy: 0, w: 1, h: 1 }
      ],
      folders: [],
      settings: {
        ...getState().data.settings,
        bookmarkGroups: [{ id: 'work', name: 'Work' }],
        activeBookmarkGroupId: null
      }
    }
  });

  assert.deepEqual(
    moveGridItemsToWorkspace([{ kind: 'bookmark', id: 'source' }], 'work', { columns: 2, rows: 1 }),
    { moved: 1, skipped: 0 }
  );
  assert.deepEqual(
    getState().data.bookmarks.find(bookmark => bookmark.id === 'source'),
    {
      id: 'source',
      name: 'Source',
      groupId: 'work',
      folderId: null,
      gx: 1,
      gy: 0,
      w: 1,
      h: 1,
      updatedAt: getState().data.bookmarks.find(bookmark => bookmark.id === 'source').updatedAt
    }
  );
});
