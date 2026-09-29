import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBackupEnvelope,
  createBookmarksEnvelope,
  migratePersistedData,
  parseBackupPayload,
  parseBookmarksPayload
} from '../src/platform/storage/dataSchema.js';
import { DEFAULT_FOLDER_STYLE } from '../src/domain/folders/folderDefaults.js';
import { DEFAULT_SETTINGS } from '../src/domain/settings/settingsDefaults.js';
import { DATA_SCHEMA_VERSION } from '../src/platform/storage/schemaVersion.js';
import { BOOKMARK_DRAG_MODES } from '../src/domain/settings/gridInteractionModes.js';
import { DEFAULT_KEYBOARD_SHORTCUTS } from '../src/shared/keyboard/keyboardShortcuts.js';

test('migrates schema 8 folders without changing their saved appearance', () => {
  const savedStyle = {
    noBackground: true,
    backgroundColor: '#ff3366',
    backgroundImageUrl: 'https://images.test/folder.png',
    backgroundImageUrlLocked: true,
    textColor: '#ffeeaa'
  };
  const migrated = migratePersistedData({
    schemaVersion: 8,
    bookmarks: [],
    folders: [{ id: 'legacy', name: 'Legacy', ...savedStyle }]
  });
  const folder = migrated.folders[0];
  assert.equal(migrated.schemaVersion, DATA_SCHEMA_VERSION);
  for (const [key, value] of Object.entries({
    ...DEFAULT_FOLDER_STYLE, ...savedStyle, noOuterBackground: false, showCount: true
  })) {
    assert.equal(folder[key], value);
  }
  assert.deepEqual(migratePersistedData(migrated), migrated);
});

test('preserves folder controls across backup and bookmarks-only exports', () => {
  const data = migratePersistedData({
    bookmarks: [{ id: 'saved', name: 'Saved', folderId: 'custom' }],
    folders: [{
      id: 'custom', name: 'Custom', outerBackgroundColor: '#ABCDEF',
      noOuterBackground: true,
      showFolder: false, showPreviews: true, showName: false, showCount: false
    }]
  });
  const folder = data.folders[0];
  assert.equal(folder.outerBackgroundColor, '#abcdef');
  assert.equal(folder.noOuterBackground, true);
  assert.equal(folder.showFolder, false);
  assert.equal(folder.showPreviews, false);
  assert.equal(folder.showName, false);
  assert.equal(folder.showCount, false);
  assert.deepEqual(parseBackupPayload(createBackupEnvelope(data)), data);
  assert.deepEqual(
    parseBookmarksPayload(createBookmarksEnvelope(data.bookmarks, data.folders), data),
    { bookmarks: data.bookmarks, folders: data.folders }
  );
});

test('separates legacy local images from URLs across themes, bookmarks, folders and presets', () => {
  const reference = 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
  const legacyStyle = { backgroundImageUrl: reference, backgroundImageUrlLocked: true };
  const migrated = migratePersistedData({
    schemaVersion: 4,
    bookmarks: [{ id: 'one', name: 'One', ...legacyStyle }],
    folders: [{ id: 'folder', name: 'Folder', ...legacyStyle }],
    settings: {
      theme: legacyStyle,
      bookmarkDefault: legacyStyle,
      bookmarkPresets: [{ id: 'preset', name: 'Preset', style: legacyStyle }]
    }
  });

  for (const style of [
    migrated.bookmarks[0], migrated.folders[0], migrated.settings.theme,
    migrated.settings.bookmarkDefault, migrated.settings.bookmarkPresets[0].style
  ]) {
    assert.equal(style.backgroundImageLocal, reference);
    assert.equal(style.backgroundImageUrl, null);
    assert.equal(style.backgroundImageUrlLocked, false);
    style.backgroundImageUrl = 'https://images.test/fallback.gif';
    style.backgroundImageUrlLocked = true;
  }

  assert.deepEqual(migratePersistedData(migrated), migrated);
  assert.deepEqual(parseBackupPayload(createBackupEnvelope(migrated)), migrated);
});

test('adds solid color mode without changing saved backgrounds and normalizes conflicting modes', () => {
  const savedBackground = {
    backgroundColor: '#2468ac',
    backgroundImageColor: '#102030',
    backgroundImageUrl: 'https://images.test/background.gif',
    backgroundImageLocal: 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9',
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: true
  };
  for (const backgroundDefault of [true, false]) {
    const migrated = migratePersistedData({
      schemaVersion: 5,
      bookmarks: [],
      settings: { theme: { ...savedBackground, backgroundDefault } }
    });
    assert.deepEqual(migrated.settings.theme, {
      ...savedBackground, backgroundDefault, backgroundSolid: false,
      backgroundPrimaryType: 'image',
      backgroundVideo: { url: null, local: null, source: 'url' },
      backgroundMedia: [], backgroundRotationSeconds: 0
    });
  }

  for (const backgroundDefault of [true, false]) {
    const data = migratePersistedData({
      bookmarks: [],
      settings: { theme: { ...savedBackground, backgroundDefault, backgroundSolid: true } }
    });
    assert.equal(data.settings.theme.backgroundSolid, !backgroundDefault);
    assert.deepEqual(parseBackupPayload(createBackupEnvelope(data)), data);
  }

  const legacy = migratePersistedData({
    schemaVersion: 11,
    bookmarks: [],
    settings: {
      theme: {
        backgroundColor: '#13579b',
        backgroundImageUrl: 'https://images.test/transparent.gif'
      }
    }
  });
  assert.equal(legacy.settings.theme.backgroundColor, '#13579b');
  assert.equal(legacy.settings.theme.backgroundImageColor, '#13579b');
});

test('migrates legacy data and removes identity from the default preset', () => {
  const migrated = migratePersistedData({
    bookmarks: [{ id: 'one', name: 'One', url: 'one.test' }],
    settings: {
      language: 'es',
      bookmarkDefault: {
        name: 'Legacy name',
        url: 'https://legacy.test',
        backgroundColor: '#123456'
      }
    }
  });

  assert.equal(migrated.schemaVersion, DATA_SCHEMA_VERSION);
  assert.equal(migrated.bookmarks[0].url, 'https://one.test');
  assert.equal(migrated.settings.language, 'es');
  assert.equal(migrated.settings.bookmarkDefault.name, undefined);
  assert.equal(migrated.settings.bookmarkDefault.url, undefined);
  assert.equal(migrated.settings.bookmarkDefault.backgroundColor, '#123456');
  assert.equal(migrated.settings.bookmarkDragMode, BOOKMARK_DRAG_MODES.NONE);
  assert.deepEqual(Object.keys(migrated.settings.theme), Object.keys(DEFAULT_SETTINGS.theme));
});

test('normalizes unsupported bookmark drag modes to none', () => {
  const migrated = migratePersistedData({
    bookmarks: [],
    settings: { ...DEFAULT_SETTINGS, bookmarkDragMode: 'unknown' }
  });

  assert.equal(migrated.settings.bookmarkDragMode, BOOKMARK_DRAG_MODES.NONE);
});

test('adds safe keyboard shortcuts to legacy settings and preserves custom values', () => {
  const legacy = migratePersistedData({ bookmarks: [], settings: { language: 'es' } });
  assert.deepEqual(legacy.settings.keyboardShortcuts, DEFAULT_KEYBOARD_SHORTCUTS);

  const custom = {
    ...DEFAULT_KEYBOARD_SHORTCUTS,
    toggleEditing: 'Ctrl+Shift+E'
  };
  const migrated = migratePersistedData({
    schemaVersion: 9,
    bookmarks: [],
    settings: { keyboardShortcuts: custom }
  });
  assert.deepEqual(migrated.settings.keyboardShortcuts, custom);
  assert.deepEqual(parseBackupPayload(createBackupEnvelope(migrated)), migrated);
});

test('preserves the none bookmark drag mode', () => {
  const migrated = migratePersistedData({
    bookmarks: [],
    settings: { ...DEFAULT_SETTINGS, bookmarkDragMode: BOOKMARK_DRAG_MODES.NONE }
  });

  assert.equal(migrated.settings.bookmarkDragMode, BOOKMARK_DRAG_MODES.NONE);
});

test('creates and parses a versioned complete backup', () => {
  const data = migratePersistedData({ bookmarks: [], settings: DEFAULT_SETTINGS });
  const envelope = createBackupEnvelope(data);
  const restored = parseBackupPayload(envelope);

  assert.equal(envelope.format, 'newdesktab-backup');
  assert.equal(envelope.schemaVersion, DATA_SCHEMA_VERSION);
  assert.deepEqual(restored, data);
});

test('migrates and backs up the generic bundled-widget envelope', () => {
  const data = migratePersistedData({
    bookmarks: [],
    widgets: [{
      id: 'clock', type: 'clock', version: 2,
      gx: 11, gy: 5, w: 3, h: 2,
      groupId: 'work', config: { timezone: 'UTC' },
      createdAt: 10, updatedAt: 20
    }],
    settings: {
      ...DEFAULT_SETTINGS,
      bookmarkGroups: [{ id: 'work', name: 'Work' }]
    }
  });

  assert.deepEqual(data.widgets[0], {
    id: 'clock', type: 'clock', version: 2,
    gx: 9, gy: 4, w: 3, h: 2,
    groupId: 'work', config: { timezone: 'UTC' },
    createdAt: 10, updatedAt: 20
  });
  assert.deepEqual(parseBackupPayload(createBackupEnvelope(data)), data);
});

test('keeps compatibility with the old bookmarks-only export', () => {
  const current = migratePersistedData({ bookmarks: [], settings: DEFAULT_SETTINGS });
  const restored = parseBackupPayload([
    { id: 'legacy', name: 'Legacy', url: 'legacy.test' }
  ], current);

  assert.equal(restored.bookmarks[0].id, 'legacy');
  assert.equal(restored.bookmarks[0].url, 'https://legacy.test');
  assert.deepEqual(restored.settings, current.settings);
});

test('round-trips a versioned bookmarks-only export without replacing settings', () => {
  const current = migratePersistedData({ bookmarks: [], settings: DEFAULT_SETTINGS });
  const envelope = createBookmarksEnvelope([
    {
      id: 'portable',
      name: 'Portable',
      url: 'portable.test',
      folderId: 'reading'
    }
  ], [{ id: 'reading', name: 'Reading', gx: 0, gy: 0 }]);
  const { bookmarks, folders } = parseBookmarksPayload(envelope, current);

  assert.equal(envelope.format, 'newdesktab-bookmarks');
  assert.equal(bookmarks[0].id, 'portable');
  assert.equal(bookmarks[0].url, 'https://portable.test');
  assert.equal(bookmarks[0].folderId, 'reading');
  assert.equal(folders[0].name, 'Reading');
});

test('rejects data written by a future schema', () => {
  assert.throws(
    () => migratePersistedData({ schemaVersion: DATA_SCHEMA_VERSION + 1 }),
    error => (
      error.code === 'UNSUPPORTED_DATA_VERSION'
      && error.requiredSchemaVersion === DATA_SCHEMA_VERSION + 1
      && error.supportedSchemaVersion === DATA_SCHEMA_VERSION
    )
  );
});

test('normalizes named presets and workspace references', () => {
  const migrated = migratePersistedData({
    bookmarks: [{ id: 'grouped', name: 'Grouped', groupId: 'work' }],
    settings: {
      ...DEFAULT_SETTINGS,
      bookmarkPresets: [{
        id: 'dark',
        name: '  Dark  ',
        style: { backgroundColor: '#111111', name: 'ignored' }
      }],
      bookmarkGroups: [{ id: 'work', name: ' Work ' }],
      activeBookmarkGroupId: 'work'
    }
  });

  assert.equal(migrated.bookmarks[0].groupId, 'work');
  assert.deepEqual(migrated.settings.bookmarkGroups, [{ id: 'work', name: 'Work' }]);
  assert.equal(migrated.settings.activeBookmarkGroupId, 'work');
  assert.equal(migrated.settings.bookmarkPresets[0].name, 'Dark');
  assert.equal(migrated.settings.bookmarkPresets[0].style.name, undefined);
});

test('falls back to the main workspace when the active group is missing', () => {
  const migrated = migratePersistedData({
    bookmarks: [],
    settings: {
      ...DEFAULT_SETTINGS,
      bookmarkGroups: [],
      activeBookmarkGroupId: 'missing'
    }
  });

  assert.equal(migrated.settings.activeBookmarkGroupId, null);
});

test('normalizes folder references and rejects cross-workspace membership', () => {
  const migrated = migratePersistedData({
    bookmarks: [
      { id: 'inside', name: 'Inside', groupId: 'work', folderId: 'work-folder' },
      { id: 'wrong', name: 'Wrong', groupId: null, folderId: 'work-folder' },
      { id: 'missing', name: 'Missing', folderId: 'missing-folder' }
    ],
    folders: [{ id: 'work-folder', name: 'Work', groupId: 'work', w: 5, h: 4 }],
    settings: {
      ...DEFAULT_SETTINGS,
      bookmarkGroups: [{ id: 'work', name: 'Work' }]
    }
  });

  assert.equal(migrated.folders[0].w, 5);
  assert.equal(migrated.folders[0].h, 4);
  assert.equal(migrated.folders[0].noBackground, false);
  assert.equal(migrated.folders[0].backgroundColor, '#38bdf8');
  assert.equal(migrated.folders[0].backgroundImageUrl, null);
  assert.equal(migrated.folders[0].backgroundImageUrlLocked, false);
  assert.equal(migrated.folders[0].textColor, '#f8fafc');
  assert.equal(migrated.bookmarks[0].folderId, 'work-folder');
  assert.equal(migrated.bookmarks[1].folderId, null);
  assert.equal(migrated.bookmarks[2].folderId, null);
});

test('round-trips recycle bin geometry and deleted folder contents', () => {
  const deletedAt = 123456;
  const migrated = migratePersistedData({
    bookmarks: [],
    folders: [],
    recycleBin: {
      gx: 8,
      gy: 2,
      w: 3,
      h: 2,
      noBackground: true,
      backgroundColor: '#663399',
      backgroundImageUrl: 'https://images.test/bin.png',
      backgroundImageSource: 'url',
      backgroundImageUrlLocked: true,
      iconColor: '#FFAA00',
      textColor: '#FFFFFF',
      showIcon: false,
      showName: false,
      showCount: true
    },
    trash: [{
      id: 'deleted-folder-entry',
      type: 'folder',
      deletedAt,
      folder: { id: 'deleted-folder', name: 'Deleted', gx: 3, gy: 2 },
      bookmarks: [{ id: 'deleted-bookmark', name: 'Inside', folderId: 'wrong' }]
    }],
    settings: { ...DEFAULT_SETTINGS, showRecycleBin: false }
  });

  assert.deepEqual(
    { gx: migrated.recycleBin.gx, gy: migrated.recycleBin.gy, w: migrated.recycleBin.w, h: migrated.recycleBin.h },
    { gx: 8, gy: 2, w: 3, h: 2 }
  );
  assert.deepEqual(
    (({
      noBackground, backgroundColor, backgroundImageUrl, backgroundImageSource,
      backgroundImageUrlLocked, iconColor, textColor, showIcon, showName, showCount
    }) => (
      {
        noBackground, backgroundColor, backgroundImageUrl, backgroundImageSource,
        backgroundImageUrlLocked, iconColor, textColor, showIcon, showName, showCount
      }
    ))(migrated.recycleBin),
    {
      noBackground: true,
      backgroundColor: '#663399',
      backgroundImageUrl: 'https://images.test/bin.png',
      backgroundImageSource: 'url',
      backgroundImageUrlLocked: true,
      iconColor: '#ffaa00',
      textColor: '#ffffff',
      showIcon: false,
      showName: false,
      showCount: true
    }
  );
  assert.equal(migrated.settings.showRecycleBin, false);
  assert.equal(migrated.trash[0].deletedAt, deletedAt);
  assert.equal(migrated.trash[0].bookmarks[0].folderId, 'deleted-folder');
  assert.deepEqual(parseBackupPayload(createBackupEnvelope(migrated)), migrated);
});
