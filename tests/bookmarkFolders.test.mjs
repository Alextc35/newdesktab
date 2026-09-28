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
    getManifest: () => ({ version: '0.2.0' })
  },
  storage: {
    local: createArea(),
    sync: createArea(),
    onChanged: { addListener() {} }
  }
};

const {
  addBookmarkToFolder,
  BOOKMARK_FOLDER_NAME_MAX_LENGTH,
  createBookmarkFolder,
  deleteBookmarkFolder,
  removeBookmarkFromFolder,
  renameBookmarkFolder,
  updateBookmarkFolder,
  updateFolderBookmarkPositions
} = await import('../src/features/folders/folderActions.js');
const { updateGridItemsByIds } = await import('../src/features/grid/gridItemActions.js');
const {
  createFolderBookmarkLayout,
  FOLDER_GRID_CAPACITY
} = await import('../src/domain/folders/folderGrid.js');
const { getState, hydrateStore, setState } = await import('../src/state/appStore.js');

test('folders reserve a cell and own bookmarks without reserving their old cells', async () => {
  await hydrateStore();
  await setState({
    data: {
      bookmarks: [{
        id: 'bookmark', name: 'Bookmark', groupId: null, folderId: null,
        gx: 0, gy: 0, w: 1, h: 1
      }],
      folders: [],
      settings: { ...getState().data.settings, showRecycleBin: false }
    }
  });

  const folder = createBookmarkFolder('Reading', { columns: 2, rows: 1 });
  assert.deepEqual({ gx: folder.gx, gy: folder.gy }, { gx: 1, gy: 0 });

  assert.equal(addBookmarkToFolder('bookmark', folder.id)?.folderId, folder.id);
  assert.equal(getState().data.bookmarks[0].folderId, folder.id);

  const result = removeBookmarkFromFolder('bookmark', { columns: 2, rows: 1 });
  assert.equal(result.reason, null);
  assert.equal(result.bookmark.folderId, null);
  assert.deepEqual(
    { gx: result.bookmark.gx, gy: result.bookmark.gy },
    { gx: 0, gy: 0 }
  );
});

test('deleting a folder deletes its contained bookmarks atomically', () => {
  const folder = getState().data.folders[0];
  addBookmarkToFolder('bookmark', folder.id);

  const result = deleteBookmarkFolder(folder.id);
  assert.deepEqual(result, { deleted: true, bookmarkCount: 1 });
  assert.deepEqual(getState().data.folders, []);
  assert.deepEqual(getState().data.bookmarks, []);
});

test('folder creation and renaming share the same name length limit', async () => {
  await setState({ data: { bookmarks: [], folders: [] } });
  const created = createBookmarkFolder('a'.repeat(75), { columns: 1, rows: 1 });
  assert.equal(created.name.length, BOOKMARK_FOLDER_NAME_MAX_LENGTH);

  const renamed = renameBookmarkFolder(created.id, 'b'.repeat(80));
  assert.equal(renamed.name.length, BOOKMARK_FOLDER_NAME_MAX_LENGTH);
  assert.equal(getState().data.folders[0].name, renamed.name);
});

test('creates legacy-safe folder styles and updates their appearance', async () => {
  await setState({ data: { bookmarks: [], folders: [] } });
  const created = createBookmarkFolder('Personal', { columns: 1, rows: 1 });

  assert.deepEqual({
    noBackground: created.noBackground,
    backgroundColor: created.backgroundColor,
    backgroundImageUrl: created.backgroundImageUrl,
    backgroundImageUrlLocked: created.backgroundImageUrlLocked,
    textColor: created.textColor
  }, {
    noBackground: false,
    backgroundColor: '#38bdf8',
    backgroundImageUrl: null,
    backgroundImageUrlLocked: false,
    textColor: '#f8fafc'
  });

  const updated = updateBookmarkFolder(created.id, {
    name: 'Games',
    noBackground: true,
    backgroundColor: '#ff3366',
    backgroundImageUrl: 'https://images.test/folder.png',
    backgroundImageUrlLocked: true,
    textColor: '#ffeeaa'
  });

  assert.equal(updated.name, 'Games');
  assert.equal(updated.noBackground, true);
  assert.equal(updated.backgroundColor, '#ff3366');
  assert.equal(updated.backgroundImageUrl, 'https://images.test/folder.png');
  assert.equal(updated.backgroundImageUrlLocked, true);
  assert.equal(updated.textColor, '#ffeeaa');
});

test('creates a folder with a normalized custom appearance', async () => {
  await setState({ data: { bookmarks: [], folders: [] } });
  const created = createBookmarkFolder('Styled', { columns: 1, rows: 1 }, {
    backgroundColor: '#EF4444',
    outerBackgroundColor: '#111827',
    textColor: '#FEF3C7',
    showPreviews: false,
    showCount: false
  });

  assert.equal(created.backgroundColor, '#ef4444');
  assert.equal(created.outerBackgroundColor, '#111827');
  assert.equal(created.textColor, '#fef3c7');
  assert.equal(created.showPreviews, false);
  assert.equal(created.showCount, false);
});

test('updates bookmark and folder rectangles atomically', async () => {
  await setState({
    data: {
      bookmarks: [{
        id: 'grid-bookmark', name: 'Bookmark', groupId: null, folderId: null,
        gx: 0, gy: 0, w: 1, h: 1
      }],
      folders: [{
        id: 'grid-folder', name: 'Folder', groupId: null,
        gx: 1, gy: 0, w: 1, h: 1, createdAt: 1, updatedAt: 1
      }]
    }
  });

  const changed = updateGridItemsByIds(new Map([
    ['grid-bookmark', { gx: 3, gy: 0 }],
    ['grid-folder', { gx: 0, gy: 0, w: 2, h: 2 }]
  ]));

  assert.equal(changed.length, 2);
  assert.deepEqual(
    getState().data.bookmarks.map(({ gx, gy, w, h }) => ({ gx, gy, w, h })),
    [{ gx: 3, gy: 0, w: 1, h: 1 }]
  );
  assert.deepEqual(
    getState().data.folders.map(({ gx, gy, w, h }) => ({ gx, gy, w, h })),
    [{ gx: 0, gy: 0, w: 2, h: 2 }]
  );
});

test('saves folder visibility and outer color while keeping its identity', async () => {
  await setState({ data: { bookmarks: [], folders: [] } });
  const created = createBookmarkFolder('Reading', { columns: 1, rows: 1 });
  const updated = updateBookmarkFolder(created.id, {
    ...created,
    outerBackgroundColor: '#AA2244',
    showFolder: false,
    showPreviews: true,
    showName: false,
    showCount: false
  });
  assert.equal(updated.id, created.id);
  assert.equal(updated.name, 'Reading');
  assert.equal(updated.outerBackgroundColor, '#aa2244');
  assert.equal(updated.showFolder, false);
  assert.equal(updated.showPreviews, false);
  assert.equal(updated.showName, false);
  assert.equal(updated.showCount, false);
  assert.deepEqual(getState().data.folders[0], updated);

  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(storedData.folders[0], updated);

  const restored = updateBookmarkFolder(created.id, {
    ...updated,
    outerBackgroundColor: null,
    showFolder: true,
    showPreviews: true,
    showName: true,
    showCount: true
  });
  assert.equal(restored.outerBackgroundColor, null);
  assert.equal(restored.showFolder, true);
  assert.equal(restored.showPreviews, true);
  assert.equal(restored.showName, true);
  assert.equal(restored.showCount, true);
});

test('keeps a bookmark inside when the grid has no room to remove it', async () => {
  await setState({
    data: {
      bookmarks: [{
        id: 'contained', name: 'Contained', groupId: null, folderId: 'full',
        gx: 0, gy: 0, w: 1, h: 1
      }],
      folders: [{
        id: 'full', name: 'Full', groupId: null,
        gx: 0, gy: 0, w: 1, h: 1, createdAt: 1, updatedAt: 1
      }]
    }
  });

  const result = removeBookmarkFromFolder('contained', { columns: 1, rows: 1 });
  assert.equal(result.reason, 'no-space');
  assert.equal(getState().data.bookmarks[0].folderId, 'full');
});

test('normalizes legacy folder positions into a stable 6 by 3 layout', () => {
  const layout = createFolderBookmarkLayout([
    { id: 'kept', gx: 2, gy: 1 },
    { id: 'collision', gx: 2, gy: 1 },
    { id: 'outside', gx: 11, gy: 5 }
  ]);

  assert.deepEqual(layout.get('kept'), { gx: 2, gy: 1 });
  assert.deepEqual(layout.get('collision'), { gx: 0, gy: 0 });
  assert.deepEqual(layout.get('outside'), { gx: 1, gy: 0 });
});

test('keeps legacy folder overflow accessible below the visible 18 cells', () => {
  const bookmarks = Array.from({ length: FOLDER_GRID_CAPACITY + 1 }, (_, index) => ({
    id: `legacy-${index}`,
    gx: index % 6,
    gy: Math.floor(index / 6)
  }));
  const layout = createFolderBookmarkLayout(bookmarks);

  assert.equal(layout.size, FOLDER_GRID_CAPACITY + 1);
  assert.deepEqual(layout.get(`legacy-${FOLDER_GRID_CAPACITY}`), { gx: 0, gy: 3 });
});

test('commits folder bookmark positions without changing their saved size', async () => {
  await setState({
    data: {
      bookmarks: [
        { id: 'first', name: 'First', folderId: 'folder', groupId: null, gx: 0, gy: 0, w: 2, h: 1 },
        { id: 'second', name: 'Second', folderId: 'folder', groupId: null, gx: 1, gy: 0, w: 1, h: 2 }
      ],
      folders: [{ id: 'folder', name: 'Folder', groupId: null, gx: 0, gy: 0, w: 1, h: 1 }]
    }
  });

  const swap = updateFolderBookmarkPositions('folder', [
    { id: 'first', gx: 1, gy: 0 },
    { id: 'second', gx: 0, gy: 0 }
  ]);
  assert.equal(swap.length, 2);
  assert.deepEqual(
    getState().data.bookmarks.map(({ id, gx, gy, w, h }) => ({ id, gx, gy, w, h })),
    [
      { id: 'first', gx: 1, gy: 0, w: 2, h: 1 },
      { id: 'second', gx: 0, gy: 0, w: 1, h: 2 }
    ]
  );

  const move = updateFolderBookmarkPositions('folder', [
    { id: 'first', gx: 5, gy: 2 }
  ]);
  assert.equal(move.length, 1);
  const moved = getState().data.bookmarks.find(bookmark => bookmark.id === 'first');
  assert.deepEqual({ gx: moved.gx, gy: moved.gy, w: moved.w, h: moved.h }, {
    gx: 5, gy: 2, w: 2, h: 1
  });
});

test('commits a multi-bookmark folder sequence in one validated layout', async () => {
  await setState({
    data: {
      bookmarks: [0, 1, 2].map(index => ({
        id: `sequence-${index}`,
        name: `Sequence ${index}`,
        folderId: 'folder',
        groupId: null,
        gx: index,
        gy: 0,
        w: 1,
        h: 1
      })),
      folders: [{ id: 'folder', name: 'Folder', groupId: null, gx: 0, gy: 0, w: 1, h: 1 }]
    }
  });

  const changed = updateFolderBookmarkPositions('folder', [
    { id: 'sequence-0', gx: 2, gy: 0 },
    { id: 'sequence-1', gx: 0, gy: 0 },
    { id: 'sequence-2', gx: 1, gy: 0 }
  ]);
  assert.equal(changed.length, 3);
  assert.deepEqual(
    getState().data.bookmarks.map(({ id, gx, gy }) => ({ id, gx, gy })),
    [
      { id: 'sequence-0', gx: 2, gy: 0 },
      { id: 'sequence-1', gx: 0, gy: 0 },
      { id: 'sequence-2', gx: 1, gy: 0 }
    ]
  );

  assert.deepEqual(updateFolderBookmarkPositions('folder', [
    { id: 'sequence-0', gx: 1, gy: 0 }
  ]), []);
});

test('does not add more than 18 bookmarks to one folder', async () => {
  const contents = Array.from({ length: FOLDER_GRID_CAPACITY }, (_, index) => ({
    id: `inside-${index}`,
    name: `Inside ${index}`,
    folderId: 'folder',
    groupId: null,
    gx: index % 6,
    gy: Math.floor(index / 6),
    w: 1,
    h: 1
  }));
  await setState({
    data: {
      bookmarks: [
        ...contents,
        { id: 'outside', name: 'Outside', folderId: null, groupId: null, gx: 8, gy: 0, w: 1, h: 1 }
      ],
      folders: [{ id: 'folder', name: 'Folder', groupId: null, gx: 0, gy: 0, w: 1, h: 1 }]
    }
  });

  assert.equal(addBookmarkToFolder('outside', 'folder'), null);
  assert.equal(
    getState().data.bookmarks.find(bookmark => bookmark.id === 'outside').folderId,
    null
  );
});
