import assert from 'node:assert/strict';
import test from 'node:test';
import { migratePersistedData } from '../src/platform/storage/dataSchema.js';
import {
  DEVICE_IMAGE_SELECTIONS_KEY,
  restoreDeviceImageSelections,
  saveDeviceImageSelections,
  withoutDeviceImages
} from '../src/platform/storage/deviceImageSelections.js';

const owned = 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
const replacement = 'newdesktab-local-image:8c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
const foreign = 'newdesktab-local-image:9c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
const local = {
  'newdesktabLocalImage:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9': { dataUrl: 'data:image/webp;base64,b3duZWQ=', name: 'owned.webp' },
  'newdesktabLocalImage:8c5b9a2e-3f0e-4c7e-889c-72117afc09e9': { dataUrl: 'data:image/webp;base64,bmV3', name: 'new.webp' }
};
globalThis.chrome = {
  runtime: { lastError: null },
  storage: { local: {
    get(keys, callback) {
      callback(Object.fromEntries((Array.isArray(keys) ? keys : [keys])
        .filter(key => Object.hasOwn(local, key)).map(key => [key, structuredClone(local[key])])));
    },
    set(items, callback) { Object.assign(local, structuredClone(items)); callback(); }
  } }
};

function dataWithImage(reference) {
  const style = { backgroundImageLocal: reference, backgroundImageUrl: 'https://images.test/fallback.gif' };
  return migratePersistedData({
    bookmarks: [{ id: 'bookmark', name: 'Bookmark', ...style }],
    folders: [{ id: 'folder', name: 'Folder', ...style }],
    recycleBin: style,
    settings: {
      theme: style,
      bookmarkDefault: style,
      bookmarkPresets: [{ id: 'preset', name: 'Preset', style }]
    }
  });
}

function styles(data) {
  return [data.settings.theme, data.settings.bookmarkDefault, data.settings.bookmarkPresets[0].style,
    data.bookmarks[0], data.folders[0], data.recycleBin];
}

test('migrates only available legacy files and keeps every image slot local through remote updates', async () => {
  const legacy = dataWithImage(owned);
  legacy.folders[0].backgroundImageLocal = foreign;
  const restored = await restoreDeviceImageSelections(legacy);
  assert.equal(restored.settings.theme.backgroundImageLocal, owned);
  assert.equal(restored.folders[0].backgroundImageLocal, null);
  assert.equal(Object.keys(local[DEVICE_IMAGE_SELECTIONS_KEY]).length, 6);
  local[DEVICE_IMAGE_SELECTIONS_KEY]['bookmark:removed'] = {
    reference: owned,
    source: 'local'
  };
  await restoreDeviceImageSelections(restored);
  assert.equal(Object.hasOwn(local[DEVICE_IMAGE_SELECTIONS_KEY], 'bookmark:removed'), false);

  for (const style of styles(restored)) style.backgroundImageLocal = replacement;
  await saveDeviceImageSelections(restored);
  const refreshed = await restoreDeviceImageSelections(dataWithImage(foreign));
  for (const style of styles(refreshed)) assert.equal(style.backgroundImageLocal, replacement);

  const shared = withoutDeviceImages(refreshed);
  assert.equal(JSON.stringify(shared).includes('newdesktab-local-image:'), false);
  for (const style of styles(shared)) {
    assert.equal(Object.hasOwn(style, 'backgroundImageLocal'), false);
    assert.equal(Object.hasOwn(style, 'backgroundImageSource'), false);
    assert.equal(style.backgroundImageUrl, 'https://images.test/fallback.gif');
  }
  for (const style of styles(refreshed)) assert.equal(style.backgroundImageLocal, replacement);

  for (const style of styles(refreshed)) style.backgroundImageLocal = null;
  await saveDeviceImageSelections(refreshed);
  const afterRemoval = await restoreDeviceImageSelections(dataWithImage(owned));
  for (const style of styles(afterRemoval)) assert.equal(style.backgroundImageLocal, null);
});

test('keeps each device image source choice beside its local file selection', async () => {
  const data = dataWithImage(owned);
  for (const style of styles(data)) style.backgroundImageSource = 'url';
  await saveDeviceImageSelections(data);

  const restored = await restoreDeviceImageSelections(dataWithImage(foreign));
  for (const style of styles(restored)) {
    assert.equal(style.backgroundImageLocal, owned);
    assert.equal(style.backgroundImageSource, 'url');
  }
});

test('keeps deleted-item image choices out of synchronized payloads', () => {
  const style = { backgroundImageLocal: owned, backgroundImageUrl: 'https://images.test/fallback.gif' };
  const data = migratePersistedData({
    bookmarks: [],
    folders: [],
    trash: [
      { id: 'trash-bookmark', type: 'bookmark', deletedAt: 1, bookmark: { id: 'deleted', name: 'Deleted', ...style } },
      {
        id: 'trash-folder',
        type: 'folder',
        deletedAt: 1,
        folder: { id: 'deleted-folder', name: 'Deleted folder', ...style },
        bookmarks: [{ id: 'inside', name: 'Inside', ...style }]
      }
    ]
  });

  const shared = withoutDeviceImages(data);
  assert.equal(JSON.stringify(shared).includes('newdesktab-local-image:'), false);
  assert.equal(shared.trash[0].bookmark.backgroundImageUrl, style.backgroundImageUrl);
  assert.equal(shared.trash[1].folder.backgroundImageUrl, style.backgroundImageUrl);
  assert.equal(shared.trash[1].bookmarks[0].backgroundImageUrl, style.backgroundImageUrl);
});
