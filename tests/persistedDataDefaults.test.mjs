import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_RECYCLE_BIN } from '../src/js/domain/recycle-bin/recycleBinDefaults.js';
import { DEFAULT_SETTINGS } from '../src/js/domain/settings/settingsDefaults.js';
import { createDefaultPersistedData } from '../src/js/platform/storage/persistedDataDefaults.js';
import { DATA_SCHEMA_VERSION } from '../src/js/platform/storage/schemaVersion.js';

test('creates the complete persisted-data shape for a new profile', () => {
  const data = createDefaultPersistedData();

  assert.equal(data.schemaVersion, DATA_SCHEMA_VERSION);
  assert.deepEqual(data.bookmarks, []);
  assert.deepEqual(data.folders, []);
  assert.deepEqual(data.widgets, []);
  assert.deepEqual(data.recycleBin, DEFAULT_RECYCLE_BIN);
  assert.deepEqual(data.trash, []);
  assert.deepEqual(data.settings, DEFAULT_SETTINGS);
});

test('returns isolated settings and recycle-bin values for every caller', () => {
  const first = createDefaultPersistedData();
  const second = createDefaultPersistedData();

  first.settings.theme.backgroundColor = '#000000';
  first.recycleBin.gx = 5;
  first.bookmarks.push({ id: 'local-change' });

  assert.equal(second.settings.theme.backgroundColor, '#ffffff');
  assert.equal(second.recycleBin.gx, DEFAULT_RECYCLE_BIN.gx);
  assert.deepEqual(second.bookmarks, []);
});
