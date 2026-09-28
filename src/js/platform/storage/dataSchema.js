import '../../types/types.js';
import {
  DEFAULT_RECYCLE_BIN,
  DEFAULT_SETTINGS,
  DEFAULT_STATE
} from '../../core/defaults.js';
import { DATA_SCHEMA_VERSION } from './schemaVersion.js';
import {
  normalizeBookmark,
  normalizeBookmarkPreset
} from '../../domain/bookmarks/bookmarkModel.js';
import {
  normalizeBookmarkDragMode,
  normalizeBookmarkResizeMode
} from '../../domain/settings/gridInteractionModes.js';
import { normalizeKeyboardShortcuts } from '../../shared/keyboard/keyboardShortcuts.js';
import { normalizeFolderStyle } from '../../domain/folders/folderModel.js';
import { normalizeBackgroundImage } from '../../shared/images/backgroundImage.js';
import {
  normalizeInterfaceTheme,
  normalizeLanguagePreference
} from '../../domain/settings/interfacePreferences.js';
import { normalizeRecycleBinStyle } from '../../domain/recycle-bin/recycleBinModel.js';
import {
  normalizeWorkspaces,
  resolveWorkspaceId
} from '../../domain/workspaces/workspaceModel.js';
import { normalizeWidgets } from '../../widgets/widgetModel.js';

/**
 * Upgrades and normalizes application data from every supported NewDeskTab
 * version. This is the only entry point for data crossing a persistence or
 * import boundary.
 *
 * @param {Partial<PersistedData>|null|undefined} input
 * @param {Object} [options]
 * @param {boolean} [options.useDefaultsWhenEmpty=true]
 * @returns {PersistedData}
 */
export function migratePersistedData(input, { useDefaultsWhenEmpty = true } = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const sourceVersion = Number.isInteger(source.schemaVersion)
    ? source.schemaVersion
    : 0;

  if (sourceVersion > DATA_SCHEMA_VERSION) {
    const error = new Error('This NewDeskTab data was created by a newer version.');
    error.code = 'UNSUPPORTED_DATA_VERSION';
    error.requiredSchemaVersion = sourceVersion;
    error.supportedSchemaVersion = DATA_SCHEMA_VERSION;
    throw error;
  }

  const rawBookmarks = Array.isArray(source.bookmarks)
    ? source.bookmarks
    : (useDefaultsWhenEmpty ? DEFAULT_STATE.data.bookmarks : []);
  const rawFolders = Array.isArray(source.folders) ? source.folders : [];
  const rawSettings = source.settings && typeof source.settings === 'object'
    ? source.settings
    : {};
  const now = Date.now();

  const workspaces = normalizeWorkspaces(rawSettings.bookmarkGroups);
  const workspaceIds = new Set(workspaces.map(workspace => workspace.id));
  const activeWorkspaceId = resolveWorkspaceId(
    workspaces,
    rawSettings.activeBookmarkGroupId
  );

  const folders = rawFolders
    .filter(folder => folder && typeof folder === 'object')
    .map((folder, index) => normalizeBookmarkFolder(folder, {
      index,
      now,
      workspaceIds
    }));
  const folderById = new Map(folders.map(folder => [folder.id, folder]));
  const bookmarks = rawBookmarks
    .filter(bookmark => bookmark && typeof bookmark === 'object')
    .map((bookmark, index) => {
      const normalized = normalizeBookmark(bookmark, {
        now,
        touchUpdatedAt: false,
        idFactory: () => `migrated-${now}-${index}`
      });
      normalized.groupId = workspaceIds.has(normalized.groupId)
        ? normalized.groupId
        : null;
      const folder = folderById.get(normalized.folderId);
      normalized.folderId = folder
        && (folder.groupId ?? null) === (normalized.groupId ?? null)
        ? folder.id
        : null;
      return normalized;
    });
  const recycleBin = normalizeRecycleBin(source.recycleBin);
  const widgets = normalizeWidgets(source.widgets, { now, workspaceIds });

  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    bookmarks,
    folders,
    widgets,
    recycleBin,
    trash: normalizeTrashEntries(source.trash, {
      now,
      workspaceIds
    }),
    settings: {
      ...structuredClone(DEFAULT_SETTINGS),
      ...rawSettings,
      language: normalizeLanguagePreference(rawSettings.language),
      interfaceTheme: normalizeInterfaceTheme(rawSettings.interfaceTheme),
      theme: normalizeTheme(rawSettings.theme),
      bookmarkDefault: normalizeBookmarkPreset(rawSettings.bookmarkDefault),
      bookmarkDragMode: normalizeBookmarkDragMode(rawSettings.bookmarkDragMode),
      bookmarkResizeMode: normalizeBookmarkResizeMode(rawSettings.bookmarkResizeMode),
      keyboardShortcuts: normalizeKeyboardShortcuts(rawSettings.keyboardShortcuts),
      showRecycleBin: rawSettings.showRecycleBin !== false,
      bookmarkPresets: normalizeNamedPresets(rawSettings.bookmarkPresets),
      bookmarkGroups: workspaces,
      activeBookmarkGroupId: activeWorkspaceId
    }
  };
}

function normalizeRecycleBin(value) {
  const source = value && typeof value === 'object' ? value : {};
  const w = Math.min(12, normalizeGridSize(source.w ?? DEFAULT_RECYCLE_BIN.w));
  const h = Math.min(6, normalizeGridSize(source.h ?? DEFAULT_RECYCLE_BIN.h));
  return {
    ...structuredClone(DEFAULT_RECYCLE_BIN),
    ...normalizeRecycleBinStyle(source),
    gx: Math.min(12 - w, normalizeGridValue(source.gx ?? DEFAULT_RECYCLE_BIN.gx)),
    gy: Math.min(6 - h, normalizeGridValue(source.gy ?? DEFAULT_RECYCLE_BIN.gy)),
    w,
    h,
    groupId: null,
    updatedAt: normalizeTimestamp(source.updatedAt, 0)
  };
}

function normalizeTrashEntries(value, { now, workspaceIds }) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, entryIndex) => {
    if (!entry || typeof entry !== 'object') return [];
    const deletedAt = normalizeTimestamp(entry.deletedAt, now);
    const id = typeof entry.id === 'string' && entry.id.trim()
      ? entry.id
      : `trash-${now}-${entryIndex}`;

    if (entry.type === 'bookmark' && entry.bookmark && typeof entry.bookmark === 'object') {
      const bookmark = normalizeBookmark(entry.bookmark, {
        now,
        touchUpdatedAt: false,
        idFactory: () => `trashed-bookmark-${now}-${entryIndex}`
      });
      bookmark.groupId = workspaceIds.has(bookmark.groupId) ? bookmark.groupId : null;
      return [{ id, type: 'bookmark', deletedAt, bookmark }];
    }

    if (entry.type === 'folder' && entry.folder && typeof entry.folder === 'object') {
      const folder = normalizeBookmarkFolder(entry.folder, {
        index: entryIndex,
        now,
        workspaceIds
      });
      const bookmarks = (Array.isArray(entry.bookmarks) ? entry.bookmarks : [])
        .filter(bookmark => bookmark && typeof bookmark === 'object')
        .map((bookmark, bookmarkIndex) => {
          const normalized = normalizeBookmark(bookmark, {
            now,
            touchUpdatedAt: false,
            idFactory: () => `trashed-folder-bookmark-${now}-${entryIndex}-${bookmarkIndex}`
          });
          normalized.folderId = folder.id;
          normalized.groupId = folder.groupId;
          return normalized;
        });
      return [{ id, type: 'folder', deletedAt, folder, bookmarks }];
    }

    return [];
  });
}

function normalizeTheme(value) {
  const source = value && typeof value === 'object' ? value : {};
  const legacyBackgroundColor = typeof source.backgroundColor === 'string'
    ? source.backgroundColor
    : DEFAULT_SETTINGS.theme.backgroundColor;
  const theme = {
    ...structuredClone(DEFAULT_SETTINGS.theme),
    ...source,
    backgroundImageColor: typeof source.backgroundImageColor === 'string'
      ? source.backgroundImageColor
      : legacyBackgroundColor,
    ...normalizeBackgroundImage(source)
  };
  theme.backgroundDefault = theme.backgroundDefault === true;
  theme.backgroundSolid = !theme.backgroundDefault && theme.backgroundSolid === true;
  return theme;
}

function normalizeBookmarkFolder(folder, { index, now, workspaceIds }) {
  const groupId = workspaceIds.has(folder.groupId) ? folder.groupId : null;

  return {
    ...normalizeFolderStyle(folder),
    id: typeof folder.id === 'string' && folder.id.trim()
      ? folder.id
      : `folder-${now}-${index}`,
    name: typeof folder.name === 'string' && folder.name.trim()
      ? folder.name.trim()
      : `Folder ${index + 1}`,
    gx: normalizeGridValue(folder.gx),
    gy: normalizeGridValue(folder.gy),
    w: normalizeGridSize(folder.w),
    h: normalizeGridSize(folder.h),
    groupId,
    createdAt: normalizeTimestamp(folder.createdAt, now),
    updatedAt: normalizeTimestamp(folder.updatedAt, now)
  };
}

function normalizeGridValue(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeGridSize(value) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizeTimestamp(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeNamedPresets(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(preset => preset && typeof preset === 'object')
    .map((preset, index) => ({
      id: typeof preset.id === 'string' && preset.id.trim()
        ? preset.id
        : `preset-${index + 1}`,
      name: typeof preset.name === 'string' && preset.name.trim()
        ? preset.name.trim()
        : `Preset ${index + 1}`,
      style: normalizeBookmarkPreset(preset.style ?? preset)
    }));
}

/**
 * Creates the versioned envelope used for complete backups.
 *
 * @param {PersistedData} data
 * @returns {{format: string, schemaVersion: number, exportedAt: string, data: PersistedData}}
 */
export function createBackupEnvelope(data) {
  return {
    format: 'newdesktab-backup',
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: migratePersistedData(data)
  };
}

/**
 * Creates a portable, versioned bookmarks-only document.
 *
 * @param {Bookmark[]} bookmarks
 * @param {BookmarkFolder[]} [folders=[]]
 * @returns {{format: string, schemaVersion: number, exportedAt: string, bookmarks: Bookmark[], folders: BookmarkFolder[]}}
 */
export function createBookmarksEnvelope(bookmarks, folders = []) {
  const normalized = migratePersistedData({
    bookmarks,
    folders,
    settings: DEFAULT_SETTINGS
  }, { useDefaultsWhenEmpty: false });

  return {
    format: 'newdesktab-bookmarks',
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    bookmarks: normalized.bookmarks,
    folders: normalized.folders
  };
}

/**
 * Accepts current backups and the legacy bookmarks-only array.
 *
 * @param {*} payload
 * @param {PersistedData} [currentData]
 * @returns {PersistedData}
 */
export function parseBackupPayload(payload, currentData = DEFAULT_STATE.data) {
  if (Array.isArray(payload)) {
    return migratePersistedData({
      ...currentData,
      bookmarks: payload,
      folders: []
    });
  }

  if (payload?.format === 'newdesktab-backup' && payload.data) {
    return migratePersistedData(payload.data);
  }

  if (payload && typeof payload === 'object' && Array.isArray(payload.bookmarks)) {
    return migratePersistedData(payload);
  }

  const error = new Error('Invalid NewDeskTab backup.');
  error.code = 'INVALID_BACKUP';
  throw error;
}

/**
 * Reads bookmark-only exports, legacy arrays and complete backups while keeping
 * the current settings untouched.
 *
 * @param {*} payload
 * @param {PersistedData} currentData
 * @returns {{bookmarks: Bookmark[], folders: BookmarkFolder[]}}
 */
export function parseBookmarksPayload(payload, currentData = DEFAULT_STATE.data) {
  if (payload?.format === 'newdesktab-bookmarks' && Array.isArray(payload.bookmarks)) {
    const migrated = migratePersistedData({
      ...currentData,
      bookmarks: payload.bookmarks,
      folders: Array.isArray(payload.folders) ? payload.folders : []
    }, { useDefaultsWhenEmpty: false });
    return { bookmarks: migrated.bookmarks, folders: migrated.folders };
  }

  const restored = parseBackupPayload(payload, currentData);
  const migrated = migratePersistedData({
    ...currentData,
    bookmarks: restored.bookmarks,
    folders: restored.folders
  }, { useDefaultsWhenEmpty: false });
  return { bookmarks: migrated.bookmarks, folders: migrated.folders };
}
