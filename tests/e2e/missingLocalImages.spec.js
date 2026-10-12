import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { expectAppReady, expectAppSaved } from './helpers/appReady.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1SQAAAABJRU5ErkJggg==';
const missing = 'newdesktab-local-image:2c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
const restored = 'newdesktab-local-image:3c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
const fallback = 'https://images.internal/fallback.png';
const data = page => page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
const allowHarness = route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort();

test.beforeEach(async ({ page }) => {
  await page.route('**/*', allowHarness);
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
});

async function ownImage(page, { wallpaper = false } = {}) {
  return page.evaluate(async ({ png, fallback, wallpaper }) => {
    const { saveLocalImage } = await import('/src/platform/images/localImages.js');
    const reference = await saveLocalImage(new File([Uint8Array.from(atob(png), char => char.charCodeAt(0))], 'owned.png', { type: 'image/png' }));
    const { getState, setState } = await import('/src/state/appStore.js');
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const current = getState().data;
    await setState({ data: { bookmarks: [{ ...DEFAULT_BOOKMARK, id: 'owned', name: 'Owned image', url: 'https://bookmark.internal', gx: 3, gy: 0,
      backgroundFavicon: false, backgroundImageLocal: reference, backgroundImageSource: 'local', backgroundImageUrl: fallback }],
      ...(wallpaper ? { settings: { ...current.settings, theme: { ...current.settings.theme, backgroundMedia: [
        { id: 'owned-wallpaper', type: 'image', backgroundImageLocal: reference, backgroundImageSource: 'local' }
      ] } } } : {}) } });
    return reference;
  }, { png, fallback, wallpaper });
}

test('bookmark imports keep available files, clear missing files immediately and hide empty editor fields', async ({ page }) => {
  const owned = await ownImage(page);
  await page.evaluate(async ({ owned, missing, fallback }) => {
    const { createBookmarksEnvelope } = await import('/src/platform/storage/dataSchema.js');
    const style = { backgroundImageLocal: missing, backgroundImageSource: 'local', backgroundImageUrl: fallback,
      backgroundFavicon: false, textColor: '#123456' };
    const payload = createBookmarksEnvelope([
      { id: 'missing', name: 'Missing image', url: 'https://missing.internal', gx: 2, gy: 0, ...style },
      { id: 'kept', name: 'Kept image', url: 'https://kept.internal', gx: 3, gy: 0, ...style, backgroundImageLocal: owned }
    ], [{ id: 'missing-folder', name: 'Missing folder', gx: 4, gy: 0, ...style }]);
    await (await import('/src/features/bookmarks/bookmarkImportExport.js')).importBookmarks(
      new File([JSON.stringify(payload)], 'bookmarks.json', { type: 'application/json' }));
  }, { owned, missing, fallback });
  await expectAppSaved(page);
  for (const snapshot of [await data(page), await page.evaluate(() => new Promise(resolve => chrome.storage.local.get(null, resolve)))]) {
    expect(snapshot.bookmarks[0].backgroundImageLocal).toBeNull();
    expect(snapshot.bookmarks[0].backgroundImageSource).toBe('url');
    expect(snapshot.bookmarks[0].backgroundImageUrl).toBe(fallback);
    expect(snapshot.bookmarks[0].textColor).toBe('#123456');
    expect(snapshot.bookmarks[1].backgroundImageLocal).toBe(owned);
    expect(snapshot.folders[0].backgroundImageLocal).toBeNull();
  }
  await page.reload();
  await expectAppReady(page);
  const downloaded = page.waitForEvent('download');
  await page.evaluate(async () => (await import('/src/features/bookmarks/bookmarkImportExport.js')).exportBookmarks());
  const exported = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
  expect(exported.format).toBe('newdesktab-bookmarks');
  expect(exported.bookmarks[1].backgroundImageLocal).toBe(owned);
  expect(JSON.stringify(exported)).not.toContain(missing);
  await page.evaluate(async () => (await import('/src/features/bookmarks/bookmarkModal.js')).openEditBookmark('missing'));
  const modal = page.locator('#edit-bookmark-modal');
  await modal.getByRole('tab', { name: 'Style', exact: true }).click();
  await expect(modal.locator('[data-field="backgroundImageLocal"]')).toBeHidden();
  await expect(modal.locator('[data-field="backgroundImage"]')).toHaveValue(fallback);
});

for (const format of ['json', 'zip']) {
  test(`${format} backup restores included images before removing orphan references in all styles`, async ({ page }) => {
    expect(await page.evaluate(async ({ missing, restored, fallback, png, format }) => {
      const { getState } = await import('/src/state/appStore.js');
      const current = getState().data;
      const style = { backgroundImageLocal: missing, backgroundImageSource: 'local', backgroundImageUrl: fallback };
      const imported = { ...current,
        bookmarks: [{ id: 'included', name: 'Included image', url: 'https://included.internal', ...style, backgroundImageLocal: restored }],
        folders: [{ id: 'folder', name: 'Folder', gx: 3, gy: 0, ...style }], recycleBin: { ...current.recycleBin, ...style },
        trash: [{ id: 'deleted', type: 'bookmark', deletedAt: Date.now(), bookmark: { id: 'deleted-bookmark', name: 'Deleted', ...style } }],
        settings: { ...current.settings, bookmarkDefault: { ...current.settings.bookmarkDefault, ...style },
          bookmarkPresets: [{ id: 'preset', name: 'Preset', style }], theme: { ...current.settings.theme,
            backgroundMedia: [{ id: 'fallback', type: 'image', ...style }, { id: 'empty', type: 'image', ...style, backgroundImageUrl: null }] } } };
      const localImages = { [restored]: { dataUrl: `data:image/png;base64,${png}`, name: 'included.png' } };
      const payload = format === 'zip'
        ? await (await import('/src/platform/backup/backupArchive.js')).createBackupArchive(imported, localImages, {})
        : JSON.stringify((await import('/src/platform/storage/dataSchema.js')).createBackupEnvelope(imported, { localImages }));
      return (await import('/src/features/settings/backupActions.js')).importBackup(new File([payload], `backup.${format}`));
    }, { missing, restored, fallback, png, format })).toBe(true);
    const imported = await data(page);
    expect(JSON.stringify(imported)).not.toContain(missing);
    expect(imported.bookmarks[0].backgroundImageLocal).toBe(restored);
    expect(imported.settings.theme.backgroundMedia.map(item => item.id)).toEqual(['fallback']);
    expect(imported.settings.theme.backgroundMedia[0].backgroundImageUrl).toBe(fallback);
    expect(await page.evaluate(async reference => (await import('/src/platform/images/localImages.js')).getLocalImageName(reference), restored)).toBe('included.png');
    const downloaded = page.waitForEvent('download');
    await page.evaluate(async () => (await import('/src/features/settings/backupActions.js')).exportBackup());
    const payload = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
    expect(payload.localImages[restored].name).toBe('included.png');
    expect(JSON.stringify(payload)).not.toContain(missing);
    await page.reload();
    await expectAppReady(page);
    expect((await data(page)).bookmarks[0].backgroundImageLocal).toBe(restored);
    expect((await data(page)).settings.theme.backgroundMedia.map(item => item.id)).toEqual(['fallback']);
  });
}

test('missing cached files clear saved device choices and personal wallpaper rows without export errors', async ({ page }) => {
  const owned = await ownImage(page, { wallpaper: true });
  await page.evaluate(async reference => {
    await new Promise(resolve => chrome.storage.local.remove(`newdesktabLocalImage:${reference.split(':')[1]}`, resolve));
    await (await import('/src/platform/storage/storageFacade.js')).storage.get(null);
  }, owned);
  await expect.poll(async () => (await data(page)).bookmarks[0].backgroundImageLocal).toBeNull();
  const local = await page.evaluate(() => new Promise(resolve => chrome.storage.local.get(null, resolve)));
  expect(local.newdesktabLocalImageSelections['bookmark:owned']).toEqual({ reference: null, source: 'url' });
  expect(local.newdesktabDeviceWallpapers.media).toEqual([]);
  const downloaded = page.waitForEvent('download');
  await page.evaluate(async () => (await import('/src/features/settings/backupActions.js')).exportBackup());
  const payload = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
  expect(payload.localImages).toEqual({});
  expect(payload.data.bookmarks[0].backgroundImageUrl).toBe(fallback);
  expect(JSON.stringify(payload)).not.toContain(owned);
  await expect(page.locator('.flash-error')).toHaveCount(0);
});

test('a synchronized recipient ignores missing device files without changing the shared data or sender image', async ({ page, browser }) => {
  const owned = await ownImage(page);
  await page.evaluate(async () => (await import('/src/state/appStore.js')).changeStorageMode('sync'));
  const shared = await page.evaluate(() => new Promise(resolve => chrome.storage.sync.get(null, resolve)));
  expect(JSON.stringify(shared)).not.toContain(owned);
  const recipientContext = await browser.newContext();
  try {
    const recipient = await recipientContext.newPage();
    await recipient.route('**/*', allowHarness);
    await recipient.addInitScript(({ shared, owned }) => {
      sessionStorage.setItem('newdesktab-test-sync', JSON.stringify(shared));
      sessionStorage.setItem('newdesktab-test-local', JSON.stringify({
        newdesktabStorageMode: 'sync', newdesktabOnboarding: { version: 1, status: 'completed' },
        newdesktabLocalImageSelections: { 'bookmark:owned': { reference: owned, source: 'local' } }
      }));
    }, { shared, owned });
    await recipient.goto('/tests/browser-harness.html');
    await expectAppReady(recipient);
    const received = await data(recipient);
    expect(received.bookmarks[0].backgroundImageLocal).toBeNull();
    expect(received.bookmarks[0].backgroundImageSource).toBe('url');
    expect(received.bookmarks[0].backgroundImageUrl).toBe(fallback);
    expect(await recipient.evaluate(() => new Promise(resolve => chrome.storage.sync.get(null, resolve)))).toEqual(shared);
    expect(await recipient.evaluate(() => new Promise(resolve => chrome.storage.local.get('newdesktabLocalImageSelections', resolve))))
      .toEqual({ newdesktabLocalImageSelections: { 'bookmark:owned': { reference: null, source: 'url' } } });
    expect((await data(page)).bookmarks[0].backgroundImageLocal).toBe(owned);
    expect(await page.evaluate(async reference => (await import('/src/platform/images/localImages.js')).getLocalImageName(reference), owned)).toBe('owned.png');
  } finally { await recipientContext.close(); }
});

test('invalid embedded image bytes still reject the backup before replacing data', async ({ page }) => {
  const before = await data(page);
  expect(await page.evaluate(async ({ restored }) => {
    const { getState } = await import('/src/state/appStore.js');
    const { createBackupEnvelope } = await import('/src/platform/storage/dataSchema.js');
    const payload = createBackupEnvelope({ ...getState().data, bookmarks: [{ id: 'invalid', name: 'Invalid', backgroundImageLocal: restored }] },
      { localImages: { [restored]: { dataUrl: 'invalid image data' } } });
    return (await import('/src/features/settings/backupActions.js')).importBackup(new File([JSON.stringify(payload)], 'invalid.json'));
  }, { restored })).toBe(false);
  expect(await data(page)).toEqual(before);
});
