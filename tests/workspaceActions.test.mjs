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
  moveBookmarksToWorkspace,
  setActiveWorkspace
} = await import(
  '../src/features/workspaces/workspaceActions.js'
);
const { getState, hydrateStore, setState } = await import('../src/state/appStore.js');

test('deleting a workspace also deletes its bookmarks without moving them to Main', async () => {
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
    moveBookmarksToWorkspace(['source'], 'work', { columns: 2, rows: 1 }),
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
