import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    await setState({ data: { bookmarks: [], folders: [], widgets: [], trash: [], settings: {
      ...getState().data.settings, language: 'en', bookmarkGroups: [{ id: 'destination', name: 'Destination' }],
      activeBookmarkGroupId: null
    } }, ui: { isEditing: true } });
    const { addBookmark } = await import('/src/features/bookmarks/bookmarkActions.js');
    const { createBookmarkFolder } = await import('/src/features/folders/folderActions.js');
    const folder = createBookmarkFolder('Folder', { columns: 12, rows: 6 });
    addBookmark({ id: 'one', name: 'One', url: 'https://one.internal', gx: 3, gy: 0 });
    addBookmark({ id: 'child', name: 'Child', url: 'https://child.internal', folderId: folder.id });
    await (await import('/src/state/appStore.js')).requirePersistence();
  });
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

async function expectFailureThenRetry(page) {
  await expect(page.locator('#persistence-feedback')).toBeVisible();
  await expect(page.locator('.flash-success')).toHaveCount(0);
  await page.locator('#persistence-retry').click();
  await expect(page.locator('#persistence-feedback')).toBeHidden();
  await expect(page.locator('.flash-success').last()).toBeVisible();
  await page.reload();
  await expectAppReady(page);
  return page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
}

for (const action of ['duplicate', 'apply-preset', 'delete', 'move']) {
  test(`bulk ${action}: reports failure and retries only the pending write`, async ({ page }) => {
    await page.evaluate(async () => {
      const { getState } = await import('/src/state/appStore.js');
      const { toggleGridItemSelection } = await import('/src/features/grid/gridSelection.js');
      toggleGridItemSelection('bookmark', 'one');
      toggleGridItemSelection('folder', getState().data.folders[0].id);
    });
    await failNextWrite(page);
    if (action === 'move') await page.locator('#bulk-workspace-select').selectOption('destination');
    else await page.locator(`#bulk-${action}`).click();
    if (action === 'delete' || action === 'move') await page.locator('#alert-modal-accept').click();
    const data = await expectFailureThenRetry(page);
    if (action === 'duplicate') {
      expect(data.bookmarks).toHaveLength(4);
      expect(data.folders).toHaveLength(2);
      expect(new Set(data.bookmarks.map(item => item.id)).size).toBe(4);
    } else if (action === 'delete') {
      expect(data.bookmarks).toHaveLength(0);
      expect(data.folders).toHaveLength(0);
      expect(data.trash).toHaveLength(2);
    } else if (action === 'move') {
      expect(data.folders[0].groupId).toBe('destination');
      expect(data.bookmarks.every(item => item.groupId === 'destination')).toBe(true);
    } else {
      expect(data.bookmarks).toHaveLength(2);
      expect(data.folders).toHaveLength(1);
      expect(data.bookmarks.find(item => item.id === 'one').showFavicon).toBe(true);
    }
  });
}

for (const action of ['restore-all', 'restore-selected', 'delete-all', 'delete-selected']) {
  test(`recycle bin ${action}: confirms success after a durable retry`, async ({ page }) => {
    await page.evaluate(async () => {
      const { getState, requirePersistence } = await import('/src/state/appStore.js');
      const { moveGridItemsToRecycleBin } = await import('/src/features/recycle-bin/recycleBinActions.js');
      moveGridItemsToRecycleBin({ bookmarkIds: ['one'], folderIds: [getState().data.folders[0].id] });
      await requirePersistence();
      (await import('/src/features/recycle-bin/recycleBinModal.js')).openRecycleBinModal();
    });
    if (action.endsWith('selected')) {
      await page.locator('.recycle-bin-item input').first().check();
    }
    await failNextWrite(page);
    await page.locator(`#recycle-bin-${action}`).click();
    if (action.startsWith('delete')) await page.locator('#alert-modal-accept').click();
    const data = await expectFailureThenRetry(page);
    expect(data.trash).toHaveLength(action.endsWith('all') ? 0 : 1);
    if (action === 'restore-all') {
      expect(data.bookmarks).toHaveLength(2);
      expect(data.folders).toHaveLength(1);
    } else if (action.startsWith('delete')) {
      expect(data.bookmarks).toHaveLength(0);
      expect(data.folders).toHaveLength(0);
    } else expect(data.bookmarks.length + data.folders.length).toBeGreaterThan(0);
  });
}

test('workspace deletion retries without repeating or resurrecting its contents', async ({ page }) => {
  await page.evaluate(async () => {
    const { setActiveWorkspace } = await import('/src/features/workspaces/workspaceActions.js');
    setActiveWorkspace('destination');
    await (await import('/src/state/appStore.js')).requirePersistence();
  });
  await page.getByRole('navigation', { name: 'Workspace controls' }).hover();
  await page.locator('#workspace-delete').click();
  await failNextWrite(page);
  await page.locator('#alert-modal-accept').click();
  const data = await expectFailureThenRetry(page);
  expect(data.settings.bookmarkGroups).toHaveLength(0);
  expect(data.bookmarks).toHaveLength(2);
});

test('repeating a failed duplicate command persists the original duplicates once', async ({ page }) => {
  await page.evaluate(async () => {
    (await import('/src/features/grid/gridSelection.js')).toggleGridItemSelection('bookmark', 'one');
  });
  await failNextWrite(page);
  await page.locator('#bulk-duplicate').click();
  await expect(page.locator('#persistence-feedback')).toBeVisible();
  await page.locator('#bulk-duplicate').click();
  await expect(page.locator('#persistence-feedback')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  const bookmarks = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data.bookmarks);
  expect(bookmarks).toHaveLength(3);
});
