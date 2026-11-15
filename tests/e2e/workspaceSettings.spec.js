import { expect, test } from './helpers/test.js';
import { expectAppReady } from './helpers/appReady.js';

const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1SQAAAABJRU5ErkJggg==',
  'base64'
);

async function waitForSaved(page) {
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().ui.persistence.status;
  })).toMatch(/^(idle|saved)$/);
}

async function openWorkspaceSettings(page, workspaceId) {
  const toolbar = page.getByRole('navigation', { name: 'Workspace controls' });
  await toolbar.hover();
  await page.locator('#workspace-toggle').click();
  const selector = workspaceId
    ? `#workspace-options [data-workspace-settings-id="${workspaceId}"]`
    : '#workspace-options [data-workspace-settings-id=""]';
  await page.locator(selector).click();
  await expect(page.locator('#workspace-settings-modal')).toBeVisible();
}

async function selectWorkspace(page, workspaceId) {
  const toolbar = page.getByRole('navigation', { name: 'Workspace controls' });
  await toolbar.hover();
  await page.locator('#workspace-toggle').click();
  const selector = workspaceId
    ? `#workspace-options [data-workspace-id="${workspaceId}"]`
    : '#workspace-options [data-workspace-id=""]';
  await page.locator(selector).click();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://images.test/**', route => route.fulfill({
    status: 200, contentType: 'image/png', body: imageBytes
  }));
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expectAppReady(page);
});

test('edits Main and custom workspace names and wallpapers independently', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Workspace controls' }).hover();
  await page.locator('#workspace-settings-current').click();
  await expect(page.locator('#workspace-settings-modal')).toBeVisible();
  await page.locator('#workspace-settings-cancel').click();

  await openWorkspaceSettings(page, null);
  await page.locator('#workspace-settings-name').fill('Home');
  await page.locator('#workspace-settings-wallpaper-url').fill('https://images.test/home.jpg');
  await page.locator('#workspace-settings-media-add').click();
  await expect(page.locator('#workspace-wallpaper-preview-message')).toBeHidden();
  await page.locator('#workspace-settings-save').click();
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await waitForSaved(page);
  await expect(page.locator('#workspace-current-name')).toHaveText('Home');
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /images\.test\/home\.jpg/);

  const toolbar = page.getByRole('navigation', { name: 'Workspace controls' });
  await toolbar.hover();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.locator('#alert-modal-input').fill('Work');
  await page.locator('#alert-modal-accept').click();
  await waitForSaved(page);
  const workspaceId = await page.locator('#workspace-select').inputValue();

  await openWorkspaceSettings(page, workspaceId);
  await page.locator('#workspace-settings-name').fill('Research');
  await page.locator('#workspace-settings-wallpaper-url').fill('https://images.test/research-fallback.jpg');
  await page.locator('#workspace-settings-media-add').click();
  await page.locator('#workspace-settings-file').setInputFiles({
    name: 'research.png', mimeType: 'image/png', buffer: imageBytes
  });
  await expect(page.locator('#workspace-settings-media-list .theme-wallpaper-row')).toHaveCount(2);
  const previewTrigger = page.locator('#workspace-settings-media-list .theme-wallpaper-preview-trigger').first();
  await previewTrigger.hover();
  const previewLayers = await page.evaluate(() => ({
    preview: Number(getComputedStyle(document.querySelector('body > .theme-wallpaper-peek')).zIndex),
    modal: Number(getComputedStyle(document.querySelector('#workspace-settings-modal')).zIndex),
    previewTop: document.querySelector('body > .theme-wallpaper-peek').getBoundingClientRect().top,
    triggerBottom: document.querySelector('#workspace-settings-media-list .theme-wallpaper-preview-trigger')
      .getBoundingClientRect().bottom
  }));
  expect(previewLayers.preview).toBeGreaterThan(previewLayers.modal);
  expect(previewLayers.previewTop).toBeGreaterThanOrEqual(previewLayers.triggerBottom);
  await page.mouse.move(0, 0);
  await page.locator('#workspace-settings-media-list .theme-wallpaper-row').first()
    .locator('.theme-wallpaper-row-action').nth(1).click();
  await page.locator('#workspace-settings-media-interval').selectOption('300');
  await page.locator('#workspace-settings-save').click();
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await waitForSaved(page);
  await expect(page.locator('#workspace-current-name')).toHaveText('Research');
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /data:image\//);

  const workspaceState = await page.evaluate(async workspaceIdValue => {
    const { getState } = await import('/src/state/appStore.js');
    const { withoutDeviceImages } = await import('/src/platform/storage/deviceImageSelections.js');
    const data = getState().data;
    return {
      main: data.settings.mainWorkspace,
      custom: data.settings.bookmarkGroups.find(item => item.id === workspaceIdValue),
      shared: withoutDeviceImages(data)
    };
  }, workspaceId);
  expect(workspaceState.main.name).toBe('Home');
  expect(workspaceState.main.backgroundMedia[0].backgroundImageUrl)
    .toBe('https://images.test/home.jpg');
  expect(workspaceState.custom.name).toBe('Research');
  expect(workspaceState.custom.backgroundRotationSeconds).toBe(300);
  expect(workspaceState.custom.backgroundMedia[0].backgroundImageSource).toBe('local');
  expect(workspaceState.custom.backgroundMedia[0].backgroundImageUrl).toBeNull();
  expect(workspaceState.custom.backgroundMedia[1].backgroundImageUrl)
    .toBe('https://images.test/research-fallback.jpg');
  expect(workspaceState.shared.settings.bookmarkGroups[0].backgroundMedia[0])
    .not.toHaveProperty('backgroundImageLocal');
  expect(workspaceState.shared.settings.bookmarkGroups[0].backgroundMedia[1].backgroundImageUrl)
    .toBe('https://images.test/research-fallback.jpg');

  await selectWorkspace(page, null);
  await expect(page.locator('#workspace-current-name')).toHaveText('Home');
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /images\.test\/home\.jpg/);
  await selectWorkspace(page, workspaceId);
  await expect(page.locator('#workspace-current-name')).toHaveText('Research');
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /data:image\//);

  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('#workspace-current-name')).toHaveText('Research');
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /data:image\//);
});
