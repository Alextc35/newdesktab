import { expect, test } from './helpers/test.js';
import { expectAppReady, expectAppSaved } from './helpers/appReady.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
});

test('storage diagnostics stay idle while editing and load fresh data on keyboard tab navigation', async ({ page }) => {
  await page.evaluate(() => {
    window.quotaReads = 0;
    const original = chrome.storage.local.getBytesInUse;
    chrome.storage.local.getBytesInUse = (keys, callback) => { window.quotaReads++; original(keys, callback); };
  });
  await page.keyboard.press('KeyE');
  await page.evaluate(async () => {
    const { updateBookmarkById } = await import('/src/features/bookmarks/bookmarkActions.js');
    updateBookmarkById('test-developed-by', { name: 'Renamed bookmark' });
  });
  await expectAppSaved(page);
  await expect(page.getByRole('link', { name: 'Renamed bookmark' })).toBeVisible();
  expect(await page.evaluate(() => window.quotaReads)).toBe(0);
  await page.keyboard.press('KeyS');
  await expect(page.locator('#settings-modal')).toBeVisible();
  expect(await page.evaluate(() => window.quotaReads)).toBe(0);
  await page.locator('[data-tab="settings-modal-tab-general"]').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-tab="settings-modal-tab-sync"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#settings-modal-tab-sync')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.quotaReads)).toBeGreaterThan(0);
  await expect(page.locator('#storage-usage-summary')).toContainText('10 MiB');
  await page.locator('#settings-modal-cancel').click();
  const reads = await page.evaluate(() => window.quotaReads);
  await page.keyboard.press('KeyE');
  expect(await page.evaluate(() => window.quotaReads)).toBe(reads);
});

test('a lazily opened icon catalog keeps search, translation and selection through draft edits', async ({ page }) => {
  await page.evaluate(async () => (await import('/src/features/bookmarks/bookmarkModal.js')).openEditBookmark('test-developed-by'));
  const editor = page.locator('#edit-bookmark-modal');
  const picker = editor.locator('.editor-icon-picker');
  await expect(picker.locator('[data-icon-choice]')).toHaveCount(0);
  await editor.locator('[data-tab-button="style"]').click();
  await picker.locator('summary').click();
  await expect(picker.locator('[data-icon-choice]')).toHaveCount(81);
  const search = picker.locator('.editor-icon-search');
  await search.fill('circle');
  await picker.locator('[data-icon-choice="circle"]').click();
  await expect(editor.locator('.bookmark-preview [data-icon-id="circle"]')).toBeVisible();
  await page.evaluate(async () => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language: 'es' }));
  await search.fill('circulo');
  await expect(picker.locator('[data-icon-choice]:not([hidden])')).toHaveCount(1);
  await expect(picker.locator('[data-icon-choice="circle"]')).toHaveAttribute('aria-pressed', 'true');
  await editor.locator('[data-tab-button="general"]').click();
  await editor.locator('#bookmark-modal-form-name').fill('Nuevo nombre');
  await editor.locator('[data-tab-button="style"]').click();
  await expect(editor.locator('.bookmark-preview')).toContainText('Nuevo nombre');
  await expect(picker.locator('[data-icon-choice="circle"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(picker.locator('[data-icon-choice]:not([hidden])')).toHaveCount(1);
  await editor.locator('#edit-bookmark-modal-save').click();
  await expectAppSaved(page);
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('[data-bookmark-id="test-developed-by"] [data-icon-id="circle"]')).toBeVisible();
});

async function seedFolderAndTrash(page) {
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
    const bookmark = { ...DEFAULT_BOOKMARK, id: 'perf-child', name: 'Child', iconId: 'mail',
      folderId: 'perf-folder', groupId: null, gx: 0, gy: 0 };
    await new Promise(resolve => chrome.storage.local.set({
      bookmarks: [bookmark], folders: [{ ...DEFAULT_FOLDER_STYLE, id: 'perf-folder',
        name: 'Performance', groupId: null, gx: 1, gy: 0, w: 1, h: 1 }],
      trash: Array.from({ length: 60 }, (_, i) => ({ id: `perf-trash-${i}`, type: 'bookmark',
        deletedAt: Date.now(), bookmark: { ...bookmark, id: `deleted-${i}`, folderId: null } }))
    }, resolve));
  });
  await page.reload();
  await expectAppReady(page);
}

async function changeOnlyUiState(page) {
  await page.evaluate(async () => {
    const { setState, getState } = await import('/src/state/appStore.js');
    await setState({ ui: { isEditing: !getState().ui.isEditing } });
  });
}

test('folder contents retain their nodes and keyboard focus across unrelated UI updates', async ({ page }) => {
  await seedFolderAndTrash(page);
  await page.evaluate(async () => {
    (await import('/src/features/folders/folderModal.js')).openFolderModal('perf-folder');
    window.initialFolderNode = document.querySelector('#folder-modal-items .bookmark');
  });
  await expect(page.locator('#folder-modal-items .bookmark')).toHaveCount(1);
  const edit = page.locator('#folder-modal-edit-toggle');
  await edit.focus();
  await changeOnlyUiState(page);
  expect(await page.evaluate(() => window.initialFolderNode
    === document.querySelector('#folder-modal-items .bookmark'))).toBe(true);
  await expect(edit).toBeFocused();
});

test('recycle bin copies the library once per snapshot and preserves selected row focus', async ({ page }) => {
  await seedFolderAndTrash(page);
  await page.evaluate(async () => {
    window.libraryCopies = 0;
    const original = window.structuredClone;
    window.structuredClone = value => {
      if (value?.data?.bookmarks) window.libraryCopies++;
      return original(value);
    };
    (await import('/src/features/recycle-bin/recycleBinModal.js')).openRecycleBinModal();
    window.initialTrashNode = document.querySelector('#recycle-bin-list .recycle-bin-item');
  });
  expect(await page.evaluate(() => window.libraryCopies)).toBe(2);
  const checkbox = page.locator('#recycle-bin-list input[type="checkbox"]').first();
  await checkbox.check();
  await checkbox.focus();
  await changeOnlyUiState(page);
  expect(await page.evaluate(() => window.initialTrashNode
    === document.querySelector('#recycle-bin-list .recycle-bin-item'))).toBe(true);
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeFocused();
});
