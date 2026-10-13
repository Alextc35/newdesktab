import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

test('inversion controls appear only when their icon or background image is visible', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    await new Promise(resolve => chrome.storage.local.set({ bookmarks: [{ ...DEFAULT_BOOKMARK,
      id: 'inversion', name: 'Inversion', url: 'https://inversion.internal', iconId: 'mail',
      backgroundFavicon: false, showFavicon: false, gx: 0, gy: 1 }] }, resolve));
  });
  await page.reload();
  await expectAppReady(page);
  await page.evaluate(async () => (await import('/src/features/bookmarks/bookmarkModal.js')).openEditBookmark('inversion'));
  const editor = page.locator('#edit-bookmark-modal');
  await editor.locator('[data-tab-button="style"]').click();
  const iconInvert = editor.locator('[data-field="invertIcon"]');
  const imageInvert = editor.locator('[data-field="invertBg"]');
  await expect(iconInvert).toBeHidden();
  await expect(imageInvert).toBeHidden();
  await editor.locator('[data-field="showFavicon"]').check();
  await expect(iconInvert).toBeVisible();
  await iconInvert.check();
  await editor.locator('[data-field="showFavicon"]').uncheck();
  await expect(iconInvert).toBeHidden();
  await editor.locator('[data-field="backgroundFavicon"]').check();
  await expect(iconInvert).toBeVisible();
  await expect(iconInvert).toBeChecked();
  await editor.locator('.editor-image-section > summary').click();
  const image = editor.locator('[data-field="backgroundImage"]');
  await image.fill('https://image.internal/cover.png');
  await expect(imageInvert).toBeVisible();
  await expect(iconInvert).toBeHidden();
  await image.fill('');
  await expect(imageInvert).toBeHidden();
});
