import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.chrome = {
  runtime: { getManifest: () => ({ version: '0.19.0' }) }
};

const {
  createCollectionTrashEntries,
  RECYCLE_BIN_RETENTION_MS,
  removeExpiredTrashEntries,
  restoreTrashEntriesInData
} = await import('../src/domain/recycle-bin/recycleBinEntries.js');

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

function data(values = {}) {
  return {
    bookmarks: [],
    folders: [],
    trash: [],
    recycleBin: { id: 'bin', gx: 11, gy: 5, w: 1, h: 1 },
    settings: { bookmarkGroups: [], showRecycleBin: true },
    ...values
  };
}

test('creates detached folder and bookmark entries with injected identities', () => {
  const sourceFolder = folder('folder');
  const child = bookmark('child', { folderId: sourceFolder.id });
  const topLevel = bookmark('top-level');
  const ids = ['trash-folder', 'trash-bookmark'];

  const entries = createCollectionTrashEntries(
    [child, topLevel],
    [sourceFolder],
    { deletedAt: 42, createId: () => ids.shift() }
  );

  assert.deepEqual(entries.map(entry => [entry.id, entry.type]), [
    ['trash-folder', 'folder'],
    ['trash-bookmark', 'bookmark']
  ]);
  assert.deepEqual(entries[0].bookmarks.map(item => item.id), ['child']);
  sourceFolder.name = 'changed';
  child.name = 'changed';
  assert.equal(entries[0].folder.name, 'folder');
  assert.equal(entries[0].bookmarks[0].name, 'child');
});

test('filters expired entries without mutating the persisted collection', () => {
  const now = 1_000_000_000;
  const trash = [
    { id: 'expired', deletedAt: now - RECYCLE_BIN_RETENTION_MS },
    { id: 'fresh', deletedAt: now - RECYCLE_BIN_RETENTION_MS + 1 }
  ];

  const result = removeExpiredTrashEntries(trash, now);

  assert.deepEqual(result.trash.map(entry => entry.id), ['fresh']);
  assert.equal(result.removed, 1);
  assert.equal(trash.length, 2);
});

test('restores into a new snapshot and resolves identity and cell collisions', () => {
  const current = bookmark('same-id');
  const deleted = bookmark('same-id');
  const source = data({
    bookmarks: [current],
    trash: [{
      id: 'trash-id',
      type: 'bookmark',
      deletedAt: 1,
      bookmark: deleted
    }]
  });

  const result = restoreTrashEntriesInData(source, ['trash-id'], {
    now: () => 99,
    createId: () => 'replacement-id'
  });

  assert.deepEqual(
    result.bookmarks.map(({ id, gx, gy, updatedAt }) => ({ id, gx, gy, updatedAt })),
    [
      { id: 'same-id', gx: 0, gy: 0, updatedAt: 1 },
      { id: 'replacement-id', gx: 0, gy: 1, updatedAt: 99 }
    ]
  );
  assert.deepEqual({ restored: result.restored, skipped: result.skipped }, {
    restored: 1,
    skipped: 0
  });
  assert.deepEqual(result.trash, []);
  assert.equal(source.bookmarks.length, 1);
  assert.equal(source.trash.length, 1);
});
