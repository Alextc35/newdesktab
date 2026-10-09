import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

test('a downloaded complete backup restores local images and videos after deleting device data', async ({ page }) => {
  await page.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
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
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async () => (await import('/src/features/settings/backupActions.js')).exportBackup());
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup.format).toBe('newdesktab-backup');
  const imageReference = backup.data.bookmarks[0].backgroundImageLocal;
  const videoReference = backup.data.settings.theme.backgroundMedia[0].local;
  expect(backup.localImages[imageReference].name).toBe('cover.png');
  expect(backup.localVideos[videoReference].name).toBe('motion.webm');
  expect(backup.localVideos[videoReference].dataUrl).toBe('data:video/webm;base64,dmlkZW8gZml4dHVyZQ==');

  await page.evaluate(async () => (await import('/src/state/appStore.js')).clearAllLocalData());
  await expect(page.locator('[data-bookmark-id="backup-media"]')).toHaveCount(0);
  const restored = await page.evaluate(async payload => {
    const { importBackup } = await import('/src/features/settings/backupActions.js');
    return importBackup(new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' }));
  }, backup);
  expect(restored).toBe(true);
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
  expect(media.videoData).toBe(backup.localVideos[videoReference].dataUrl);
});
