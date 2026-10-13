import { expect, test } from './helpers/test.js';
import { expectAppReady } from './helpers/appReady.js';

const storedData = page => page.evaluate(() => new Promise(resolve => {
  chrome.storage.local.get(['bookmarks', 'folders', 'widgets', 'trash', 'settings'], resolve);
}));
const localImageExists = page => page.evaluate(async () => {
  const { getLocalImageName } = await import('/src/platform/images/localImages.js');
  return getLocalImageName(window.clearTestImage) === 'kept-until-confirm.png';
});

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
    const { getState, setState, requirePersistence } = await import('/src/state/appStore.js');
    const { saveLocalImage } = await import('/src/platform/images/localImages.js');
    const { setDailyTipsEnabled } = await import('/src/platform/storage/deviceDailyTips.js');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    window.clearTestImage = await saveLocalImage(new File([blob], 'kept-until-confirm.png', { type: 'image/png' }));
    const bookmark = { ...DEFAULT_BOOKMARK, id: 'clear-bookmark', name: 'Keep until confirmed',
      backgroundImageLocal: window.clearTestImage, backgroundImageSource: 'local', gx: 0, gy: 0 };
    await setState({ data: {
      bookmarks: [bookmark],
      folders: [{ ...DEFAULT_FOLDER_STYLE, id: 'clear-folder', name: 'Folder', gx: 1, gy: 0, w: 1, h: 1 }],
      widgets: [{ id: 'clear-clock', type: 'clock', version: 1, gx: 2, gy: 0, w: 1, h: 1,
        groupId: null, config: { showSeconds: true }, createdAt: 1, updatedAt: 1 }],
      trash: [{ id: 'clear-trash', type: 'bookmark', deletedAt: Date.now(),
        bookmark: { ...bookmark, id: 'deleted-bookmark' } }],
      settings: { ...getState().data.settings, language: 'en', interfaceTheme: 'light' }
    } });
    await requirePersistence();
    await setDailyTipsEnabled(false);
    await new Promise(resolve => chrome.storage.sync.set({ untouchedRemote: 'keep' }, resolve));
  });
  await page.keyboard.press('KeyS');
  await expect(page.locator('#settings-modal')).toBeVisible();
});

test('deleting all device data requires confirmation, clears every collection and persists after reload', async ({ page }) => {
  const before = await storedData(page);
  const remove = page.locator('#delete-all-data-btn-general');
  await remove.click();
  await page.locator('#alert-modal-cancel').click();
  expect(await storedData(page)).toEqual(before);
  expect(await localImageExists(page)).toBe(true);
  await expect(page.locator('#settings-modal')).toBeVisible();
  await remove.click();
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  const cleared = await storedData(page);
  for (const key of ['bookmarks', 'folders', 'widgets', 'trash']) expect(cleared[key]).toEqual([]);
  expect(cleared.settings.interfaceTheme).toBe('system');
  expect(await localImageExists(page)).toBe(false);
  expect(await page.evaluate(() => new Promise(resolve => chrome.storage.sync.get('untouchedRemote', resolve))))
    .toEqual({ untouchedRemote: 'keep' });
  await page.reload();
  await expectAppReady(page);
  expect(await storedData(page)).toEqual(cleared);
  await expect(page.locator('#bookmark-container [data-bookmark-id], #bookmark-container [data-folder-id], #bookmark-container [data-widget-id]')).toHaveCount(0);
});

test('a failed device reset keeps persisted records and files and the delete button can retry', async ({ page }) => {
  const before = await storedData(page);
  await page.evaluate(() => {
    const original = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      if (!items.bookmarks) return original(items, callback);
      chrome.storage.local.set = original;
      chrome.runtime.lastError = { message: 'Simulated reset failure' };
      callback?.();
      chrome.runtime.lastError = null;
    };
  });
  const remove = page.locator('#delete-all-data-btn-general');
  await remove.click();
  await page.locator('#alert-modal-accept').click();
  await expect(remove).toBeEnabled();
  await expect(page.locator('#settings-modal')).toBeVisible();
  expect(await storedData(page)).toEqual(before);
  expect(await localImageExists(page)).toBe(true);
  await remove.click();
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  expect((await storedData(page)).bookmarks).toEqual([]);
  expect(await localImageExists(page)).toBe(false);
});
