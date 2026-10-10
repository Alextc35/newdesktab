import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';
import { readBackupArchive } from '../../src/platform/backup/backupArchive.js';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
});

test('a downloaded complete backup restores local images and videos after deleting device data', async ({ page }) => {
  await page.evaluate(async () => {
    const { saveLocalImage } = await import('/src/platform/images/localImages.js');
    const { saveLocalVideo } = await import('/src/platform/images/localVideos.js');
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { getState, setState } = await import('/src/state/appStore.js');
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1SQAAAABJRU5ErkJggg=='), char => char.charCodeAt(0));
    const image = await saveLocalImage(new File([png], 'cover.png', { type: 'image/png' }));
    const video = await saveLocalVideo(new File(['video fixture'], 'motion.webm', { type: 'video/webm' }));
    const settings = getState().data.settings;
    await setState({ data: {
      bookmarks: [{ ...DEFAULT_BOOKMARK, id: 'backup-media', name: 'Backup media',
        url: 'https://example.internal', backgroundFavicon: false,
        backgroundImageLocal: image, backgroundImageSource: 'local' }],
      settings: { ...settings, theme: { ...settings.theme, backgroundDefault: false,
        backgroundMedia: [{ id: 'motion', type: 'video', local: video, source: 'local', backgroundColor: '#123456' }] } }
    } });
  });
  await page.evaluate(() => document.getElementById('settings').click());
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-btn-general').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  await download.saveAs('test-results/media-backup.zip');
  const bytes = await readFile(await download.path());
  const backup = await readBackupArchive(new Blob([bytes]));
  const imageReference = backup.data.bookmarks[0].backgroundImageLocal;
  const videoReference = backup.data.settings.theme.backgroundMedia[0].local;
  expect(backup.localImages[imageReference].name).toBe('cover.png');
  expect(backup.localVideos[videoReference].name).toBe('motion.webm');
  expect(await backup.localVideos[videoReference].blob.text()).toBe('video fixture');
  expect(bytes.includes(Buffer.from('data:video/webm;base64,'))).toBe(false);
  await expect(page.locator('#export-btn-general')).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-modal')).toBeHidden();

  await page.evaluate(async () => (await import('/src/state/appStore.js')).clearAllLocalData());
  await expect(page.locator('[data-bookmark-id="backup-media"]')).toHaveCount(0);
  // Restore through the real ZIP file picker, confirmation and settings lifecycle.
  await page.evaluate(() => document.getElementById('settings').click());
  await expect(page.locator('#import-input-general')).toHaveAttribute('accept', /\.zip/);
  await page.locator('#import-input-general').setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer: bytes });
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('[data-bookmark-id="backup-media"]')).toBeVisible();
  const media = await page.evaluate(async ({ image, video }) => {
    const { getLocalImageName, resolveBackgroundImage } = await import('/src/platform/images/localImages.js');
    const { getLocalVideoName, resolveLocalVideo, exportReferencedLocalVideos } = await import('/src/platform/images/localVideos.js');
    const { getState } = await import('/src/state/appStore.js');
    return {
      imageName: getLocalImageName(image),
      imageData: resolveBackgroundImage(getState().data.bookmarks[0]),
      videoName: getLocalVideoName(video),
      videoUrl: resolveLocalVideo(video),
      videoData: (await exportReferencedLocalVideos(getState().data))[video].dataUrl
    };
  }, { image: imageReference, video: videoReference });
  expect(media.imageName).toBe('cover.png');
  expect(media.imageData).toMatch(/^data:image\//);
  expect(media.videoName).toBe('motion.webm');
  expect(media.videoUrl).toMatch(/^blob:/);
  expect(media.videoData).toBe('data:video/webm;base64,dmlkZW8gZml4dHVyZQ==');
});

test('video URLs alone keep the complete backup in JSON', async ({ page }) => {
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    await setState({ data: { settings: { ...getState().data.settings, theme: {
      ...getState().data.settings.theme, backgroundDefault: true,
      backgroundMedia: [{ id: 'remote', type: 'video', url: 'https://video.internal/wallpaper.webm', source: 'url' }]
    } } } });
  });
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async () => (await import('/src/features/settings/backupActions.js')).exportBackup());
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const payload = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(payload.format).toBe('newdesktab-backup');
  expect(payload.localVideos).toEqual({});
  expect(payload.data.settings.theme.backgroundMedia[0].url).toBe('https://video.internal/wallpaper.webm');
});

test('legacy JSON backups still restore embedded local videos', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const { createBackupEnvelope } = await import('/src/platform/storage/dataSchema.js');
    const { getState } = await import('/src/state/appStore.js');
    const reference = 'newdesktab-local-video:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
    const state = getState().data;
    const payload = createBackupEnvelope({ ...state, settings: { ...state.settings, theme: {
      ...state.settings.theme, backgroundMedia: [{ id: 'legacy', type: 'video', local: reference, source: 'local' }]
    } } }, { localVideos: { [reference]: { name: 'legacy.webm', dataUrl: 'data:video/webm;base64,bGVnYWN5' } } });
    return (await import('/src/features/settings/backupActions.js')).importBackup(
      new File([JSON.stringify(payload)], 'legacy.json', { type: 'application/json' }));
  })).toBe(true);
  await page.reload();
  await expectAppReady(page);
  const restored = await page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    const { resolveLocalVideo, getLocalVideoName } = await import('/src/platform/images/localVideos.js');
    const reference = getState().data.settings.theme.backgroundMedia[0].local;
    return { name: getLocalVideoName(reference), text: await (await fetch(resolveLocalVideo(reference))).text() };
  });
  expect(restored).toEqual({ name: 'legacy.webm', text: 'legacy' });
});

test('damaged ZIP videos fail without changing the current workspace', async ({ page }) => {
  const data = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
  const { createBackupArchive } = await import('../../src/platform/backup/backupArchive.js');
  const reference = 'newdesktab-local-video:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
  const changed = { ...data, bookmarks: [], settings: { ...data.settings, theme: {
    ...data.settings.theme, backgroundMedia: [{ id: 'bad', type: 'video', local: reference, source: 'local' }]
  } } };
  const bytes = Buffer.from(await (await createBackupArchive(changed, {}, { [reference]: {
    blob: new Blob(['corrupted video fixture'], { type: 'video/webm' }), name: 'bad.webm'
  } })).arrayBuffer());
  const offset = bytes.indexOf(Buffer.from('corrupted video fixture'));
  expect(offset).toBeGreaterThan(0);
  bytes[offset] ^= 1;
  const result = await page.evaluate(async bytes => {
    return (await import('/src/features/settings/backupActions.js')).importBackup(
      new File([new Uint8Array(bytes)], 'bad.zip', { type: 'application/zip' }));
  }, [...bytes]);
  expect(result).toBe(false);
  await expect(page.locator('.flash-error').last()).toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data)).toEqual(data);
});
