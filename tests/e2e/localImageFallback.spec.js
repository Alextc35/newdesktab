import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

const fallbackUrl = 'https://images.test/fallback.png';
const imageFile = {
  name: 'local-background.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1SQAAAABJRU5ErkJggg==',
    'base64'
  )
};

for (const kind of ['bookmark', 'folder']) {
  test(`${kind} preserves its URL through local upload, reload and removal`, async ({ page }) => {
    await page.route(fallbackUrl, route => route.fulfill({
      contentType: 'image/png', body: imageFile.buffer
    }));
    await page.goto('/tests/browser-harness.html');
    await expectAppReady(page);
    await expect(page.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();
    await page.evaluate(() => new Promise(resolve => {
      chrome.storage.local.set({
        bookmarks: [{
          id: 'image-bookmark', name: 'Image bookmark', url: '',
          backgroundFavicon: false, noBackground: false,
          backgroundColor: '#334155', gx: 0, gy: 0
        }],
        folders: [{ id: 'image-folder', name: 'Image folder', gx: 1, gy: 0 }]
      }, resolve);
    }));
    await page.reload();

    const isBookmark = kind === 'bookmark';
    const modal = page.locator(isBookmark ? '#edit-bookmark-modal' : '#edit-folder-modal');
    const imageUrlField = modal.locator(
      isBookmark ? '[data-field="backgroundImageUrlField"]' : '#folder-editor-image-url-field'
    );
    const imageSourceField = modal.locator(
      isBookmark ? '[data-field="backgroundImageSourceField"]' : '#folder-editor-image-source-field'
    );
    const imageSource = modal.locator(
      isBookmark ? '[data-field="backgroundImageSource"]' : '#folder-editor-image-source'
    );
    const imageUrl = modal.locator(isBookmark ? '[data-field="backgroundImage"]' : '#folder-editor-image');
    const imageUrlColor = modal.locator(
      isBookmark ? '[data-field="backgroundColor"]' : '#folder-editor-color'
    );
    const localInput = modal.locator(isBookmark ? '[data-field="backgroundImageLocal"]' : '#folder-editor-image-local');
    const localColor = modal.locator(
      isBookmark ? '[data-field="backgroundImageLocalColor"]' : '#folder-editor-local-color'
    );
    const imageLock = modal.locator(
      isBookmark ? '[data-field="bgToggle"]' : '#folder-editor-image-toggle'
    );
    const upload = modal.locator(isBookmark ? '[data-field="bgUploadInput"]' : '#folder-editor-image-upload-input');
    const save = modal.locator(isBookmark ? '#edit-bookmark-modal-save' : '#edit-folder-modal-save');
    const preview = modal.locator(isBookmark ? '.bookmark-preview .bookmark' : '.folder-editor-preview-card');
    const cssProperty = isBookmark ? '--bookmark-bg-image' : '--folder-bg-image';
    const colorProperty = isBookmark ? '--color-bg-bookmark' : '--folder-color';
    const card = page.locator(isBookmark ? '#bookmark-container > [data-bookmark-id="image-bookmark"]' : '#bookmark-container > [data-folder-id="image-folder"]');
    const expectBackgroundImage = async (target, source) => {
      if (isBookmark) {
        await expect(target).toHaveCSS(cssProperty,
          source instanceof RegExp ? source : `url("${source}")`);
      } else {
        await expect(target.locator('.folder-svg pattern image'))
          .toHaveAttribute('href', source);
      }
    };

    const openEditor = async () => {
      if (isBookmark) {
        const menu = page.locator('#floating-menu');
        await page.mouse.move(5, page.viewportSize().height / 2);
        await expect.poll(async () => (await menu.boundingBox()).x).toBeGreaterThanOrEqual(0);
        await page.locator('#edit-toggle-mode').click();
        await card.getByRole('button', { name: 'Edit bookmark' }).click();
      } else {
        await card.getByRole('button', { name: /Open Image folder/ }).click();
        await page.getByRole('button', { name: 'Customize folder' }).click();
      }
      await modal.getByRole('tab', { name: 'Style' }).click();
    };

    await openEditor();
    await expect(localInput).toBeHidden();
    await expect(imageUrlField).toBeVisible();
    await imageUrl.fill(fallbackUrl);
    await imageLock.click();
    await expect(imageUrlColor).toBeDisabled();
    await upload.setInputFiles(imageFile);
    await expect(localInput).toHaveValue(imageFile.name);
    await expect(imageSourceField).toBeVisible();
    await expect(imageSource).toHaveValue('local');
    await expect(imageUrlField).toBeHidden();
    await expect(imageUrl).toHaveValue(fallbackUrl);
    await expect(localColor).toBeVisible();
    await expect(localColor).toBeEnabled();
    await localColor.fill('#7c3aed');
    await expect(imageUrlColor).toHaveValue('#7c3aed');
    await expectBackgroundImage(preview, /data:image\/webp/);
    await expect(preview).toHaveCSS(colorProperty, '#7c3aed');
    await imageSource.selectOption('url');
    await expect(imageUrlField).toBeVisible();
    await expect(localInput).toBeHidden();
    await expectBackgroundImage(preview, fallbackUrl);
    await imageSource.selectOption('local');
    await expect(imageUrlField).toBeHidden();
    await expect(localInput).toBeVisible();
    await expectBackgroundImage(preview, /data:image\/webp/);
    await save.click();
    await expect(modal).toBeHidden();
    await page.reload();
    await expectBackgroundImage(card, /data:image\/webp/);
    await expect(card).toHaveCSS(colorProperty, '#7c3aed');

    await openEditor();
    await expect(localInput).toHaveValue(imageFile.name);
    await expect(localColor).toHaveValue('#7c3aed');
    await expect(imageSource).toHaveValue('local');
    await expect(imageUrlField).toBeHidden();
    await expect(imageUrl).toHaveValue(fallbackUrl);
    await modal.getByRole('button', { name: 'Remove local image' }).click();
    await expect(localInput).toBeHidden();
    await expect(imageUrlField).toBeVisible();
    await expect(imageUrl).toHaveValue(fallbackUrl);
    await expect(imageUrlColor).toHaveValue('#7c3aed');
    await expect(imageUrlColor).toBeDisabled();
    await expectBackgroundImage(preview, fallbackUrl);
    await save.click();
    await expect(modal).toBeHidden();
    await page.reload();
    await expectBackgroundImage(card, fallbackUrl);
    await openEditor();
    await expect(localInput).toBeHidden();
    await expect(imageUrlField).toBeVisible();
    await expect(imageUrl).toHaveValue(fallbackUrl);
    await expect(imageUrlColor).toHaveValue('#7c3aed');
    await expect(imageUrlColor).toBeDisabled();
  });
}
