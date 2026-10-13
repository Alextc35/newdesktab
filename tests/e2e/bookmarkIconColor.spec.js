import { expect, test } from './helpers/test.js';
import { expectAppReady, expectAppSaved } from './helpers/appReady.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    await new Promise(resolve => chrome.storage.local.set({ bookmarks: [{ ...DEFAULT_BOOKMARK,
      id: 'colored-bookmark', name: 'SVG color', url: 'https://color.internal',
      gx: 0, gy: 1, iconId: 'code', textColor: '#000000', noBackground: false,
      backgroundFavicon: false, backgroundColor: '#ffffff' }] }, resolve));
  });
  await page.reload();
  await expectAppReady(page);
});

async function openEditor(page) {
  await page.evaluate(async () => (await import('/src/features/bookmarks/bookmarkModal.js'))
    .openEditBookmark('colored-bookmark'));
  const editor = page.locator('#edit-bookmark-modal');
  await editor.locator('[data-tab-button="style"]').click();
  return editor;
}

async function pickColor(editor, color) {
  await editor.locator('[data-field="iconColor"]').scrollIntoViewIfNeeded();
  await editor.locator('[data-field="iconColor"]').click();
  const popover = editor.locator('.app-color-picker:not([hidden])');
  await expect(popover).toBeVisible();
  await popover.locator(`[data-color="${color.toLowerCase()}"]`).click();
  await popover.locator('.app-color-picker-close').click();
}

test('changes SVG color independently of text, supports undo and persists to grid, list and trash', async ({ page }, testInfo) => {
  const editor = await openEditor(page);
  const previewIcon = editor.locator('.bookmark-preview .catalog-icon');
  await pickColor(editor, '#EF4444');
  await expect(previewIcon).toHaveCSS('color', 'rgb(239, 68, 68)');
  await expect(editor.locator('.bookmark-preview .bookmark-title')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await editor.locator('[data-editor-history="undo"]').click();
  await expect(previewIcon).toHaveCSS('color', 'rgb(0, 0, 0)');
  await editor.locator('[data-editor-history="redo"]').click();
  await expect(previewIcon).toHaveCSS('color', 'rgb(239, 68, 68)');
  await editor.locator('.editor-icon-picker').scrollIntoViewIfNeeded();
  await editor.locator('.editor-icon-group').screenshot({ path: testInfo.outputPath('icon-color.png') });
  await editor.locator('#edit-bookmark-modal-save').click();
  await expectAppSaved(page);
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('[data-bookmark-id="colored-bookmark"] .catalog-icon'))
    .toHaveCSS('color', 'rgb(239, 68, 68)');
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data.bookmarks[0]))
    .toMatchObject({ iconColor: '#ef4444', textColor: '#000000' });
  await page.setViewportSize({ width: 430, height: 800 });
  await expect(page.locator('[data-bookmark-id="colored-bookmark"] .catalog-icon'))
    .toHaveCSS('color', 'rgb(239, 68, 68)');
  await page.evaluate(async () => (await import('/src/features/recycle-bin/recycleBinActions.js'))
    .moveBookmarksToRecycleBin(['colored-bookmark']));
  await expectAppSaved(page);
  await page.evaluate(async () => (await import('/src/features/recycle-bin/recycleBinModal.js')).openRecycleBinModal());
  await expect(page.locator('#recycle-bin-list .catalog-icon')).toHaveCSS('color', 'rgb(239, 68, 68)');
});

test('shows the color directly below the SVG picker and hides it for the official logo', async ({ page }) => {
  const editor = await openEditor(page);
  const row = editor.locator('.bookmark-symbol-color');
  const picker = editor.locator('.editor-icon-picker');
  await expect(row).toBeVisible();
  expect(await picker.evaluate(element => element.nextElementSibling.classList.contains('bookmark-symbol-color'))).toBe(true);
  await pickColor(editor, '#22C55E');
  await picker.locator('summary').click();
  await picker.locator('[data-icon-choice=""]').click();
  await expect(row).toBeHidden();
  await picker.locator('[data-icon-choice="code"]').click();
  await expect(row).toBeVisible();
  await expect(editor.locator('[data-field="iconColor"]')).toHaveValue('#22c55e');
  await editor.locator('.editor-reset-appearance').click();
  await expect(row).toBeHidden();
  await picker.locator('[data-icon-choice="code"]').click();
  await expect(editor.locator('.bookmark-preview .catalog-icon')).not.toHaveCSS('color', 'rgb(34, 197, 94)');
});
