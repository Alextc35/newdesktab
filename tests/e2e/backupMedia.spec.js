import { readFile } from 'node:fs/promises';
import { expect, test } from './helpers/test.js';
import { expectAppReady } from './helpers/appReady.js';
import { readBackupArchive } from '../../src/platform/backup/backupArchive.js';
import { DATA_SCHEMA_VERSION } from '../../src/platform/storage/schemaVersion.js';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
});

for (const [name, payload] of [
  ['missing data collections', { format: 'newdesktab-backup', data: {} }],
  ['non-object backup data', { format: 'newdesktab-backup', data: 'invalid' }],
  ['invalid daily-tip preference', { format: 'newdesktab-backup', data: { bookmarks: [] },
    devicePreferences: { dailyTipsEnabled: 'false' } }],
  ['duplicate bookmark IDs', { format: 'newdesktab-backup', data: { bookmarks: [
    { id: 'duplicate', name: 'First', url: 'https://first.internal' },
    { id: 'duplicate', name: 'Second', url: 'https://second.internal' }
  ] } }],
  ['future backup version', { format: 'newdesktab-backup', schemaVersion: DATA_SCHEMA_VERSION + 1, data: { bookmarks: [] } }],
  ['discarded development schema 21', { format: 'newdesktab-backup', schemaVersion: 21, data: { bookmarks: [] } }]
]) {
  test(`rejects ${name} without changing stored data or media`, async ({ page }) => {
    const before = await page.evaluate(async () => ({
      data: (await import('/src/state/appStore.js')).getState().data,
      storage: await new Promise(resolve => chrome.storage.local.get(null, resolve))
    }));
    expect(await page.evaluate(async payload => {
      const { importBackup } = await import('/src/features/settings/backupActions.js');
      return importBackup(new File([JSON.stringify(payload)], 'invalid.json', { type: 'application/json' }));
    }, payload)).toBe(false);
    await expect(page.locator('.flash-error').last()).toBeVisible();
    expect(await page.evaluate(async () => ({
      data: (await import('/src/state/appStore.js')).getState().data,
      storage: await new Promise(resolve => chrome.storage.local.get(null, resolve))
    }))).toEqual(before);
    await page.reload();
    await expectAppReady(page);
    expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data))
      .toEqual(before.data);
  });
}

test('rejects duplicate IDs and future versions in bookmark-only imports', async ({ page }) => {
  const before = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
  for (const payload of [
    { format: 'newdesktab-bookmarks', bookmarks: [
      { id: 'duplicate', name: 'First', url: 'https://first.internal' },
      { id: 'duplicate', name: 'Second', url: 'https://second.internal' }
    ] },
    { format: 'newdesktab-bookmarks', schemaVersion: DATA_SCHEMA_VERSION + 1, bookmarks: [] },
    { format: 'newdesktab-bookmarks', schemaVersion: 21, bookmarks: [] }
  ]) {
    await page.evaluate(async payload => {
      const { importBookmarks } = await import('/src/features/bookmarks/bookmarkImportExport.js');
      await importBookmarks(new File([JSON.stringify(payload)], 'invalid.json', { type: 'application/json' }));
    }, payload);
    await expect(page.locator('.flash-error').last()).toBeVisible();
    expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data)).toEqual(before);
  }
  await page.reload();
  await expectAppReady(page);
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data)).toEqual(before);
});

test('a downloaded complete backup restores local images and videos after deleting device data', async ({ page }) => {
  await page.evaluate(async () => {
    await (await import('/src/platform/storage/deviceDailyTips.js')).setDailyTipsEnabled(false);
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
  await expect(page.locator('#export-btn-general')).toBeDisabled();
  await page.locator('#alert-modal-accept').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  await download.saveAs('test-results/media-backup.zip');
  const bytes = await readFile(await download.path());
  const backup = await readBackupArchive(new Blob([bytes]));
  expect(backup.devicePreferences).toEqual({ dailyTipsEnabled: false });
  expect(backup.data.schemaVersion).toBe(DATA_SCHEMA_VERSION);
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
  await page.evaluate(async () => (await import('/src/platform/storage/deviceDailyTips.js')).setDailyTipsEnabled(true));
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
  expect(await page.evaluate(async () => (await import('/src/platform/storage/deviceDailyTips.js')).areDailyTipsEnabled()))
    .toBe(false);
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

test('backup export waits for confirmation and video URLs alone keep it in JSON', async ({ page }) => {
  await page.evaluate(async () => {
    await (await import('/src/platform/storage/deviceDailyTips.js')).setDailyTipsEnabled(false);
    const { getState, setState } = await import('/src/state/appStore.js');
    await setState({ data: { settings: { ...getState().data.settings, theme: {
      ...getState().data.settings.theme, backgroundDefault: true,
      backgroundMedia: [{ id: 'remote', type: 'video', url: 'https://video.internal/wallpaper.webm', source: 'url' }]
    } } } });
  });
  const downloads = [];
  page.on('download', download => downloads.push(download));
  await page.keyboard.press('KeyS');
  await expect(page.locator('#settings-modal')).toBeVisible();
  const exportButton = page.locator('#export-btn-general');
  await exportButton.click();
  await expect(page.locator('#alert-modal-title'))
    .toHaveText('Do you want to export a backup of your data and settings?');
  await expect(exportButton).toBeDisabled();
  expect(downloads).toHaveLength(0);
  await page.locator('#alert-modal-cancel').click();
  await expect(page.locator('#alert-modal')).toBeHidden();
  await expect(exportButton).toBeEnabled();
  expect(downloads).toHaveLength(0);

  await exportButton.click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  expect(downloads).toHaveLength(0);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#alert-modal-accept').click();
  const download = await downloadPromise;
  expect(downloads).toHaveLength(1);
  await expect(exportButton).toBeEnabled();
  await expect(page.locator('#settings-modal')).toBeVisible();
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const payload = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(payload.format).toBe('newdesktab-backup');
  expect(payload.schemaVersion).toBe(DATA_SCHEMA_VERSION);
  expect(payload.data.schemaVersion).toBe(DATA_SCHEMA_VERSION);
  expect(payload.devicePreferences).toEqual({ dailyTipsEnabled: false });
  expect(payload.data.devicePreferences).toBeUndefined();
  expect(payload.localVideos).toEqual({});
  expect(payload.data.settings.theme.backgroundMedia[0].url).toBe('https://video.internal/wallpaper.webm');
  expect(await page.evaluate(async payload => {
    const { setDailyTipsEnabled, areDailyTipsEnabled } = await import('/src/platform/storage/deviceDailyTips.js');
    await setDailyTipsEnabled(true);
    const imported = await (await import('/src/features/settings/backupActions.js')).importBackup(
      new File([JSON.stringify(payload)], 'restored.json', { type: 'application/json' }));
    return { imported, enabled: await areDailyTipsEnabled() };
  }, payload)).toEqual({ imported: true, enabled: false });
  await page.reload();
  await expectAppReady(page);
  expect(await page.evaluate(async () => (await import('/src/platform/storage/deviceDailyTips.js')).areDailyTipsEnabled()))
    .toBe(false);
});

test('older JSON and ZIP backups retain the current daily-tip preference', async ({ page }) => {
  for (const archive of [false, true]) {
    for (const enabled of [false, true]) {
      expect(await page.evaluate(async ({ archive, enabled }) => {
        const { setDailyTipsEnabled, areDailyTipsEnabled } = await import('/src/platform/storage/deviceDailyTips.js');
        const { createBackupEnvelope } = await import('/src/platform/storage/dataSchema.js');
        const { getState } = await import('/src/state/appStore.js');
        await setDailyTipsEnabled(enabled);
        const file = archive
          ? new File([await (await import('/src/platform/backup/backupArchive.js'))
            .createBackupArchive(getState().data, {}, {})], 'old.zip', { type: 'application/zip' })
          : new File([JSON.stringify(createBackupEnvelope(getState().data))], 'old.json', { type: 'application/json' });
        const imported = await (await import('/src/features/settings/backupActions.js')).importBackup(file);
        return { imported, enabled: await areDailyTipsEnabled() };
      }, { archive, enabled })).toEqual({ imported: true, enabled });
    }
  }
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
