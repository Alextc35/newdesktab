import assert from 'node:assert/strict';
import test from 'node:test';

const storedData = {};
const createArea = () => ({
  QUOTA_BYTES: 102400,
  get(keys, callback) {
    const requested = keys === null ? Object.keys(storedData) : (Array.isArray(keys) ? keys : [keys]);
    callback(Object.fromEntries(requested
      .filter(key => Object.hasOwn(storedData, key))
      .map(key => [key, structuredClone(storedData[key])])));
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
    getManifest: () => ({ version: '0.15.0' })
  },
  storage: {
    local: createArea(),
    sync: createArea(),
    onChanged: { addListener() {} }
  }
};

const { DEFAULT_BOOKMARKS } = await import('../src/js/domain/bookmarks/bookmarkDefaults.js');
const { DEFAULT_RECYCLE_BIN } = await import('../src/js/domain/recycle-bin/recycleBinDefaults.js');
const { DEFAULT_SETTINGS } = await import('../src/js/domain/settings/settingsDefaults.js');
const { getGridItemsInGroup } = await import('../src/js/features/grid/gridSelectors.js');
const {
  moveBookmarksToRecycleBin,
  moveFolderToRecycleBin,
  permanentlyDeleteTrashEntries,
  purgeExpiredRecycleBinEntries,
  ensureRecycleBinPosition,
  restoreTrashEntries,
  updateRecycleBinAppearance
} = await import('../src/js/features/recycle-bin/recycleBinActions.js');
const { RECYCLE_BIN_RETENTION_MS } = await import(
  '../src/js/domain/recycle-bin/recycleBinEntries.js'
);
const {
  clearBookmarkHistory,
  getState,
  hydrateStore,
  setState,
  undoBookmarks,
  waitForPersistence
} = await import('../src/js/core/store.js');

await hydrateStore();

function bookmark(id, values = {}) {
  return {
    id,
    name: id,
    url: `https://${id}.test`,
    gx: 0,
    gy: 0,
    w: 1,
    h: 1,
    groupId: null,
    folderId: null,
    createdAt: 1,
    updatedAt: 1,
    ...values
  };
}

function folder(id, values = {}) {
  return {
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

async function resetData(values = {}) {
  clearBookmarkHistory();
  await setState({
    data: {
      bookmarks: [],
      folders: [],
      trash: [],
      recycleBin: structuredClone(DEFAULT_RECYCLE_BIN),
      settings: structuredClone(DEFAULT_SETTINGS),
      ...values
    }
  }, { recordHistory: false });
}

test('bookmarks pass through the recycle bin and can be restored', async () => {
  await resetData({ bookmarks: [bookmark('saved', { gx: 2, gy: 1 })] });
  assert.equal(moveBookmarksToRecycleBin(['saved']), 1);
  assert.equal(getState().data.bookmarks.length, 0);
  assert.equal(getState().data.trash[0].bookmark.id, 'saved');

  const result = restoreTrashEntries([getState().data.trash[0].id]);
  assert.deepEqual(result, { restored: 1, skipped: 0 });
  assert.equal(getState().data.trash.length, 0);
  assert.deepEqual(
    getState().data.bookmarks.map(({ id, gx, gy }) => ({ id, gx, gy })),
    [{ id: 'saved', gx: 2, gy: 1 }]
  );
  await waitForPersistence();
});

test('folders retain all contents as one restorable entry', async () => {
  const sourceFolder = folder('collection');
  const children = [
    bookmark('first', { folderId: sourceFolder.id }),
    bookmark('second', { folderId: sourceFolder.id, gx: 1 })
  ];
  await resetData({ folders: [sourceFolder], bookmarks: children });

  assert.deepEqual(moveFolderToRecycleBin(sourceFolder.id), {
    deleted: true,
    bookmarkCount: 2
  });
  assert.equal(getState().data.folders.length, 0);
  assert.equal(getState().data.trash[0].bookmarks.length, 2);

  const entryId = getState().data.trash[0].id;
  assert.deepEqual(restoreTrashEntries([entryId]), { restored: 1, skipped: 0 });
  assert.equal(getState().data.folders[0].id, sourceFolder.id);
  assert.deepEqual(
    getState().data.bookmarks.map(item => item.folderId),
    [sourceFolder.id, sourceFolder.id]
  );
  await waitForPersistence();
});

test('expired entries are purged and manual deletion is permanent', async () => {
  await resetData({
    trash: [
      { id: 'expired', type: 'bookmark', deletedAt: Date.now() - RECYCLE_BIN_RETENTION_MS, bookmark: bookmark('old') },
      { id: 'fresh', type: 'bookmark', deletedAt: Date.now(), bookmark: bookmark('new') }
    ]
  });

  assert.equal(purgeExpiredRecycleBinEntries(), 1);
  assert.deepEqual(getState().data.trash.map(entry => entry.id), ['fresh']);
  assert.equal(permanentlyDeleteTrashEntries(['fresh']), 1);
  assert.equal(getState().data.trash.length, 0);
  assert.equal(await undoBookmarks(), false);
  await waitForPersistence();
});

test('the recycle bin reserves space only when visible on Main', async () => {
  await resetData();
  assert.equal(getGridItemsInGroup(getState().data, null).at(-1).id, DEFAULT_RECYCLE_BIN.id);
  assert.equal(getGridItemsInGroup(getState().data, 'workspace').length, 0);

  await setState({
    data: {
      settings: { ...getState().data.settings, showRecycleBin: false }
    }
  });
  assert.equal(getGridItemsInGroup(getState().data, null).length, 0);
});

test('new installations start with the recycle bin and no starter bookmarks', async () => {
  assert.deepEqual(
    { gx: DEFAULT_RECYCLE_BIN.gx, gy: DEFAULT_RECYCLE_BIN.gy },
    { gx: 0, gy: 0 }
  );
  assert.deepEqual(DEFAULT_BOOKMARKS, []);
});

test('showing the recycle bin again finds the first available grid slot', async () => {
  await resetData({
    bookmarks: [
      bookmark('top', { gx: 0, gy: 0 }),
      bookmark('below', { gx: 0, gy: 1 })
    ],
    settings: { ...DEFAULT_SETTINGS, showRecycleBin: true }
  });

  assert.equal(ensureRecycleBinPosition(), true);
  assert.deepEqual(
    (({ gx, gy }) => ({ gx, gy }))(getState().data.recycleBin),
    { gx: 0, gy: 2 }
  );
  await waitForPersistence();
});

test('updates recycle bin appearance and visibility together', async () => {
  await resetData();

  await updateRecycleBinAppearance({
    noBackground: true,
    backgroundColor: '#663399',
    backgroundImageUrl: 'https://images.test/bin.png',
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: true,
    iconColor: '#FFAA00',
    textColor: '#FFFFFF',
    showIcon: false,
    showName: true,
    showCount: false,
    showRecycleBin: false
  });

  const { recycleBin, settings } = getState().data;
  assert.deepEqual(
    (({
      noBackground, backgroundColor, backgroundImageUrl, backgroundImageSource,
      backgroundImageUrlLocked, iconColor, textColor, showIcon, showName, showCount
    }) => (
      {
        noBackground, backgroundColor, backgroundImageUrl, backgroundImageSource,
        backgroundImageUrlLocked, iconColor, textColor, showIcon, showName, showCount
      }
    ))(recycleBin),
    {
      noBackground: true,
      backgroundColor: '#663399',
      backgroundImageUrl: 'https://images.test/bin.png',
      backgroundImageSource: 'url',
      backgroundImageUrlLocked: true,
      iconColor: '#ffaa00',
      textColor: '#ffffff',
      showIcon: false,
      showName: true,
      showCount: false
    }
  );
  assert.equal(settings.showRecycleBin, false);
  await waitForPersistence();
});
