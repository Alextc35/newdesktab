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
    getManifest: () => ({ version: '0.17.1' })
  },
  storage: {
    local: createArea(),
    sync: createArea(),
    onChanged: { addListener() {} }
  }
};

const {
  applyDefaultStylesToGridItems,
  duplicateGridItems,
  moveGridItemsToWorkspace,
  permanentlyDeleteGridItem
} = await import('../src/features/grid/gridItemActions.js');
const { moveGridItemsToRecycleBin } = await import(
  '../src/features/recycle-bin/recycleBinActions.js'
);
const { DEFAULT_BOOKMARK } = await import('../src/domain/bookmarks/bookmarkDefaults.js');
const { DEFAULT_FOLDER_STYLE } = await import('../src/domain/folders/folderDefaults.js');
const {
  clearBookmarkHistory,
  getState,
  hydrateStore,
  setState,
  undoBookmarks
} = await import('../src/state/appStore.js');

await hydrateStore();

function bookmark(id, values = {}) {
  return {
    ...DEFAULT_BOOKMARK,
    id,
    name: id,
    url: `https://${id}.test`,
    createdAt: 1,
    updatedAt: 1,
    ...values
  };
}

function folder(id, values = {}) {
  return {
    ...DEFAULT_FOLDER_STYLE,
    id,
    name: id,
    gx: 1,
    gy: 0,
    w: 1,
    h: 1,
    groupId: null,
    createdAt: 1,
    updatedAt: 1,
    ...values
  };
}

function widget(id, values = {}) {
  return {
    id,
    type: 'clock',
    version: 1,
    gx: 2,
    gy: 0,
    w: 1,
    h: 1,
    groupId: null,
    config: {},
    createdAt: 1,
    updatedAt: 1,
    ...values
  };
}

async function seed() {
  await setState({
    data: {
      bookmarks: [
        bookmark('top', { gx: 0, backgroundColor: '#123456', noBackground: false }),
        bookmark('child', { folderId: 'folder', gx: 2, gy: 1 })
      ],
      folders: [folder('folder', {
        backgroundColor: '#654321',
        showFolder: false,
        showPreviews: false
      })],
      widgets: [],
      trash: [],
      settings: {
        ...getState().data.settings,
        showRecycleBin: false,
        bookmarkGroups: [{ id: 'work', name: 'Work' }],
        activeBookmarkGroupId: null,
        bookmarkDefault: {
          ...getState().data.settings.bookmarkDefault,
          backgroundColor: '#abcdef',
          noBackground: false
        }
      }
    }
  });
  clearBookmarkHistory();
}

test('applies each item type default without changing identity or layout', async () => {
  await seed();
  const selected = [
    { kind: 'bookmark', id: 'top' },
    { kind: 'folder', id: 'folder' }
  ];

  assert.deepEqual(
    applyDefaultStylesToGridItems(selected, getState().data.settings.bookmarkDefault),
    { bookmarks: 1, folders: 1 }
  );

  const state = getState().data;
  assert.equal(state.bookmarks.find(item => item.id === 'top').backgroundColor, '#abcdef');
  const updatedFolder = state.folders.find(item => item.id === 'folder');
  assert.equal(updatedFolder.backgroundColor, DEFAULT_FOLDER_STYLE.backgroundColor);
  assert.equal(updatedFolder.showFolder, true);
  assert.deepEqual(
    { id: updatedFolder.id, name: updatedFolder.name, gx: updatedFolder.gx, gy: updatedFolder.gy },
    { id: 'folder', name: 'folder', gx: 1, gy: 0 }
  );
});

test('duplicates a mixed selection and keeps cloned folder contents together', async () => {
  await seed();
  const result = duplicateGridItems([
    { kind: 'bookmark', id: 'top' },
    { kind: 'folder', id: 'folder' }
  ], { columns: 4, rows: 1, nameSuffix: 'copy' });

  assert.equal(result.skipped, 0);
  assert.equal(result.duplicates.length, 2);
  const data = getState().data;
  const folderCopy = data.folders.find(item => item.id !== 'folder');
  const childCopy = data.bookmarks.find(item => item.folderId === folderCopy.id);
  assert.ok(folderCopy);
  assert.equal(folderCopy.name, 'folder (copy)');
  assert.ok(childCopy);
  assert.notEqual(childCopy.id, 'child');
  assert.equal(childCopy.groupId, folderCopy.groupId);
  assert.equal(data.bookmarks.filter(item => !item.folderId).length, 2);
});

test('moves a mixed selection with folder contents and deletes it atomically', async () => {
  await seed();
  const selected = [
    { kind: 'bookmark', id: 'top' },
    { kind: 'folder', id: 'folder' }
  ];
  const moved = moveGridItemsToWorkspace(selected, 'work', { columns: 3, rows: 1 });

  assert.deepEqual(moved, { moved: 2, skipped: 0 });
  assert.equal(getState().data.bookmarks.find(item => item.id === 'top').groupId, 'work');
  assert.equal(getState().data.folders[0].groupId, 'work');
  assert.equal(getState().data.bookmarks.find(item => item.id === 'child').groupId, 'work');
  assert.equal(getState().data.bookmarks.find(item => item.id === 'child').folderId, 'folder');

  const deleted = moveGridItemsToRecycleBin({
    bookmarkIds: ['top'],
    folderIds: ['folder']
  });
  assert.deepEqual(deleted, { bookmarks: 1, folders: 1 });
  assert.deepEqual(getState().data.bookmarks, []);
  assert.deepEqual(getState().data.folders, []);
  assert.equal(getState().data.trash.length, 2);
  assert.equal(getState().data.trash.find(entry => entry.type === 'folder').bookmarks.length, 1);

  await undoBookmarks();
  assert.deepEqual(getState().data.bookmarks.map(item => item.id).sort(), ['child', 'top']);
  assert.deepEqual(getState().data.folders.map(item => item.id), ['folder']);
  assert.deepEqual(getState().data.trash, []);
});

test('moves selected widgets between workspaces without losing their configuration', async () => {
  await seed();
  await setState({
    data: { widgets: [widget('clock', { config: { showSeconds: true } })] }
  });
  clearBookmarkHistory();

  assert.deepEqual(
    moveGridItemsToWorkspace(
      [{ kind: 'widget', id: 'clock' }],
      'work',
      { columns: 3, rows: 1 }
    ),
    { moved: 1, skipped: 0 }
  );
  const moved = getState().data.widgets[0];
  assert.equal(moved.groupId, 'work');
  assert.deepEqual(moved.config, { showSeconds: true });
});

test('permanently deletes live bookmarks, complete folders and widgets without undo history', async () => {
  await seed();
  assert.deepEqual(permanentlyDeleteGridItem('bookmark', 'top'), {
    deleted: true,
    bookmarkCount: 1
  });
  assert.equal(getState().data.bookmarks.some(item => item.id === 'top'), false);
  assert.deepEqual(getState().data.trash, []);
  assert.equal(await undoBookmarks(), false);

  await seed();
  assert.deepEqual(permanentlyDeleteGridItem('folder', 'folder'), {
    deleted: true,
    bookmarkCount: 1
  });
  assert.deepEqual(getState().data.folders, []);
  assert.equal(getState().data.bookmarks.some(item => item.id === 'child'), false);
  assert.deepEqual(getState().data.trash, []);
  assert.equal(await undoBookmarks(), false);

  await seed();
  await setState({ data: { widgets: [widget('clock')] } });
  clearBookmarkHistory();
  assert.deepEqual(permanentlyDeleteGridItem('widget', 'clock'), {
    deleted: true,
    bookmarkCount: 0
  });
  assert.deepEqual(getState().data.widgets, []);
  assert.equal(await undoBookmarks(), false);
});
