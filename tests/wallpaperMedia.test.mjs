import assert from 'node:assert/strict';
import test from 'node:test';
import { migratePersistedData } from '../src/platform/storage/dataSchema.js';
import { inferWallpaperType, normalizeWallpaperInterval, normalizeWallpaperMedia, normalizeWallpaperUrl } from '../src/domain/settings/wallpaperMedia.js';
import { withoutDeviceImages } from '../src/platform/storage/deviceImageSelections.js';

const image = 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
const video = 'newdesktab-local-video:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';

test('normalizes an ordered mix of remote and local wallpapers', () => {
  const media = normalizeWallpaperMedia([
    { id: 'one', type: 'image', backgroundImageUrl: 'https://example.test/one.jpg' },
    { id: 'two', type: 'image', backgroundImageLocal: image, backgroundImageSource: 'local' },
    { id: 'three', type: 'video', url: 'https://example.test/movie.mp4' },
    { id: 'four', type: 'video', local: video, source: 'local' },
    { id: 'four', type: 'video', url: 'https://example.test/duplicate.mp4' },
    { id: 'bad', type: 'video', url: 'javascript:alert(1)' }
  ]);
  assert.deepEqual(media.map(item => item.id), ['one', 'two', 'three', 'four']);
  assert.equal(media[1].backgroundImageLocal, image);
  assert.equal(media[3].local, video);
  assert.equal(media[3].localPlaceholder, true);
});

test('keeps local video placeholders but never puts device references in Sync', () => {
  const data = migratePersistedData({ settings: { theme: {
    backgroundDefault: false,
    backgroundMedia: [
      { id: 'local', type: 'video', local: video, source: 'local' },
      { id: 'remote', type: 'video', url: 'https://example.test/movie.webm' }
    ],
    backgroundRotationSeconds: 15
  } } });
  const shared = withoutDeviceImages(data);
  assert.equal(shared.settings.theme.backgroundMedia[0].localPlaceholder, true);
  assert.equal(shared.settings.theme.backgroundMedia[0].local, undefined);
  assert.equal(shared.settings.theme.backgroundMedia[0].source, undefined);
  assert.equal(shared.settings.theme.backgroundMedia[1].url, 'https://example.test/movie.webm');
  assert.equal(shared.settings.theme.backgroundRotationSeconds, 15);
});

test('keeps an additional local image slot without syncing its file reference', () => {
  const data = migratePersistedData({ settings: { theme: {
    backgroundMedia: [{ id: 'photo', type: 'image', backgroundImageLocal: image,
      backgroundImageSource: 'local' }]
  } } });
  const shared = withoutDeviceImages(data);
  assert.equal(shared.settings.theme.backgroundMedia[0].id, 'photo');
  assert.equal(shared.settings.theme.backgroundMedia[0].backgroundImageLocal, undefined);
  assert.equal(shared.settings.theme.backgroundMedia[0].backgroundImageSource, undefined);
});

test('rejects unsupported URLs and out-of-range intervals', () => {
  assert.equal(normalizeWallpaperUrl('file:///tmp/movie.mp4', 'video'), null);
  assert.equal(normalizeWallpaperUrl('javascript:alert(1)', 'image'), null);
  assert.equal(normalizeWallpaperInterval(4), 0);
  assert.equal(normalizeWallpaperInterval(0), 0);
  assert.equal(normalizeWallpaperInterval(3600), 3600);
  assert.equal(normalizeWallpaperInterval(86400), 86400);
  assert.equal(normalizeWallpaperInterval(30), 30); // Preserve old choices.
});

test('detects direct video URLs and keeps the primary local video out of Sync', () => {
  assert.equal(inferWallpaperType('https://cdn.test/wallpaper.WEBM?token=1'), 'video');
  assert.equal(inferWallpaperType('https://cdn.test/media?format=mp4'), 'video');
  assert.equal(inferWallpaperType('https://cdn.test/wallpaper.webp'), 'image');
  const data = migratePersistedData({ settings: { theme: {
    backgroundPrimaryType: 'video',
    backgroundVideo: { url: 'https://cdn.test/fallback.mp4', local: video, source: 'local' }
  } } });
  assert.equal(data.settings.theme.backgroundVideo.local, video);
  const shared = withoutDeviceImages(data);
  assert.equal(shared.settings.theme.backgroundVideo.local, undefined);
  assert.equal(shared.settings.theme.backgroundVideo.url, 'https://cdn.test/fallback.mp4');
});
