import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    void setState({ data: { bookmarks: [], folders: [], settings: {
      ...getState().data.settings, language: 'en'
    } } });
  });
  await expect.poll(() => page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getState().ui.persistence.status)).toBe('saved');
});

async function failNextWrite(page) {
  await page.evaluate(() => {
    const original = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      if (!items.bookmarks) return original(items, callback);
      chrome.storage.local.set = original;
      chrome.runtime.lastError = { message: 'Simulated full storage' };
      callback?.();
      chrome.runtime.lastError = null;
    };
  });
}

for (const kind of ['createBookmark', 'editBookmark', 'createFolder', 'editFolder', 'recycleBin', 'settings', 'createClock', 'editClock']) {
  test(`${kind}: failed save keeps the draft open and retry persists one item`, async ({ page }) => {
    await page.evaluate(async scenario => {
      if (scenario === 'editBookmark') {
        const { addBookmark } = await import('/src/features/bookmarks/bookmarkActions.js');
        addBookmark({ id: 'saved-bookmark', name: 'Before', url: 'https://example.internal' });
      }
      if (scenario === 'editFolder') {
        const { createBookmarkFolder } = await import('/src/features/folders/folderActions.js');
        createBookmarkFolder('Before', { columns: 12, rows: 6 });
      }
      if (scenario === 'editClock') {
        const { addWidget } = await import('/src/widgets/widgetActions.js');
        addWidget({ type: 'clock', config: { hourCycle: '24', showSeconds: false } }, { columns: 12, rows: 6 });
      }
      const { requirePersistence } = await import('/src/state/appStore.js');
      await requirePersistence();
      if (scenario.includes('Bookmark')) {
        const { openAddBookmark, openEditBookmark } = await import('/src/features/bookmarks/bookmarkModal.js');
        if (scenario === 'createBookmark') openAddBookmark();
        else openEditBookmark('saved-bookmark');
      } else if (scenario.includes('Folder')) {
        const { openCreateFolder, openFolderEditor } = await import('/src/features/folders/folderEditorModal.js');
        const { getState } = await import('/src/state/appStore.js');
        if (scenario === 'createFolder') openCreateFolder();
        else openFolderEditor(getState().data.folders[0].id);
      } else if (scenario === 'recycleBin') {
        (await import('/src/features/recycle-bin/recycleBinEditorModal.js')).openRecycleBinEditor();
      } else if (scenario.includes('Clock')) {
        const { openCreateClock, openClockEditor } = await import('/src/widgets/builtin/clock/clockSettings.js');
        const { getState } = await import('/src/state/appStore.js');
        if (scenario === 'createClock') openCreateClock();
        else openClockEditor(getState().data.widgets[0].id);
      } else document.getElementById('settings').click();
    }, kind);

    const type = kind.includes('Bookmark') ? 'bookmark' : kind.includes('Folder') ? 'folder'
      : kind === 'recycleBin' ? 'recycle-bin' : kind.includes('Clock') ? 'clock' : 'settings';
    const modal = page.locator(type === 'settings' ? '#settings-modal'
      : type === 'clock' ? '#clock-widget-modal' : `#edit-${type}-modal`);
    const save = modal.locator(type === 'settings' ? '#settings-modal-save'
      : type === 'clock' ? '#clock-widget-save' : `#edit-${type}-modal-save`);
    await expect(modal).toBeVisible();
    if (type === 'bookmark') {
      await modal.locator('#bookmark-modal-form-name').fill('After');
      if (kind === 'createBookmark') await modal.locator('#bookmark-modal-form-url').fill('https://example.internal');
    } else if (type === 'folder') await modal.locator('#folder-editor-name').fill('After');
    else if (type === 'recycle-bin') {
      await modal.getByRole('tab', { name: 'Style', exact: true }).click();
      await modal.locator('[data-appearance-look="midnight"]').click();
    } else if (type === 'clock') await modal.locator('#clock-widget-hour-cycle').selectOption('12');
    else await modal.locator('#language-select').selectOption('es');

    await failNextWrite(page);
    await save.click();
    await expect(modal).toBeVisible();
    await expect(page.locator('.flash-error').last()).toBeVisible();
    await expect(page.locator('.flash-success')).toHaveCount(0);
    await expect(save).toBeEnabled();
    const failed = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState());
    expect(failed.ui.persistence.status).toBe('error');

    await save.click();
    await expect(modal).toBeHidden();
    await page.reload();
    await expectAppReady(page);
    const saved = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
    if (type === 'bookmark' || type === 'folder') {
      const collection = type === 'bookmark' ? 'bookmarks' : 'folders';
      expect(saved[collection]).toHaveLength(1);
      expect(saved[collection][0].id).toBe(failed.data[collection][0].id);
      expect(saved[collection][0].name).toBe('After');
    } else if (type === 'recycle-bin') expect(saved.recycleBin.backgroundColor).toBe('#171717');
    else if (type === 'clock') {
      expect(saved.widgets).toHaveLength(1);
      expect(saved.widgets[0].id).toBe(failed.data.widgets[0].id);
      expect(saved.widgets[0].config.hourCycle).toBe('12');
    } else expect(saved.settings.language).toBe('es');
  });
}

test('clock deletion can retry a failed commit without recreating the widget', async ({ page }) => {
  await page.evaluate(async () => {
    const { addWidget } = await import('/src/widgets/widgetActions.js');
    const { requirePersistence } = await import('/src/state/appStore.js');
    const clock = addWidget({ type: 'clock', config: {} }, { columns: 12, rows: 6 });
    await requirePersistence();
    (await import('/src/widgets/builtin/clock/clockSettings.js')).openClockEditor(clock.id);
  });
  const modal = page.locator('#clock-widget-modal');
  await failNextWrite(page);
  await modal.locator('#clock-widget-delete').click();
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('.flash-error').last()).toBeVisible();
  await expect(modal).toBeVisible();
  await expect(modal.locator('#clock-widget-delete')).toBeEnabled();
  await modal.locator('#clock-widget-delete').click();
  await expect(modal).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data.widgets)).toEqual([]);
});

test('quick save retries its pending bookmark without a duplicate warning or a second record', async ({ page }) => {
  await failNextWrite(page);
  const first = await page.evaluate(async () => {
    const { saveQuickBookmark } = await import('/src/features/quick-save/quickSaveActions.js');
    return saveQuickBookmark({ name: 'Quick save', url: 'https://example.internal' });
  });
  expect(first.reason).toBe('storage-error');
  const retry = await page.evaluate(async () => {
    const { saveQuickBookmark } = await import('/src/features/quick-save/quickSaveActions.js');
    return saveQuickBookmark({ name: 'Quick save renamed', url: 'https://example.internal' });
  });
  expect(retry.reason).toBeNull();
  await page.reload();
  await expectAppReady(page);
  const bookmarks = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data.bookmarks);
  expect(bookmarks).toHaveLength(1);
  expect(bookmarks[0].id).toBe(retry.bookmark.id);
  expect(bookmarks[0].name).toBe('Quick save renamed');
});

test('cancelling settings after a global retry preserves a newly persisted video', async ({ page }) => {
  await page.locator('#settings').evaluate(button => button.click());
  await page.locator('[data-tab="settings-modal-tab-theme"]').click();
  await page.locator('#settings-theme-bg-image-mode').check();
  await page.locator('#settings-theme-media-upload-input').setInputFiles({
    name: 'recover.webm', mimeType: 'video/webm', buffer: Buffer.from('retained video')
  });
  await expect(page.locator('.theme-wallpaper-row')).toContainText('recover.webm');
  await expect(page.locator('#settings-modal-save')).toBeEnabled();
  await failNextWrite(page);
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#persistence-feedback')).toBeVisible();
  await page.locator('#persistence-retry').click();
  await expect(page.locator('#persistence-feedback')).toBeHidden();
  await page.locator('#settings-modal-cancel').click();
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  const video = await page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    const { getLocalVideoName, resolveLocalVideo } = await import('/src/platform/images/localVideos.js');
    const reference = getState().data.settings.theme.backgroundMedia[0].local;
    return { name: getLocalVideoName(reference), text: await fetch(resolveLocalVideo(reference)).then(result => result.text()) };
  });
  expect(video).toEqual({ name: 'recover.webm', text: 'retained video' });
});
