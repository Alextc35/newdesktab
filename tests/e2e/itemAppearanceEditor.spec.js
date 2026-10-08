import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

const editors = {
  bookmark: { modal: '#edit-bookmark-modal', preview: '.bookmark-preview > .bookmark.is-preview', save: '#edit-bookmark-modal-save' },
  folder: { modal: '#edit-folder-modal', preview: '.edit-item-modal-preview > .folder-editor-preview-card', save: '#edit-folder-modal-save' },
  recycleBin: { modal: '#edit-recycle-bin-modal', preview: '.edit-item-modal-preview > .recycle-bin-editor-preview-card', save: '#edit-recycle-bin-modal-save' }
};

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    if (route.request().resourceType() === 'image') return route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="2" y="12" width="60" height="42" rx="13" fill="#ff0033"/><path d="m27 23 17 10-17 10Z" fill="white"/></svg>'
    });
    return route.abort();
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
    const { DEFAULT_RECYCLE_BIN } = await import('/src/domain/recycle-bin/recycleBinDefaults.js');
    const { getState } = await import('/src/state/appStore.js');
    await new Promise(resolve => chrome.storage.local.set({
      bookmarks: [{ ...DEFAULT_BOOKMARK, id: 'editor-bookmark', name: 'YouTube', url: 'https://youtube.com', gx: 0, gy: 0 }],
      folders: [{ ...DEFAULT_FOLDER_STYLE, id: 'editor-folder', name: 'Inspiration', gx: 1, gy: 0, w: 1, h: 1, groupId: null, createdAt: 1, updatedAt: 1 }],
      recycleBin: { ...DEFAULT_RECYCLE_BIN, gx: 2, gy: 0 },
      settings: { ...getState().data.settings, language: 'en', interfaceTheme: 'dark' }
    }, resolve));
  });
  await page.reload();
  await expectAppReady(page);
});

async function openEditor(page, type) {
  if (type === 'bookmark') {
    if (!await page.locator('[data-bookmark-id="editor-bookmark"] .item-action-button.edit').isVisible()) {
      await page.keyboard.press('KeyE');
    }
    await page.locator('[data-bookmark-id="editor-bookmark"] .item-action-button.edit').click();
  } else if (type === 'folder') {
    await page.locator('[data-folder-id="editor-folder"] .folder-open').click();
    await page.locator('#folder-modal-customize').click();
  } else {
    await page.locator('#bookmark-container .recycle-bin-open').click();
    await page.locator('#recycle-bin-modal-customize').click();
  }
  const modal = page.locator(editors[type].modal);
  await expect(modal).toBeVisible();
  await modal.getByRole('tab', { name: 'Style', exact: true }).click();
  return modal;
}

async function storedValue(page, type) {
  return page.evaluate(async kind => {
    const { data } = (await import('/src/state/appStore.js')).getState();
    return kind === 'bookmark' ? data.bookmarks.find(item => item.id === 'editor-bookmark')
      : kind === 'folder' ? data.folders.find(item => item.id === 'editor-folder') : data.recycleBin;
  }, type);
}

for (const type of Object.keys(editors)) {
  test(`${type}: previews, saves and restores a look while preserving the grid item`, async ({ page }, testInfo) => {
    const original = await storedValue(page, type);
    let modal = await openEditor(page, type);
    const save = page.locator(editors[type].save);
    await expect(save).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(modal.getByRole('tab')).toHaveCount(2);
    const summary = modal.locator('.editor-image-section summary');
    await modal.locator('.modal-card').screenshot({ path: testInfo.outputPath(`${type}-initial.png`) });
    await expect(summary).toBeInViewport({ ratio: 1 });
    await expect(modal.locator('.editor-look-item')).toHaveCount(4);
    if (type === 'bookmark') {
      await expect(modal.locator('.editor-look-item .bookmark-favicon-image')).toHaveCount(4);
      const sample = modal.locator('[data-appearance-look="original"] .bookmark-favicon');
      const bounds = await sample.boundingBox();
      const image = await sample.locator('img').boundingBox();
      expect(image.height).toBeLessThanOrEqual(bounds.height + 1);
    }
    await expect(modal.locator('[data-appearance-look="original"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(modal.locator('.editor-preview-surfaces')).toHaveCount(0);
    await expect(modal.locator('.bookmark-preview, .edit-item-modal-preview'))
      .toHaveCSS('background-image', /conic-gradient/);
    await modal.locator('[data-appearance-look="midnight"]').click();
    await expect(save).toBeEnabled();
    await expect(modal.locator(editors[type].preview)).toHaveCSS('background-color', 'rgb(23, 23, 23)');
    await expect(modal.locator('[data-appearance-look="midnight"]')).toHaveAttribute('aria-pressed', 'true');
    await modal.locator('.modal-card').screenshot({ path: testInfo.outputPath(`${type}-dark.png`) });
    await save.click();
    await expect(modal).toBeHidden();
    await page.reload();
    await expectAppReady(page);
    const saved = await storedValue(page, type);
    for (const key of ['id', 'name', 'url', 'folderId', 'groupId', 'gx', 'gy', 'w', 'h']) {
      expect(saved[key]).toEqual(original[key]);
    }
    expect(saved[type === 'folder' ? 'outerBackgroundColor' : 'backgroundColor']).toBe('#171717');
    modal = await openEditor(page, type);
    await expect(save).toBeDisabled();
    await modal.locator('.editor-reset-appearance').click();
    await expect(modal.locator('[data-appearance-look="original"]')).toHaveAttribute('aria-pressed', 'true');
    await save.click();
    await expect(modal).toBeHidden();
    await page.reload();
    await expectAppReady(page);
    const restored = await storedValue(page, type);
    delete original.updatedAt;
    delete restored.updatedAt;
    expect(restored).toEqual(original);
  });
}

test('keyboard activation selects a look without submitting, and Cancel discards it', async ({ page }) => {
  const original = await storedValue(page, 'folder');
  const modal = await openEditor(page, 'folder');
  await modal.locator('[data-appearance-look="paper"]').focus();
  await page.keyboard.press('Enter');
  await expect(modal).toBeVisible();
  await expect(modal.locator('[data-appearance-look="paper"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#edit-folder-modal-cancel').click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await page.locator('#alert-modal-accept').click();
  await expect(modal).toBeHidden();
  expect(await storedValue(page, 'folder')).toEqual(original);
});

test('finishes a custom card in one tab, and quick looks preserve its content choices', async ({ page }) => {
  const modal = await openEditor(page, 'bookmark');
  await modal.locator('[data-field="showText"]').uncheck();
  await modal.locator('[data-field="backgroundFavicon"]').uncheck();
  await modal.locator('[data-field="showFavicon"]').uncheck();
  await modal.locator('[data-appearance-look="ocean"]').click();
  await expect(modal.locator('[data-field="showText"]')).not.toBeChecked();
  await expect(modal.locator('[data-field="backgroundFavicon"]')).not.toBeChecked();
  await expect(modal.locator('[data-field="showFavicon"]')).not.toBeChecked();
  await expect(modal.locator('.bookmark-preview .bookmark-title')).toHaveCount(0);
  await modal.locator('[data-field="backgroundColor"]').fill('#532b7d');
  await expect(modal.locator('.editor-card-group .editor-color-code')).toHaveText('#532B7D');
  await modal.locator('.editor-card-group .editor-color-code').click();
  await expect(modal.locator('.app-color-picker:not([hidden])')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  await page.locator('#edit-bookmark-modal-save').click();
  expect(await storedValue(page, 'bookmark')).toMatchObject({
    backgroundColor: '#532b7d', showText: false, backgroundFavicon: false, showFavicon: false
  });
});

test('background image details open for an active cover and for validation errors', async ({ page }) => {
  const modal = await openEditor(page, 'bookmark');
  const details = modal.locator('.editor-image-section');
  await expect(details).not.toHaveAttribute('open');
  await details.locator('summary').click();
  await modal.locator('[data-field="backgroundImage"]').fill('javascript:alert(1)');
  await details.locator('summary').click();
  await page.locator('#edit-bookmark-modal-save').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(modal.locator('[data-field="backgroundImage"]')).toHaveAttribute('aria-invalid', 'true');
  await modal.locator('[data-field="backgroundImage"]').fill('https://images.test/cover.png');
  await expect(modal.locator('[data-field="backgroundFavicon"]')).not.toBeChecked();
  await page.locator('#edit-bookmark-modal-save').click();
  await expect(modal).toBeHidden();
  const reopened = await openEditor(page, 'bookmark');
  await expect(reopened.locator('.editor-image-section')).toHaveAttribute('open', '');
  await expect(reopened.locator('[data-field="backgroundImage"]')).toHaveValue('https://images.test/cover.png');
});

test('the same editor stays legible in a light interface', async ({ page }, testInfo) => {
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    await setState({ data: { settings: { ...getState().data.settings, interfaceTheme: 'light' } } });
  });
  const modal = await openEditor(page, 'bookmark');
  await modal.locator('[data-appearance-look="paper"]').click();
  await expect(modal.locator('.bookmark-preview .bookmark-title')).toHaveCSS('color', 'rgb(41, 37, 36)');
  await modal.locator('.modal-card').screenshot({ path: testInfo.outputPath('bookmark-light.png') });
});

test('Spanish labels and the complete item fit inside each taller look', async ({ page }, testInfo) => {
  const modal = await openEditor(page, 'bookmark');
  await page.evaluate(async () => {
    const { changeLanguage } = await import('/src/platform/i18n/i18n.js');
    await changeLanguage({ language: 'es' });
  });
  await modal.locator('[data-appearance-look="midnight"]').click();
  for (const look of ['original', 'midnight', 'paper', 'ocean']) {
    const sample = modal.locator(`[data-appearance-look="${look}"] .editor-look-sample`);
    const frame = await sample.boundingBox();
    expect(frame.height).toBeGreaterThanOrEqual(90);
    for (const selector of ['.bookmark-favicon-image', '.bookmark-title']) {
      const item = await sample.locator(selector).boundingBox();
      expect(item.y).toBeGreaterThanOrEqual(frame.y);
      expect(item.y + item.height).toBeLessThanOrEqual(frame.y + frame.height);
    }
  }
  await page.mouse.move(0, 0);
  await modal.locator('.modal-card').screenshot({ path: testInfo.outputPath('editor-es.png') });
});
