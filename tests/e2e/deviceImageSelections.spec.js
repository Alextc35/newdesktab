import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1SQAAAABJRU5ErkJggg==',
  'base64'
);

async function openTheme(page) {
  await page.mouse.move(5, page.viewportSize().height / 2);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Theme' }).click();
}

test('personal image stays on its device through shared fallback edits and storage-mode changes', async ({ page }) => {
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await openTheme(page);
  await page.getByRole('button', { name: 'Sync' }).click();
  await page.getByRole('radio', { name: /Synced/ }).check();
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.locator('#settings-theme-bg-image-mode').check();
  await page.locator('#settings-theme-bg-image').fill('https://images.test/fallback.png');
  await page.locator('#settings-theme-more-wallpapers summary').click();
  await page.locator('#settings-theme-media-upload-input').setInputFiles({
    name: 'personal.png', mimeType: 'image/png', buffer: imageBytes
  });
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row')).toContainText('personal.png');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /data:image\//);

  await openTheme(page);
  await page.locator('#settings-theme-bg-image').fill('https://images.test/new-fallback.png');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /data:image\//);
  await page.reload();
  await expectAppReady(page);
  await openTheme(page);
  await page.locator('#settings-theme-more-wallpapers summary').click();
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row')).toContainText('personal.png');
  await expect(page.locator('#settings-theme-bg-image')).toHaveValue('https://images.test/new-fallback.png');

  await page.getByRole('button', { name: 'Sync' }).click();
  await page.getByRole('radio', { name: /This device only/ }).check();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /data:image\//);
});
