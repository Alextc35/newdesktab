import assert from 'node:assert/strict';
import test from 'node:test';
import { migratePersistedData } from '../src/platform/storage/dataSchema.js';
import {
  DEVICE_WALLPAPERS_KEY,
  restoreDeviceWallpapers,
  saveDeviceWallpapers,
  withoutDeviceWallpapers
} from '../src/platform/storage/deviceWallpapers.js';

const local = {};
globalThis.chrome = { runtime: { lastError: null }, storage: { local: {
  get(key, callback) {
    callback(Object.hasOwn(local, key) ? { [key]: structuredClone(local[key]) } : {});
  },
  set(values, callback) {
    Object.assign(local, structuredClone(values));
    callback();
  }
} } };

const image = 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
const video = 'newdesktab-local-video:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';

test('personal URLs, local files and timing are absent from shared settings', () => {
  const data = migratePersistedData({ settings: { theme: {
    backgroundImageUrl: 'https://example.test/fallback.png',
    backgroundMedia: [
      { id: 'own-url', type: 'image', backgroundImageUrl: 'https://example.test/private.png' },
      { id: 'own-file', type: 'image', backgroundImageLocal: image }
    ],
    backgroundRotationSeconds: 5
  } } });
  const shared = withoutDeviceWallpapers(data);
  assert.equal(shared.settings.theme.backgroundImageUrl, 'https://example.test/fallback.png');
  assert.deepEqual(shared.settings.theme.backgroundMedia, []);
  assert.equal(shared.settings.theme.backgroundRotationSeconds, 0);
  assert.equal(data.settings.theme.backgroundMedia.length, 2);
});

test('reading empty default data does not recreate a deleted personal collection', async () => {
  delete local[DEVICE_WALLPAPERS_KEY];
  const restored = await restoreDeviceWallpapers(migratePersistedData({}));
  assert.deepEqual(restored.settings.theme.backgroundMedia, []);
  assert.equal(restored.settings.theme.backgroundRotationSeconds, 0);
  assert.equal(Object.hasOwn(local, DEVICE_WALLPAPERS_KEY), false);
});

test('each device restores its own collection even when shared settings change', async () => {
  const first = migratePersistedData({ settings: { theme: {
    backgroundMedia: [{ id: 'first', type: 'image',
      backgroundImageUrl: 'https://example.test/first.png' }],
    backgroundRotationSeconds: 15
  } } });
  await saveDeviceWallpapers(first);
  assert.equal(local[DEVICE_WALLPAPERS_KEY].media[0].id, 'first');

  const remote = migratePersistedData({ settings: { theme: {
    backgroundImageUrl: 'https://example.test/new-fallback.png',
    backgroundMedia: [{ id: 'remote', type: 'image',
      backgroundImageUrl: 'https://example.test/remote.png' }]
  } } });
  const restored = await restoreDeviceWallpapers(remote);
  assert.equal(restored.settings.theme.backgroundImageUrl, 'https://example.test/new-fallback.png');
  assert.deepEqual(restored.settings.theme.backgroundMedia.map(item => item.id), ['first']);
  assert.equal(restored.settings.theme.backgroundRotationSeconds, 15);
});

test('adopts legacy shared wallpapers and moves a primary local file only once', async () => {
  delete local[DEVICE_WALLPAPERS_KEY];
  const old = migratePersistedData({ schemaVersion: 19, settings: { theme: {
    backgroundImageUrl: 'https://example.test/fallback.png',
    backgroundImageLocal: image,
    backgroundImageSource: 'local',
    backgroundMedia: [{ id: 'old', type: 'image',
      backgroundImageUrl: 'https://example.test/old.png' }],
    backgroundRotationSeconds: 60
  } } });
  const restored = await restoreDeviceWallpapers(old);
  assert.equal(restored.settings.theme.backgroundImageLocal, null);
  assert.equal(restored.settings.theme.backgroundImageUrl, 'https://example.test/fallback.png');
  assert.equal(restored.settings.theme.backgroundMedia.length, 2);
  assert.equal(restored.settings.theme.backgroundMedia[0].backgroundImageLocal, image);
  assert.equal(restored.settings.theme.backgroundMedia[1].id, 'old');
  assert.equal(local[DEVICE_WALLPAPERS_KEY].rotationSeconds, 60);

  const again = await restoreDeviceWallpapers(old);
  assert.equal(again.settings.theme.backgroundMedia.length, 2);
});

test('migration keeps a primary local image beside a previously full 24-item list', async () => {
  delete local[DEVICE_WALLPAPERS_KEY];
  const old = migratePersistedData({ schemaVersion: 19, settings: { theme: {
    backgroundImageLocal: image,
    backgroundMedia: Array.from({ length: 24 }, (_, index) => ({
      id: `old-${index}`, type: 'image',
      backgroundImageUrl: `https://example.test/${index}.png`
    }))
  } } });
  const restored = await restoreDeviceWallpapers(old);
  assert.equal(restored.settings.theme.backgroundMedia.length, 25);
  assert.equal(restored.settings.theme.backgroundMedia[0].backgroundImageLocal, image);
  assert.equal(restored.settings.theme.backgroundMedia[24].id, 'old-23');
});

test('migration moves a primary local video and leaves its remote fallback in place', async () => {
  delete local[DEVICE_WALLPAPERS_KEY];
  const old = migratePersistedData({ schemaVersion: 19, settings: { theme: {
    backgroundPrimaryType: 'video',
    backgroundVideo: { url: 'https://example.test/fallback.webm',
      local: video, source: 'local' }
  } } });
  const restored = await restoreDeviceWallpapers(old);
  assert.equal(restored.settings.theme.backgroundVideo.url, 'https://example.test/fallback.webm');
  assert.equal(restored.settings.theme.backgroundVideo.local, null);
  assert.equal(restored.settings.theme.backgroundMedia[0].local, video);
});
