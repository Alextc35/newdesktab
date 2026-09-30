import assert from 'node:assert/strict';
import test from 'node:test';

const storageChangeListeners = [];

function selectValues(data, keys) {
  if (keys === null || keys === undefined) return structuredClone(data);

  const requested = Array.isArray(keys) ? keys : [keys];
  return Object.fromEntries(
    requested
      .filter(key => Object.hasOwn(data, key))
      .map(key => [key, structuredClone(data[key])])
  );
}

function getStorageBytes(items) {
  const encoder = new TextEncoder();
  return Object.entries(items).reduce((total, [key, value]) => (
    total + encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length
  ), 0);
}

function createStorageArea(areaName) {
  const data = {};

  return {
    data,
    QUOTA_BYTES: areaName === 'sync' ? 102400 : 10485760,

    get(keys, callback) {
      callback(selectValues(data, keys));
    },

    getBytesInUse(keys, callback) {
      callback(getStorageBytes(selectValues(data, keys)));
    },

    set(items, callback) {
      const changes = {};

      for (const [key, value] of Object.entries(items)) {
        changes[key] = {
          oldValue: data[key],
          newValue: structuredClone(value)
        };
        data[key] = structuredClone(value);
      }

      callback();
      for (const listener of storageChangeListeners) listener(changes, areaName);
    },

    remove(keys, callback) {
      const changes = {};

      for (const key of (Array.isArray(keys) ? keys : [keys])) {
        if (!Object.hasOwn(data, key)) continue;
        changes[key] = { oldValue: data[key] };
        delete data[key];
      }

      callback();
      for (const listener of storageChangeListeners) listener(changes, areaName);
    }
  };
}

globalThis.chrome = {
  runtime: { lastError: null, getManifest: () => ({ version: '0.13.0' }) },
  storage: {
    local: createStorageArea('local'),
    sync: createStorageArea('sync'),
    onChanged: {
      addListener(listener) {
        storageChangeListeners.push(listener);
      }
    }
  }
};

const { storage, STORAGE_MODES } = await import(
  '../src/platform/storage/storageFacade.js'
);
const { DATA_SCHEMA_VERSION } = await import('../src/platform/storage/schemaVersion.js');
const { DEVICE_TRASH_KEY } = await import(
  '../src/platform/storage/deviceTrashStorage.js'
);
const { DEVICE_IMAGE_SELECTIONS_KEY } = await import(
  '../src/platform/storage/deviceImageSelections.js'
);
const { DEVICE_WALLPAPERS_KEY } = await import(
  '../src/platform/storage/deviceWallpapers.js'
);

const SETTINGS = {
  language: 'es',
  keyboardShortcuts: {
    toggleEditing: 'Ctrl+Shift+E',
    addBookmark: 'Ctrl+Shift+B',
    addFolder: 'Ctrl+Shift+F',
    openWidgets: 'W',
    openSettings: 'Ctrl+Shift+S'
  },
  theme: {
    backgroundDefault: false,
    backgroundColor: '#123456',
    backgroundImageUrl: null,
    backgroundImageUrlLocked: false
  },
  bookmarkDefault: {
    name: 'Default',
    url: 'https://example.com'
  }
};

const LOCAL_DATA = {
  bookmarks: [{
    id: 'local', name: 'Local bookmark', url: 'https://local.test', folderId: 'saved'
  }],
  folders: [{ id: 'saved', name: 'Saved', gx: 0, gy: 0, w: 1, h: 1 }],
  widgets: [{
    id: 'clock', type: 'clock', version: 1,
    gx: 2, gy: 0, w: 2, h: 1, groupId: null,
    config: { timezone: 'UTC' }, createdAt: 10, updatedAt: 10
  }],
  settings: SETTINGS
};

function assertBreakdownMatchesUsage(usage) {
  const { systemBytes, bookmarkBytes, trashBytes } = usage.breakdown;
  assert.equal(systemBytes + bookmarkBytes + trashBytes, usage.usedBytes);
  assert.ok(systemBytes >= 0);
  assert.ok(bookmarkBytes >= 0);
  assert.ok(trashBytes >= 0);
}

test('reports used, total, and available bytes for both storage areas', async () => {
  const local = await storage.getUsage(STORAGE_MODES.LOCAL);
  const sync = await storage.getUsage(STORAGE_MODES.SYNC);

  assert.equal(local.mode, STORAGE_MODES.LOCAL);
  assert.equal(local.quotaBytes, 10485760);
  assert.equal(local.availableBytes, local.quotaBytes - local.usedBytes);
  assert.ok(local.usedBytes >= 0);
  assertBreakdownMatchesUsage(local);
  assert.deepEqual(local.localBreakdown, {
    localSystemBytes: 0,
    syncSystemBytes: 0,
    syncBookmarkBytes: 0,
    trashBytes: 0
  });

  assert.equal(sync.mode, STORAGE_MODES.SYNC);
  assert.equal(sync.quotaBytes, 102400);
  assert.equal(sync.availableBytes, sync.quotaBytes - sync.usedBytes);
  assert.ok(sync.usedBytes >= 0);
  assertBreakdownMatchesUsage(sync);

  await assert.rejects(storage.getUsage('session'), /Unsupported storage mode/);
});

test('reports exact local data and image categories', async () => {
  const localData = chrome.storage.local.data;
  const previous = structuredClone(localData);
  const imageKeys = {
    theme: 'newdesktabLocalImage:theme-image',
    bookmark: 'newdesktabLocalImage:bookmark-image',
    folder: 'newdesktabLocalImage:folder-image',
    trash: 'newdesktabLocalImage:trash-image',
    other: 'newdesktabLocalImage:orphan-image'
  };

  for (const key of Object.keys(localData)) delete localData[key];
  Object.assign(localData, {
    settings: SETTINGS,
    bookmarks: [{ id: 'bookmark', name: 'Bookmark' }],
    folders: [{ id: 'folder', name: 'Folder' }],
    trash: [{ id: 'deleted', type: 'bookmark', bookmark: { id: 'deleted-bookmark' } }],
    [DEVICE_IMAGE_SELECTIONS_KEY]: {
      theme: { reference: 'newdesktab-local-image:theme-image', source: 'local' },
      'bookmark:bookmark': {
        reference: 'newdesktab-local-image:bookmark-image', source: 'local'
      },
      'folder:folder': { reference: 'newdesktab-local-image:folder-image', source: 'local' },
      'trash:deleted:bookmark:deleted-bookmark': {
        reference: 'newdesktab-local-image:trash-image', source: 'local'
      }
    },
    [imageKeys.theme]: { dataUrl: 'data:image/webp;base64,dGhlbWU=', name: 'theme.webp' },
    [imageKeys.bookmark]: { dataUrl: 'data:image/gif;base64,Ym9va21hcms=', name: 'bookmark.gif' },
    [imageKeys.folder]: { dataUrl: 'data:image/webp;base64,Zm9sZGVy', name: 'folder.webp' },
    [imageKeys.trash]: { dataUrl: 'data:image/gif;base64,dHJhc2g=', name: 'trash.gif' },
    [imageKeys.other]: { dataUrl: 'data:image/webp;base64,b3RoZXI=', name: 'other.webp' }
  });

  try {
    const usage = await storage.getUsage(STORAGE_MODES.LOCAL);
    const imageBreakdown = usage.imageBreakdown;

    assertBreakdownMatchesUsage(usage);
    assert.equal(imageBreakdown.themeBytes, getStorageBytes({
      [imageKeys.theme]: localData[imageKeys.theme]
    }));
    assert.equal(imageBreakdown.bookmarkBytes, getStorageBytes({
      [imageKeys.bookmark]: localData[imageKeys.bookmark]
    }));
    assert.equal(imageBreakdown.folderBytes, getStorageBytes({
      [imageKeys.folder]: localData[imageKeys.folder]
    }));
    assert.equal(imageBreakdown.trashBytes, getStorageBytes({
      [imageKeys.trash]: localData[imageKeys.trash]
    }));
    assert.equal(imageBreakdown.otherBytes, getStorageBytes({
      [imageKeys.other]: localData[imageKeys.other]
    }));
    assert.equal(
      imageBreakdown.themeBytes
        + imageBreakdown.bookmarkBytes
        + imageBreakdown.folderBytes
        + imageBreakdown.trashBytes
        + imageBreakdown.otherBytes,
      imageBreakdown.totalBytes
    );
    assert.equal(
      usage.breakdown.bookmarkBytes,
      getStorageBytes({
        bookmarks: localData.bookmarks,
        folders: localData.folders,
        [imageKeys.bookmark]: localData[imageKeys.bookmark],
        [imageKeys.folder]: localData[imageKeys.folder]
      })
    );
    assert.equal(
      usage.breakdown.trashBytes,
      getStorageBytes({
        trash: localData.trash,
        [imageKeys.trash]: localData[imageKeys.trash]
      })
    );
  } finally {
    for (const key of Object.keys(localData)) delete localData[key];
    Object.assign(localData, previous);
  }
});

test('counts personal wallpaper images as theme storage without a synced selection slot', async () => {
  const localData = chrome.storage.local.data;
  const previous = structuredClone(localData);
  const reference = 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
  const key = 'newdesktabLocalImage:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
  for (const entry of Object.keys(localData)) delete localData[entry];
  Object.assign(localData, {
    [key]: { dataUrl: 'data:image/webp;base64,dGVzdA==', name: 'own.webp' },
    [DEVICE_WALLPAPERS_KEY]: { media: [{ id: 'own', type: 'image',
      backgroundImageLocal: reference }], rotationSeconds: 30 }
  });
  try {
    const usage = await storage.getUsage(STORAGE_MODES.LOCAL);
    assert.equal(usage.imageBreakdown.themeBytes, getStorageBytes({ [key]: localData[key] }));
  } finally {
    for (const entry of Object.keys(localData)) delete localData[entry];
    Object.assign(localData, previous);
  }
});

test('migrates local data to an empty synchronized area', async () => {
  await storage.initialize();
  await storage.set(LOCAL_DATA);

  const result = await storage.changeMode(STORAGE_MODES.SYNC, LOCAL_DATA);

  assert.equal(result.source, 'migrated');
  assert.equal(storage.getMode(), STORAGE_MODES.SYNC);
  const stored = await storage.get(null);
  assert.equal(stored.schemaVersion, DATA_SCHEMA_VERSION);
  assert.equal(stored.bookmarks[0].id, 'local');
  assert.equal(stored.bookmarks[0].name, 'Local bookmark');
  assert.equal(stored.bookmarks[0].folderId, 'saved');
  assert.equal(stored.folders[0].name, 'Saved');
  assert.equal(stored.widgets[0].type, 'clock');
  assert.equal(stored.widgets[0].config.timezone, 'UTC');
  assert.deepEqual(stored.settings.keyboardShortcuts, SETTINGS.keyboardShortcuts);
  assert.deepEqual(stored.settings.bookmarkDefault, {
    backgroundImageUrl: null,
    backgroundImageLocal: null,
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: false,
    backgroundFavicon: true,
    invertColorBg: false,
    noBackground: true,
    backgroundColor: '#000000',
    showText: true,
    textColor: '#ffffff',
    showFavicon: true,
    invertColorIcon: false
  });
  assert.ok(chrome.storage.sync.data.newdesktabSyncMeta);
  assert.equal(chrome.storage.sync.data.bookmarks, undefined);

  const usage = await storage.getUsage(STORAGE_MODES.SYNC);
  assertBreakdownMatchesUsage(usage);
  assert.ok(usage.breakdown.systemBytes > 0);
  assert.ok(usage.breakdown.bookmarkBytes > 0);
  assert.equal(usage.breakdown.trashBytes, 0);

  const localUsage = await storage.getUsage(STORAGE_MODES.LOCAL);
  const localBreakdown = localUsage.localBreakdown;
  assert.ok(localBreakdown.localSystemBytes > 0);
  assert.ok(localBreakdown.syncSystemBytes > 0);
  assert.ok(localBreakdown.syncBookmarkBytes > 0);
  assert.equal(
    Object.values(localBreakdown).reduce((sum, bytes) => sum + bytes, 0),
    localUsage.usedBytes
  );
});

test('does not report a stale local snapshot as synchronized recycle-bin data', async () => {
  const localData = chrome.storage.local.data;
  const previousTrash = structuredClone(localData.trash);
  localData.trash = [{
    id: 'stale-trash',
    type: 'bookmark',
    bookmark: { id: 'stale-bookmark' }
  }];

  try {
    const usage = await storage.getUsage(STORAGE_MODES.LOCAL);
    assert.equal(storage.getMode(), STORAGE_MODES.SYNC);
    assert.equal(usage.breakdown.trashBytes, 0);
    assert.equal(usage.localBreakdown.trashBytes, 0);
    assertBreakdownMatchesUsage(usage);
  } finally {
    localData.trash = previousTrash;
  }
});

test('keeps a local copy when synchronization is disabled', async () => {
  const syncData = await storage.get(null);
  const result = await storage.changeMode(STORAGE_MODES.LOCAL, syncData);

  assert.equal(result.source, 'migrated');
  assert.equal(storage.getMode(), STORAGE_MODES.LOCAL);
  assert.equal((await storage.get(null)).bookmarks[0].id, 'local');
  assert.ok(chrome.storage.sync.data.newdesktabSyncMeta);
  assert.equal(chrome.storage.local.data[DEVICE_TRASH_KEY], undefined);
});

test('uses existing synchronized data instead of overwriting it', async () => {
  await storage.set({
    bookmarks: [{ id: 'different-local' }],
    settings: SETTINGS
  });

  const currentLocal = await storage.get(null);
  const result = await storage.changeMode(STORAGE_MODES.SYNC, currentLocal);

  assert.equal(result.source, 'existing');
  assert.equal(result.data.bookmarks[0].id, 'local');
});

test('adopts and removes recycle-bin contents from a legacy synchronized payload', async () => {
  const current = await storage.get(null);
  const legacyTrash = [{
    id: 'legacy-trash-entry',
    type: 'bookmark',
    deletedAt: Date.now(),
    bookmark: { id: 'legacy-deleted', name: 'Legacy deleted bookmark' }
  }];
  const legacyPayload = {
    ...current,
    schemaVersion: DATA_SCHEMA_VERSION - 1,
    trash: legacyTrash
  };
  const previousMeta = chrome.storage.sync.data.newdesktabSyncMeta;

  await new Promise(resolve => chrome.storage.local.remove(DEVICE_TRASH_KEY, resolve));
  await new Promise(resolve => chrome.storage.sync.set({
    newdesktabSyncMeta: {
      ...previousMeta,
      schemaVersion: DATA_SCHEMA_VERSION - 1,
      chunkCount: 1,
      updatedAt: previousMeta.updatedAt + 1,
      writerDeviceId: 'legacy-device',
      writeId: 'legacy-write'
    },
    'newdesktabSyncChunk:0': JSON.stringify(legacyPayload)
  }, resolve));

  const restored = await storage.get(null);
  const migratedMeta = chrome.storage.sync.data.newdesktabSyncMeta;
  const migratedPayload = JSON.parse(Array.from(
    { length: migratedMeta.chunkCount },
    (_, index) => chrome.storage.sync.data[`newdesktabSyncChunk:${index}`]
  ).join(''));

  assert.equal(restored.trash[0].id, 'legacy-trash-entry');
  assert.equal(migratedMeta.schemaVersion, DATA_SCHEMA_VERSION);
  assert.equal(Object.hasOwn(migratedPayload, 'trash'), false);
  assert.deepEqual(chrome.storage.local.data[DEVICE_TRASH_KEY], restored.trash);
});

test('identifies synchronized writes from this and other devices', async () => {
  const events = [];
  const unsubscribe = storage.subscribe(change => events.push(change));

  await storage.set({
    ...LOCAL_DATA,
    bookmarks: LOCAL_DATA.bookmarks.map(bookmark => ({ ...bookmark, name: 'Updated here' }))
  });

  const ownMeta = chrome.storage.sync.data.newdesktabSyncMeta;
  assert.equal(typeof ownMeta.writerDeviceId, 'string');
  assert.equal(typeof ownMeta.writeId, 'string');
  assert.equal(events.at(-1).areaName, STORAGE_MODES.SYNC);
  assert.equal(events.at(-1).origin, 'same-device');

  chrome.storage.sync.set({
    newdesktabSyncMeta: {
      ...ownMeta,
      updatedAt: ownMeta.updatedAt + 1,
      writerDeviceId: 'another-device',
      writeId: 'another-device-write'
    }
  }, () => {});

  assert.equal(events.at(-1).areaName, STORAGE_MODES.SYNC);
  assert.equal(events.at(-1).origin, 'other-device');
  unsubscribe();
});

test('chunks values safely below Chrome per-item quota', async () => {
  const chunkedData = {
    bookmarks: [{
      id: 'chunked',
      name: '🙂 "quoted" \\ value '.repeat(1000),
      url: 'https://example.com'
    }],
    settings: SETTINGS
  };

  await storage.set(chunkedData);

  const chunkEntries = Object.entries(chrome.storage.sync.data)
    .filter(([key]) => key.startsWith('newdesktabSyncChunk:'));
  const encoder = new TextEncoder();

  assert.ok(chunkEntries.length > 1);
  assert.ok(chunkEntries.every(([key, value]) => (
    encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length < 8192
  )));
  const storedBookmarks = (await storage.get(null)).bookmarks;
  assert.equal(storedBookmarks[0].id, 'chunked');
  assert.equal(storedBookmarks[0].name, chunkedData.bookmarks[0].name.trim());
});

test('keeps recycle-bin contents on this device and out of synchronized storage', async () => {
  const trash = [{
    id: 'trash-entry',
    type: 'bookmark',
    deletedAt: Date.now(),
    bookmark: { ...LOCAL_DATA.bookmarks[0], id: 'deleted' }
  }];
  await storage.set({
    ...LOCAL_DATA,
    trash
  });

  const meta = chrome.storage.sync.data.newdesktabSyncMeta;
  const payload = JSON.parse(Array.from(
    { length: meta.chunkCount },
    (_, index) => chrome.storage.sync.data[`newdesktabSyncChunk:${index}`]
  ).join(''));
  assert.equal(Object.hasOwn(payload, 'trash'), false);
  const restoredTrash = (await storage.get(null)).trash;
  assert.equal(restoredTrash[0].id, trash[0].id);
  assert.equal(restoredTrash[0].bookmark.id, trash[0].bookmark.id);
  assert.deepEqual(chrome.storage.local.data[DEVICE_TRASH_KEY], restoredTrash);

  const syncUsage = await storage.getUsage(STORAGE_MODES.SYNC);
  assertBreakdownMatchesUsage(syncUsage);
  assert.equal(syncUsage.breakdown.trashBytes, 0);

  const localUsage = await storage.getUsage(STORAGE_MODES.LOCAL);
  assertBreakdownMatchesUsage(localUsage);
  assert.ok(localUsage.breakdown.trashBytes > 0);
});

test('rejects synchronized payloads above Chrome quota', async () => {
  const oversized = {
    bookmarks: [{ id: 'huge', name: 'x'.repeat(110000) }],
    settings: SETTINGS
  };

  await assert.rejects(
    storage.set(oversized),
    error => error.code === 'SYNC_QUOTA_EXCEEDED'
  );
});

test('reports and deletes only NewDeskTab synchronized data', async () => {
  chrome.storage.sync.data.unrelatedExtensionValue = 'keep';
  const localBeforeDeletion = structuredClone(chrome.storage.local.data.bookmarks);

  const beforeDelete = await storage.getSyncMetadata();
  assert.equal(beforeDelete.hasData, true);
  assert.equal(Number.isFinite(beforeDelete.updatedAt), true);

  const deleted = await storage.clearSyncData();
  const afterDelete = await storage.getSyncMetadata();

  assert.equal(deleted, true);
  assert.deepEqual(afterDelete, { hasData: false, updatedAt: null });
  assert.equal(chrome.storage.sync.data.unrelatedExtensionValue, 'keep');

  const recovered = await storage.get(null);
  assert.equal(storage.getMode(), STORAGE_MODES.LOCAL);
  assert.deepEqual(recovered.bookmarks, localBeforeDeletion);
  assert.equal(chrome.storage.local.data.newdesktabStorageMode, STORAGE_MODES.LOCAL);
});

test('follows storage-mode changes made by another open tab', async () => {
  let notifications = 0;
  const unsubscribe = storage.subscribe(() => { notifications += 1; });

  chrome.storage.local.set({ newdesktabStorageMode: STORAGE_MODES.LOCAL }, () => {});

  assert.equal(storage.getMode(), STORAGE_MODES.LOCAL);
  assert.equal(notifications, 1);
  unsubscribe();
});

test('falls back to compatible local data when sync was written by a newer version', async () => {
  await storage.set(LOCAL_DATA);
  const futureSchemaVersion = DATA_SCHEMA_VERSION + 1;
  const futureSyncData = {
    schemaVersion: futureSchemaVersion,
    bookmarks: [{ id: 'future', name: 'Future bookmark' }],
    folders: [],
    settings: SETTINGS
  };

  chrome.storage.sync.set(futureSyncData, () => {});
  chrome.storage.local.set({ newdesktabStorageMode: STORAGE_MODES.SYNC }, () => {});

  const recovered = await storage.get(null);
  const compatibility = storage.getSyncCompatibility();

  assert.equal(storage.getMode(), STORAGE_MODES.LOCAL);
  assert.equal(recovered.bookmarks[0].id, 'local');
  assert.equal(compatibility.reason, 'newer-sync-data');
  assert.equal(compatibility.requiredSchemaVersion, futureSchemaVersion);
  assert.equal(compatibility.supportedSchemaVersion, DATA_SCHEMA_VERSION);
  assert.equal(chrome.storage.local.data.newdesktabStorageMode, STORAGE_MODES.LOCAL);
  assert.equal(chrome.storage.sync.data.schemaVersion, futureSchemaVersion);
  assert.equal(chrome.storage.sync.data.bookmarks[0].id, 'future');

  await assert.rejects(
    storage.changeMode(STORAGE_MODES.SYNC, recovered),
    error => error.code === 'SYNC_REQUIRES_NEWER_VERSION'
  );

  await storage.clearSyncData();
  assert.equal(storage.getSyncCompatibility(), null);
});
