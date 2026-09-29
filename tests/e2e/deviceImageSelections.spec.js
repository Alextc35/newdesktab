import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

const fallback = 'https://images.test/fallback.gif';
const updatedFallback = 'https://images.test/updated.gif';
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1SQAAAABJRU5ErkJggg==',
  'base64'
);

async function openTheme(page) {
  await page.mouse.move(5, page.viewportSize().height / 2);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Theme' }).click();
}

async function uploadImage(page, name) {
  await page.locator('#settings-theme-bg-upload-input').setInputFiles({
    name, mimeType: 'image/png', buffer: imageBytes
  });
  await expect(page.locator('#settings-theme-bg-local')).toHaveValue(name);
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
}

async function syncSnapshot(page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-sync') || '{}'));
}

async function receiveSync(page, snapshot) {
  await page.evaluate(data => new Promise(resolve => chrome.storage.sync.set(data, resolve)), snapshot);
}

test('two devices choose and remove their own images while sharing the fallback URL', async ({ page, browser, baseURL }) => {
  const otherContext = await browser.newContext({ baseURL });
  const other = await otherContext.newPage();
  try {
    for (const device of [page, other]) {
      await device.route('https://images.test/**', route => route.fulfill({
        contentType: 'image/png', body: imageBytes
      }));
      await device.goto('/tests/browser-harness.html');
      await expectAppReady(device);
      await expect(device.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();
    }

    await openTheme(page);
    await page.locator('#settings-theme-bg-image-mode').check();
    await page.locator('#settings-theme-bg-image').fill(fallback);
    await page.getByRole('button', { name: 'Sync' }).click();
    await page.getByRole('radio', { name: /Synced/ }).check();
    await page.locator('#settings-modal-save').click();
    await openTheme(page);
    const beforeUpload = await syncSnapshot(page);
    await uploadImage(page, 'device-a.png');
    const shared = await syncSnapshot(page);
    expect(shared).toEqual(beforeUpload);
    expect(JSON.stringify(shared)).not.toContain('newdesktab-local-image:');
    expect(JSON.stringify(shared)).not.toContain('backgroundImageLocal');

    await receiveSync(other, shared);
    await other.evaluate(() => new Promise(resolve => (
      chrome.storage.local.set({ newdesktabStorageMode: 'sync' }, resolve)
    )));
    await other.reload();
    await expect(other.locator('body')).toHaveCSS('background-image', `url("${fallback}")`);
    await openTheme(other);
    await expect(other.locator('#settings-theme-bg-local')).toBeHidden();
    await expect(other.locator('#settings-theme-bg-image')).toHaveValue(fallback);
    await uploadImage(other, 'device-b.png');
    expect(await syncSnapshot(other)).toEqual(shared);

    // A real shared change must keep the other device's chosen local file.
    await openTheme(other);
    await other.locator('#settings-theme-bg-image-source').selectOption('url');
    await other.locator('#settings-theme-bg-image').fill(updatedFallback);
    await other.locator('#settings-modal-save').click();
    await expect(other.locator('#settings-modal')).toBeHidden();
    await receiveSync(page, await syncSnapshot(other));
    await expect.poll(() => page.evaluate(async () => {
      const { getState } = await import('/src/state/appStore.js');
      return getState().data.settings.theme.backgroundImageUrl;
    })).toBe(updatedFallback);
    await openTheme(page);
    await expect(page.locator('#settings-theme-bg-image-source')).toHaveValue('local');
    await expect(page.locator('#settings-theme-bg-image')).toHaveValue(updatedFallback);
    await expect(page.locator('#settings-theme-bg-local')).toHaveValue('device-a.png');
    await page.getByRole('button', { name: 'Remove local file' }).click();
    await page.locator('#settings-modal-save').click();
    await expect(page.locator('body')).toHaveCSS('background-image', `url("${updatedFallback}")`);
    await receiveSync(other, await syncSnapshot(page));

    await page.reload();
    await openTheme(page);
    await expect(page.locator('#settings-theme-bg-local')).toBeHidden();
    await other.reload();
    await openTheme(other);
    await expect(other.locator('#settings-theme-bg-image-source')).toHaveValue('url');
    await expect(other.locator('#settings-theme-bg-local')).toHaveValue('device-b.png');
    await expect(other.locator('#settings-theme-bg-image')).toHaveValue(updatedFallback);

    // Switching Sync off and back on must also preserve this device's choice.
    await other.getByRole('button', { name: 'Sync' }).click();
    await other.getByRole('radio', { name: /This device only/ }).check();
    await other.locator('#settings-modal-save').click();
    await openTheme(other);
    await other.getByRole('button', { name: 'Sync' }).click();
    await other.getByRole('radio', { name: /Synced/ }).check();
    await other.locator('#settings-modal-save').click();
    await openTheme(other);
    await expect(other.locator('#settings-theme-bg-image-source')).toHaveValue('url');
    await expect(other.locator('#settings-theme-bg-local')).toHaveValue('device-b.png');
    await expect(other.locator('#settings-theme-bg-image')).toHaveValue(updatedFallback);
  } finally {
    await otherContext.close();
  }
});
