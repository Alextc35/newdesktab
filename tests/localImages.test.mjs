import assert from 'node:assert/strict';
import test from 'node:test';
import {
  preloadLocalImages,
  resolveBackgroundImage,
  resolveImageSource,
  cleanMissingLocalImageReferences,
  restoreReferencedLocalImages
} from '../src/platform/images/localImages.js';
import { normalizeBackgroundImage } from '../src/shared/images/backgroundImage.js';

test('uses the URL when a local file is missing, and prefers it only after the file is loaded', async () => {
  const reference = 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
  const background = {
    backgroundImageLocal: reference,
    backgroundImageUrl: 'https://images.test/animated.gif'
  };
  assert.equal(resolveBackgroundImage(background), background.backgroundImageUrl);
  assert.equal(resolveBackgroundImage({ backgroundImageLocal: reference }), null);
  assert.equal(resolveBackgroundImage({ backgroundImageUrl: reference }), null);

  const image = 'data:image/webp;base64,c2FtcGxl';
  globalThis.chrome = {
    runtime: { lastError: null },
    storage: { local: { get(_keys, callback) {
      callback({ 'newdesktabLocalImage:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9': { dataUrl: image } });
    } } }
  };
  try {
    await preloadLocalImages(background);
    assert.equal(resolveBackgroundImage(background), image);
    assert.equal(resolveBackgroundImage({
      ...background,
      backgroundImageSource: 'url'
    }), background.backgroundImageUrl);
    assert.equal(resolveBackgroundImage({
      ...background,
      backgroundImageSource: 'local'
    }), image);
    assert.equal(resolveBackgroundImage({ ...background, backgroundImageLocal: null }), background.backgroundImageUrl);
  } finally {
    delete globalThis.chrome;
  }
});

test('cleans missing references throughout imported data, preserves local files and URL fallbacks', async () => {
  const owned = 'newdesktab-local-image:1c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
  const missing = 'newdesktab-local-image:2c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
  const storage = { 'newdesktabLocalImage:1c5b9a2e-3f0e-4c7e-889c-72117afc09e9': {
    dataUrl: 'data:image/png;base64,c2FtcGxl', name: 'owned.png'
  } };
  globalThis.chrome = { runtime: { lastError: null }, storage: { local: {
    get(keys, callback) { callback(Object.fromEntries(keys.filter(key => Object.hasOwn(storage, key)).map(key => [key, storage[key]]))); }
  } } };
  try {
    const style = { backgroundImageLocal: missing, backgroundImageSource: 'local',
      backgroundImageUrl: 'https://images.test/fallback.png', textColor: '#123456' };
    const original = { bookmarks: [{ ...style }, { ...style, backgroundImageLocal: owned }],
      folders: [{ ...style }], recycleBin: { ...style }, trash: [{ folder: { ...style }, bookmarks: [{ ...style }] }],
      settings: { bookmarkDefault: { ...style }, bookmarkPresets: [{ style: { ...style } }], theme: {
        ...style, backgroundMedia: [{ id: 'fallback', type: 'image', ...style },
          { id: 'empty', type: 'image', ...style, backgroundImageUrl: null }]
      } } };
    const cleaned = await cleanMissingLocalImageReferences(original);
    assert.equal(JSON.stringify(cleaned).includes(missing), false);
    assert.equal(original.bookmarks[0].backgroundImageLocal, missing);
    assert.equal(cleaned.bookmarks[0].backgroundImageSource, 'url');
    assert.equal(cleaned.bookmarks[0].backgroundImageUrl, style.backgroundImageUrl);
    assert.equal(cleaned.bookmarks[0].textColor, style.textColor);
    assert.equal(cleaned.bookmarks[1].backgroundImageLocal, owned);
    assert.deepEqual(cleaned.settings.theme.backgroundMedia.map(item => item.id), ['fallback']);
    delete storage['newdesktabLocalImage:1c5b9a2e-3f0e-4c7e-889c-72117afc09e9'];
    const afterDeletion = await cleanMissingLocalImageReferences(cleaned);
    assert.equal(afterDeletion.bookmarks[1].backgroundImageLocal, null);
    assert.equal(resolveImageSource(owned), null);
  } finally { delete globalThis.chrome; }
});

test('restores provided backup files before cleaning absent ones and still rejects invalid embedded images', async () => {
  const owned = 'newdesktab-local-image:3c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
  const missing = 'newdesktab-local-image:5c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
  const storage = {};
  globalThis.chrome = { runtime: { lastError: null }, storage: { local: {
    get(keys, callback) {
      const requested = keys === null ? Object.keys(storage) : keys;
      callback(Object.fromEntries(requested.filter(key => Object.hasOwn(storage, key)).map(key => [key, storage[key]])));
    },
    set(values, callback) { Object.assign(storage, values); callback(); }
  } } };
  try {
    const data = { bookmarks: [{ backgroundImageLocal: owned }, { backgroundImageLocal: missing }] };
    await restoreReferencedLocalImages(data, { [owned]: { dataUrl: 'data:image/png;base64,c2FtcGxl', name: 'restored.png' } });
    const cleaned = await cleanMissingLocalImageReferences(data);
    assert.equal(cleaned.bookmarks[0].backgroundImageLocal, owned);
    assert.equal(cleaned.bookmarks[1].backgroundImageLocal, null);
    const before = structuredClone(storage);
    await assert.rejects(restoreReferencedLocalImages(data, { [owned]: { dataUrl: 'invalid' } }), { code: 'LOCAL_IMAGE_INVALIDBACKUP' });
    assert.deepEqual(storage, before);
  } finally { delete globalThis.chrome; }
});

test('does not allow URLs or image bytes in the local reference field', () => {
  for (const invalid of ['https://images.test/local.png', 'data:image/png;base64,c2FtcGxl', {}, 7]) {
    assert.equal(normalizeBackgroundImage({ backgroundImageLocal: invalid }).backgroundImageLocal, null);
  }
  assert.equal(normalizeBackgroundImage({}).backgroundImageSource, 'url');
  assert.equal(normalizeBackgroundImage({
    backgroundImageLocal: 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9'
  }).backgroundImageSource, 'local');
});
