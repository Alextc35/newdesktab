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

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
});

test('rotates ordered URL wallpapers and restores them after reload', async ({ page }) => {
  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await page.locator('#settings-theme-bg-image').fill('https://images.test/first.png');
  await expect(page.locator('#settings-theme-more-wallpapers')).not.toHaveAttribute('open', '');
  await page.locator('#settings-theme-more-wallpapers summary').click();
  await page.locator('#settings-theme-media-url').fill('https://images.test/second.png');
  await page.locator('#settings-theme-media-add').click();
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row')).toHaveCount(1);
  await expect(page.locator('#settings-theme-preview-count')).toHaveText('1 / 2');
  await page.locator('#settings-theme-preview-next').click();
  await expect(page.locator('#settings-theme-bg-preview')).toHaveCSS('background-image', /second\.png/);
  await page.locator('#settings-theme-media-interval').selectOption('5');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /first\.png/);
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /second\.png/, { timeout: 7000 });
  await page.reload();
  await expectAppReady(page);
  await openTheme(page);
  await page.locator('#settings-theme-more-wallpapers summary').click();
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row')).toHaveCount(1);
  await expect(page.locator('#settings-theme-media-interval')).toHaveValue('5');
});

test('keeps a local video on this device without putting its reference in Sync', async ({ page }) => {
  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await page.locator('#settings-theme-bg-upload-input').setInputFiles({
    name: 'wallpaper.webm', mimeType: 'video/webm', buffer: Buffer.from('video fixture')
  });
  await expect(page.locator('#settings-theme-bg-local')).toHaveValue('wallpaper.webm');
  await expect(page.locator('#settings-theme-preview-video')).toBeVisible();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#page-wallpaper-video')).toBeVisible();
  await expect(page.locator('#page-wallpaper-video')).toHaveAttribute('src', /^blob:/);
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('#page-wallpaper-video')).toHaveAttribute('src', /^blob:/);
  await openTheme(page);
  await page.getByRole('button', { name: 'Sync' }).click();
  await expect(page.locator('[data-storage-video-usage]:visible')).toContainText('13 B');
  await page.getByRole('radio', { name: /Synced/ }).check();
  await page.locator('#settings-modal-save').click();
  const syncData = await page.evaluate(() => sessionStorage.getItem('newdesktab-test-sync'));
  expect(syncData).not.toContain('newdesktab-local-video:');
  const result = await page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    const { withoutDeviceImages } = await import('/src/platform/storage/deviceImageSelections.js');
    const shared = withoutDeviceImages(getState().data);
    return JSON.stringify(shared.settings.theme.backgroundVideo);
  });
  expect(result).not.toContain('newdesktab-local-video:');
});

test('accepts a video URL as the only wallpaper', async ({ page }) => {
  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await page.locator('#settings-theme-bg-image').fill('https://video.test/wallpaper.mp4');
  await expect(page.locator('#settings-theme-preview-video')).toHaveAttribute('src', 'https://video.test/wallpaper.mp4');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#page-wallpaper-video')).toHaveAttribute('src', 'https://video.test/wallpaper.mp4');
});

test('orders URL images, colors transparent backgrounds and previews on hover', async ({ page }) => {
  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await page.locator('#settings-theme-more-wallpapers summary').click();
  await page.locator('#settings-theme-media-url').fill('https://images.test/first.png');
  await page.locator('#settings-theme-media-add').click();
  await page.locator('#settings-theme-media-url').fill('https://images.test/second.png');
  await page.locator('#settings-theme-media-add').click();
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row')).toHaveCount(2);
  await page.locator('#settings-theme-media-list .theme-wallpaper-row').nth(1)
    .locator('input[type="color"]').fill('#123456');
  await page.locator('#settings-theme-media-list .theme-wallpaper-row').nth(1)
    .getByRole('button', { name: 'Preview wallpaper' }).hover();
  await expect(page.locator('.theme-wallpaper-peek:visible')).toHaveCSS('background-image', /second\.png/);
  await expect(page.locator('.theme-wallpaper-peek:visible')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  const previewLayout = await page.evaluate(() => {
    const row = document.querySelectorAll('#settings-theme-media-list .theme-wallpaper-row')[1];
    const viewport = document.querySelector('#bookmark-viewport').getBoundingClientRect();
    const previewElement = document.querySelector('#settings-theme-bg-preview');
    const peekElement = row.querySelector('.theme-wallpaper-peek');
    const preview = previewElement.getBoundingClientRect();
    const peek = peekElement.getBoundingClientRect();
    return {
      colorFirst: row.firstElementChild.matches('input[type="color"]'),
      viewportRatio: viewport.width / viewport.height,
      previewRatio: preview.width / preview.height,
      peekRatio: peek.width / peek.height,
      sameCrop: ['backgroundSize', 'backgroundPosition', 'backgroundRepeat'].every(property =>
        getComputedStyle(previewElement)[property] === getComputedStyle(peekElement)[property])
    };
  });
  expect(previewLayout.colorFirst).toBe(true);
  expect(previewLayout.previewRatio).toBeCloseTo(previewLayout.viewportRatio, 1);
  expect(previewLayout.peekRatio).toBeCloseTo(previewLayout.viewportRatio, 1);
  expect(previewLayout.sameCrop).toBe(true);
  await page.locator('#settings-theme-media-list .theme-wallpaper-row').nth(1)
    .getByRole('button', { name: 'Move up' }).click();
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row').first()).toContainText('second.png');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await openTheme(page);
  await page.locator('#settings-theme-more-wallpapers summary').click();
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row').first()).toContainText('second.png');
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row').first()
    .locator('input[type="color"]')).toHaveValue('#123456');
});

test('adds local images and videos to More wallpapers and restores them after reload', async ({ page }) => {
  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await page.locator('#settings-theme-more-wallpapers summary').click();
  await page.locator('#settings-theme-media-upload-input').setInputFiles([
    { name: 'landscape.png', mimeType: 'image/png', buffer: imageBytes },
    { name: 'motion.webm', mimeType: 'video/webm', buffer: Buffer.from('video fixture') }
  ]);
  const rows = page.locator('#settings-theme-media-list .theme-wallpaper-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('landscape.png');
  await expect(rows.nth(1)).toContainText('motion.webm');
  await expect(page.locator('#settings-theme-bg-preview')).toHaveCSS('background-image', /data:image\//);
  await rows.first().getByRole('button', { name: 'Preview wallpaper' }).hover();
  await expect(page.locator('.theme-wallpaper-peek:visible')).toHaveCSS('background-image', /data:image\//);
  await page.locator('#settings-theme-preview-next').click();
  await expect(page.locator('#settings-theme-preview-video')).toHaveAttribute('src', /^blob:/);
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await openTheme(page);
  await page.locator('#settings-theme-more-wallpapers summary').click();
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row')).toHaveCount(2);
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row').first()).toContainText('landscape.png');
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row').nth(1)).toContainText('motion.webm');
});

test('deletes a local video file after removing its wallpaper', async ({ page }) => {
  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await page.locator('#settings-theme-bg-upload-input').setInputFiles({
    name: 'temporary.webm', mimeType: 'video/webm', buffer: Buffer.from('video fixture')
  });
  await expect(page.locator('#settings-theme-bg-local')).toHaveValue('temporary.webm');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await openTheme(page);
  await page.locator('#settings-theme-clear-bg-local').click();
  await page.locator('#settings-modal-save').click();
  const countVideos = () => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('newdesktab-local-videos', 1);
    request.onsuccess = () => {
      const database = request.result;
      const countRequest = database.transaction('videos').objectStore('videos').count();
      countRequest.onsuccess = () => { resolve(countRequest.result); database.close(); };
      countRequest.onerror = () => reject(countRequest.error);
    };
    request.onerror = () => reject(request.error);
  }));
  await expect.poll(countVideos).toBe(0);
});

test('a second synced device can attach its own video to the same wallpaper slot', async ({ page, browser, baseURL }) => {
  const otherContext = await browser.newContext({ baseURL });
  const other = await otherContext.newPage();
  try {
    await openTheme(page);
    await page.locator('#settings-theme-bg-image-mode').check();
    await page.locator('#settings-theme-bg-upload-input').setInputFiles({
      name: 'first.webm', mimeType: 'video/webm', buffer: Buffer.from('first fixture')
    });
    await expect(page.locator('#settings-theme-bg-local')).toHaveValue('first.webm');
    await page.getByRole('button', { name: 'Sync' }).click();
    await page.getByRole('radio', { name: /Synced/ }).check();
    await page.locator('#settings-modal-save').click();
    const shared = await page.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-sync')));

    await other.goto('/tests/browser-harness.html');
    await expectAppReady(other);
    await other.evaluate(data => new Promise(resolve => chrome.storage.sync.set(data, resolve)), shared);
    await other.evaluate(() => new Promise(resolve => (
      chrome.storage.local.set({ newdesktabStorageMode: 'sync' }, resolve)
    )));
    await other.reload();
    await expectAppReady(other);
    await openTheme(other);
    await expect(other.locator('#settings-theme-bg-local')).toBeHidden();
    await other.locator('#settings-theme-bg-upload-input').setInputFiles({
      name: 'second.webm', mimeType: 'video/webm', buffer: Buffer.from('second fixture')
    });
    await expect(other.locator('#settings-theme-bg-local')).toHaveValue('second.webm');
    await other.locator('#settings-modal-save').click();
    await expect(other.locator('#page-wallpaper-video')).toHaveAttribute('src', /^blob:/);
    expect(await other.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-sync'))))
      .toEqual(shared);
    await openTheme(page);
    await expect(page.locator('#settings-theme-bg-local')).toHaveValue('first.webm');
  } finally {
    await otherContext.close();
  }
});
