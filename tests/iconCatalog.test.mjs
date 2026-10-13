import assert from 'node:assert/strict';
import test from 'node:test';
import { ICON_CATALOG, normalizeCatalogIconId } from '../src/shared/icons/iconCatalog.js';
import { getIconRecommendations, normalizeIconSearch } from '../src/shared/icons/iconRecommendations.js';
import { normalizeBookmark, normalizeBookmarkPreset } from '../src/domain/bookmarks/bookmarkModel.js';
import { normalizeFolderStyle } from '../src/domain/folders/folderModel.js';
import { normalizeRecycleBinStyle } from '../src/domain/recycle-bin/recycleBinModel.js';
import { createDefaultPersistedData } from '../src/platform/storage/persistedDataDefaults.js';
import { createBackupEnvelope, createBookmarksEnvelope, migratePersistedData, parseBackupPayload, parseBookmarksPayload } from '../src/platform/storage/dataSchema.js';
import { readFileSync } from 'node:fs';

test('the shared catalog is translated and suggests appropriate icons without requiring a URL', () => {
  assert.equal(new Set(ICON_CATALOG.map(icon => icon.id)).size, ICON_CATALOG.length);
  for (const language of ['en', 'es', 'es_419', 'pt_BR']) {
    const { itemEditor } = JSON.parse(readFileSync(new URL(`../src/lang/${language}.json`, import.meta.url)));
    for (const { id } of ICON_CATALOG) assert.equal(typeof itemEditor.icons[id], 'string', `${language}: ${id}`);
  }
  for (const [value, type, expected] of [
    [{ url: 'https://github.com/team/project' }, 'bookmark', 'code'],
    [{ url: 'https://www.youtube.com/watch?v=123' }, 'bookmark', 'video'],
    [{ name: 'Compras' }, 'folder', 'cart'],
    [{ name: 'Figuras geométricas' }, 'folder', 'circle'],
    [{}, 'recycleBin', 'ui-trash']
  ]) {
    const recommendations = getIconRecommendations(value, type);
    assert.equal(recommendations[0], expected);
    assert.equal(recommendations.length, 4);
    assert.ok(recommendations.every(normalizeCatalogIconId));
  }
  assert.equal(normalizeIconSearch('  CÍRCULO  '), 'circulo');
});

test('category selection accepts bundled IDs and preserves original artwork for legacy or invalid data', () => {
  for (const { id } of ICON_CATALOG) {
    assert.equal(normalizeCatalogIconId(id), id);
    for (const normalize of [normalizeBookmarkPreset, normalizeFolderStyle, normalizeRecycleBinStyle]) {
      assert.equal(normalize({ iconId: id }).iconId, id);
    }
  }
  for (const iconId of [undefined, null, '', 'unknown', '../icon.svg', '<svg onload="alert(1)">', {}, 1]) {
    for (const normalize of [normalizeBookmarkPreset, normalizeFolderStyle, normalizeRecycleBinStyle]) {
      assert.equal(normalize({ iconId }).iconId, null);
    }
  }
});

test('category icons round-trip through complete backups, bookmark exports, presets and trash', () => {
  const data = createDefaultPersistedData();
  const bookmark = normalizeBookmark({ name: 'Music', url: 'https://music.example', iconId: 'music' });
  const folder = { ...normalizeFolderStyle({ iconId: 'projects' }), id: 'sections', name: 'Sections', groupId: null, gx: 3, gy: 0, w: 1, h: 1 };
  data.bookmarks = [bookmark];
  data.folders = [folder];
  data.recycleBin.iconId = 'tasks';
  data.settings.bookmarkDefault.iconId = 'mail';
  data.settings.bookmarkPresets = [{ id: 'preset', name: 'Reading', style: normalizeBookmarkPreset({ iconId: 'notes' }) }];
  data.trash = [
    { id: 'trash-bookmark', type: 'bookmark', deletedAt: Date.now(), bookmark: { ...bookmark, id: 'deleted' } },
    { id: 'trash-folder', type: 'folder', deletedAt: Date.now(), folder: { ...folder, id: 'deleted-folder' }, bookmarks: [] }
  ];
  const restored = parseBackupPayload(createBackupEnvelope(data), createDefaultPersistedData());
  assert.equal(restored.bookmarks[0].iconId, 'music');
  assert.equal(restored.folders[0].iconId, 'projects');
  assert.equal(restored.recycleBin.iconId, 'tasks');
  assert.equal(restored.settings.bookmarkDefault.iconId, 'mail');
  assert.equal(restored.settings.bookmarkPresets[0].style.iconId, 'notes');
  const local = migratePersistedData(data);
  assert.equal(local.trash[0].bookmark.iconId, 'music');
  assert.equal(local.trash[1].folder.iconId, 'projects');
  const imported = parseBookmarksPayload(createBookmarksEnvelope(data.bookmarks, data.folders));
  assert.equal(imported.bookmarks[0].iconId, 'music');
  assert.equal(imported.folders[0].iconId, 'projects');
});
