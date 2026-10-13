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
    await page.locator('#folder-modal-edit-toggle').click();
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

test('Logo shows the small site favicon, follows the URL and uses localized labels', async ({ page }) => {
  const modal = await openEditor(page, 'bookmark');
  const picker = modal.locator('.editor-icon-picker');
  const summaryImage = picker.locator('.editor-icon-current .bookmark-favicon-image');
  const logo = picker.locator('[data-icon-choice=""]');
  const expectLogo = async (image, origin) => {
    await expect.poll(() => image.evaluate(element => ({
      origin: new URL(element.src).searchParams.get('url'),
      loaded: element.complete && element.naturalWidth > 0
    }))).toEqual({ origin, loaded: true });
    const size = await image.boundingBox();
    expect(size.width).toBe(22);
    expect(size.height).toBe(22);
  };
  await expect(picker.locator('.editor-icon-current-label')).toHaveText('Logo');
  await expectLogo(summaryImage, 'https://youtube.com');
  await modal.locator('[data-field="backgroundFavicon"]').uncheck();
  await expect(summaryImage).toBeVisible();
  await modal.locator('[data-field="showFavicon"]').uncheck();
  await expect(picker.locator('.editor-icon-current')).toBeHidden();
  await page.screenshot({ path: 'dist/release-audit/site-logo-disabled.png' });
  await picker.locator('summary').click();
  await logo.click();
  await expect(modal.locator('[data-field="showFavicon"]')).toBeChecked();
  await expect(modal.locator('[data-field="backgroundFavicon"]')).not.toBeChecked();
  await expect(modal.locator('.bookmark-preview .bookmark-favicon-image')).toBeVisible();
  await expectLogo(summaryImage, 'https://youtube.com');
  await picker.locator('summary').click();
  await expect(picker).not.toHaveAttribute('open');
  await modal.locator('[data-field="showFavicon"]').uncheck();
  await modal.locator('[data-field="backgroundFavicon"]').check();
  await expectLogo(summaryImage, 'https://youtube.com');
  await modal.locator('[data-field="backgroundFavicon"]').uncheck();
  await expect(picker.locator('.editor-icon-current')).toBeHidden();
  await modal.locator('[data-field="showFavicon"]').check();
  await expectLogo(summaryImage, 'https://youtube.com');
  await picker.locator('summary').click();
  await expectLogo(logo.locator('img'), 'https://youtube.com');
  await picker.locator('[data-icon-choice="notes"]').click();
  await expect(picker.locator('.editor-icon-current [data-icon-id="notes"]')).toBeVisible();
  await expectLogo(logo.locator('img'), 'https://youtube.com');
  await logo.click();
  await expectLogo(summaryImage, 'https://youtube.com');

  await modal.getByRole('tab', { name: 'General', exact: true }).click();
  await modal.locator('[data-field="url"]').fill('https://new-logo.example/section');
  await modal.getByRole('tab', { name: 'Style', exact: true }).click();
  await expectLogo(summaryImage, 'https://new-logo.example');
  await expectLogo(logo.locator('img'), 'https://new-logo.example');
  for (const [language, label] of [['en', 'Logo'], ['es', 'Logo'], ['es_419', 'Logo'], ['pt_BR', 'Logotipo']]) {
    await page.evaluate(async language => {
      const { changeLanguage } = await import('/src/platform/i18n/i18n.js');
      await changeLanguage({ language });
    }, language);
    await expect(logo.locator('[data-i18n="itemEditor.siteLogo"]')).toHaveText(label);
    await expect(picker.locator('.editor-icon-current-label')).toHaveText(label);
  }
  await picker.locator('summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'dist/release-audit/site-logo-picker.png' });
});

for (const type of Object.keys(editors)) {
  test(`${type}: category icons preview, undo, persist, render in lists and return to the original icon`, async ({ page }) => {
    const original = await storedValue(page, type);
    let modal = await openEditor(page, type);
    await modal.locator('.editor-icon-picker summary').click();
    await modal.locator('[data-icon-choice="music"]').click();
    await expect(modal.locator(editors[type].preview).locator('[data-icon-id="music"]')).toBeVisible();
    expect((await storedValue(page, type)).iconId).toBeNull();
    await modal.locator('[data-editor-history="undo"]').click();
    await expect(modal.locator(editors[type].preview).locator('[data-icon-id]')).toHaveCount(0);
    await modal.locator('[data-editor-history="redo"]').click();
    await expect(modal.locator('[data-icon-choice="music"]')).toHaveAttribute('aria-pressed', 'true');
    await modal.locator('[data-appearance-look="midnight"]').click();
    await modal.locator('[data-appearance-look="original"]').click();
    await expect(modal.locator('[data-icon-choice="music"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator(editors[type].save).click();
    await expect(modal).toBeHidden();
    await page.reload();
    await expectAppReady(page);
    const saved = await storedValue(page, type);
    expect(saved.iconId).toBe('music');
    for (const key of ['id', 'name', 'url', 'folderId', 'groupId', 'gx', 'gy', 'w', 'h']) {
      expect(saved[key]).toEqual(original[key]);
    }
    await page.setViewportSize({ width: 600, height: 800 });
    const row = type === 'bookmark' ? '[data-bookmark-id="editor-bookmark"]'
      : type === 'folder' ? '[data-folder-id="editor-folder"]' : '[data-recycle-bin-id]';
    await expect(page.locator(`#bookmark-container ${row} [data-icon-id="music"]`)).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    modal = await openEditor(page, type);
    await modal.locator('.editor-icon-picker summary').click();
    await modal.locator('[data-icon-choice=""]').click();
    await expect(modal.locator(editors[type].preview).locator('[data-icon-id]')).toHaveCount(0);
    await page.locator(editors[type].save).click();
    await expect(modal).toBeHidden();
    await page.reload();
    await expectAppReady(page);
    expect((await storedValue(page, type)).iconId).toBeNull();
  });
}

test('icon search finds shapes without accents, supports keyboard selection and keeps the choice after reload', async ({ page }) => {
  const modal = await openEditor(page, 'bookmark');
  const picker = modal.locator('.editor-icon-picker');
  await picker.locator('summary').click();
  await expect(picker.locator('[data-icon-suggestion="video"]')).toBeVisible();
  await picker.locator('[data-icon-suggestion="video"]').click();
  await expect(modal.locator('.bookmark-preview [data-icon-id="video"]')).toBeVisible();
  await page.evaluate(async () => {
    await (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language: 'es' });
  });
  const search = picker.getByRole('searchbox', { name: 'Buscar iconos…' });
  await search.fill('CIRCULO');
  await expect(picker.locator('.editor-icon-options > button:not([hidden])')).toHaveCount(1);
  const circle = picker.locator('[data-icon-choice="circle"]');
  await expect(circle).toHaveAttribute('aria-label', 'Círculo');
  await search.press('ArrowDown');
  await expect(circle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(modal.locator('.bookmark-preview [data-icon-id="circle"]')).toBeVisible();
  await expect(modal.locator('.editor-icon-group > h3')).toHaveText('Icono');
  await expect(picker.locator('summary')).toHaveText('Círculo');
  await search.fill('sinresultadosxyz');
  await expect(picker.getByRole('status')).toHaveText('No se encontraron iconos');
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(modal).toBeVisible();
  await search.fill('figuras geometricas');
  await expect(picker.locator('.editor-icon-options > button:not([hidden])')).toHaveCount(8);
  await picker.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(search).toHaveValue('');
  await expect(picker.locator('.editor-icon-browser')).toBeInViewport({ ratio: 1 });
  await picker.locator('summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'dist/release-audit/searchable-icon-picker.png' });
  await search.press('Escape');
  await expect(picker).not.toHaveAttribute('open');
  await expect(modal).toBeVisible();
  await page.locator('#edit-bookmark-modal-save').click();
  await expect(modal).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('#bookmark-container [data-bookmark-id="editor-bookmark"] [data-icon-id="circle"]')).toBeVisible();
  expect((await storedValue(page, 'bookmark')).url).toBe('https://youtube.com');
});

test('the icon picker can reverse its animation and stays usable with reduced motion', async ({ page }) => {
  const modal = await openEditor(page, 'bookmark');
  const picker = modal.locator('.editor-icon-picker');
  const summary = picker.locator('summary');
  await summary.dblclick();
  await expect(picker).not.toHaveAttribute('open');
  await expect(modal).toBeVisible();
  await summary.press('Enter');
  const search = picker.getByRole('searchbox');
  await expect(search).toBeFocused();
  await search.press('Escape');
  await expect(picker).not.toHaveAttribute('open');
  await expect(summary).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await summary.press('Enter');
  await expect(search).toBeFocused();
  await search.press('Escape');
  await expect(picker).not.toHaveAttribute('open');
  await expect(modal).toBeVisible();
});

test('Gmail captions center site logos and SVG artwork in cards and previews', async ({ page }) => {
  let modal = await openEditor(page, 'bookmark');
  await modal.getByRole('tab', { name: 'General', exact: true }).click();
  await modal.locator('[data-field="name"]').fill('Gmail');
  await modal.locator('[data-field="url"]').fill('https://mail.google.com');
  await modal.getByRole('tab', { name: 'Style', exact: true }).click();
  await modal.locator('[data-appearance-look="card"]').click();
  await modal.locator('[data-field="backgroundColor"]').fill('#ffffff');
  const expectAligned = async row => {
    const icon = await row.locator('.bookmark-favicon').boundingBox();
    const text = await row.locator('.bookmark-title').boundingBox();
    expect(Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2)).toBeLessThan(0.5);
  };
  await expectAligned(modal.locator('.bookmark-preview .bookmark-info'));
  await modal.locator('.editor-icon-picker summary').click();
  await modal.locator('.editor-icon-search').fill('mail');
  await modal.locator('[data-icon-choice="mail"]').click();
  await expectAligned(modal.locator('.bookmark-preview .bookmark-info'));
  await modal.locator('.bookmark-preview').screenshot({ path: 'dist/release-audit/gmail-caption-aligned.png' });
  await page.locator('#edit-bookmark-modal-save').click();
  await expect(modal).toBeHidden();
  await expectAligned(page.locator('#bookmark-container [data-bookmark-id="editor-bookmark"] .bookmark-info'));
  await page.locator('#bookmark-container [data-bookmark-id="editor-bookmark"]').screenshot({ path: 'dist/release-audit/gmail-grid-matches-preview.png' });
  modal = await openEditor(page, 'bookmark');
  await expectAligned(modal.locator('.bookmark-preview .bookmark-info'));
});

test('every SVG caption matches its preview size, spacing and artwork center in the grid', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { ICON_CATALOG } = await import('/src/shared/icons/iconCatalog.js');
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { createBookmarkElement } = await import('/src/features/bookmarks/bookmarkCard.js');
    const previewHost = document.createElement('section');
    previewHost.className = 'item-appearance-editor';
    previewHost.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;';
    previewHost.setAttribute('aria-hidden', 'true');
    const preview = document.createElement('div');
    preview.className = 'bookmark-preview';
    previewHost.append(preview);
    document.body.append(previewHost);
    const failures = [];
    const measurements = {};
    try {
      for (const context of ['grid', 'grid-narrow', 'preview']) {
        const host = context.startsWith('grid') ? document.getElementById('bookmark-container') : preview;
        for (const { id } of ICON_CATALOG) {
          const card = createBookmarkElement({ ...DEFAULT_BOOKMARK, name: 'Gmail', iconId: id,
            backgroundFavicon: false, showFavicon: true, showText: true,
            noBackground: false, backgroundColor: '#ffffff', textColor: '#000000' }, { isPreview: true });
          if (context.startsWith('grid')) card.style.cssText = `position:relative;left:auto;top:auto;width:${context === 'grid' ? 156 : 96}px;height:156px;margin:0;visibility:hidden;`;
          host.append(card);
          const svg = card.querySelector('.bookmark-favicon .catalog-icon');
          const { x, y, width, height } = svg.getBBox();
          const center = new DOMPoint(x + width / 2, y + height / 2).matrixTransform(svg.getScreenCTM());
          const text = card.querySelector('.bookmark-title').getBoundingClientRect();
          const icon = card.querySelector('.bookmark-favicon').getBoundingClientRect();
          const cardBox = card.getBoundingClientRect();
          const row = card.querySelector('.bookmark-info');
          const rowBox = row.getBoundingClientRect();
          const titleStyle = getComputedStyle(card.querySelector('.bookmark-title'));
          const matrix = svg.getScreenCTM();
          measurements[`${context}:${id}`] = {
            fontSize: titleStyle.fontSize,
            lineHeight: titleStyle.lineHeight,
            gap: getComputedStyle(row).gap,
            left: icon.x - cardBox.x,
            bottom: cardBox.bottom - rowBox.bottom,
            iconWidth: icon.width,
            iconHeight: icon.height,
            artworkWidth: width * matrix.a,
            artworkHeight: height * matrix.d
          };
          const deltaY = Math.abs(center.y - text.y - text.height / 2);
          const deltaX = Math.abs(center.x - icon.x - icon.width / 2);
          if (deltaY > 0.1 || deltaX > 0.1) failures.push({ id, context, deltaY, deltaX });
          card.remove();
        }
      }
      for (const { id } of ICON_CATALOG) {
        const preview = measurements[`preview:${id}`];
        for (const context of ['grid', 'grid-narrow']) {
          const grid = measurements[`${context}:${id}`];
          for (const key of Object.keys(preview)) {
            const matches = typeof preview[key] === 'number' ? Math.abs(grid[key] - preview[key]) < 0.1 : grid[key] === preview[key];
            if (!matches) failures.push({ id, context, property: key, grid: grid[key], preview: preview[key] });
          }
        }
      }
    } finally { previewHost.remove(); }
    return { count: ICON_CATALOG.length * 3, failures };
  });
  expect(result.count).toBe(240);
  expect(result.failures).toEqual([]);
});

test('the default bookmark category is used by both normal creation and the quick-save popup', async ({ page }) => {
  await page.keyboard.press('KeyS');
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await page.getByRole('button', { name: 'Configure default bookmark' }).click();
  const editor = page.locator('#edit-bookmark-modal');
  await editor.getByRole('tab', { name: 'Style', exact: true }).click();
  await editor.locator('.editor-icon-picker summary').click();
  await editor.locator('[data-icon-choice="mail"]').click();
  await expect(editor.locator('.bookmark-preview [data-icon-id="mail"]')).toBeVisible();
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await page.keyboard.press('KeyB');
  await page.locator('#bookmark-modal-density-toggle').click();
  await expect(editor.locator('.bookmark-preview [data-icon-id="mail"]')).toBeVisible();
  await editor.locator('[data-field="name"]').fill('Categorized bookmark');
  await editor.locator('[data-field="url"]').fill('https://categorized.example');
  await page.locator('#edit-bookmark-modal-save').click();
  await expect(editor).toBeHidden();
  const result = await page.evaluate(async () => {
    const { saveQuickBookmark } = await import('/src/features/quick-save/quickSaveActions.js');
    return saveQuickBookmark({ name: 'Quick categorized', url: 'https://quick.example' });
  });
  expect(result.reason).toBeNull();
  expect(result.bookmark.iconId).toBe('mail');
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('.bookmark').filter({ hasText: 'Categorized bookmark' }).locator('[data-icon-id="mail"]')).toBeVisible();
  await expect(page.locator('.bookmark').filter({ hasText: 'Quick categorized' }).locator('[data-icon-id="mail"]')).toBeVisible();
});

test('category selection works with the keyboard and stays legible in light previews and lists', async ({ page }) => {
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    await setState({ data: { settings: { ...getState().data.settings, interfaceTheme: 'light' } } });
  });
  const modal = await openEditor(page, 'bookmark');
  await modal.locator('.editor-icon-picker summary').click();
  const choice = modal.locator('[data-icon-choice="ideas"]');
  await choice.focus();
  await page.keyboard.press('Enter');
  await expect(modal).toBeVisible();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  const glyph = modal.locator('.bookmark-preview [data-icon-id="ideas"]');
  await expect(glyph).toHaveCSS('color', 'rgb(36, 36, 40)');
  await page.screenshot({ path: 'dist/release-audit/category-icon-picker-light.png' });
  await page.locator('#edit-bookmark-modal-save').click();
  await expect(modal).toBeHidden();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.locator('#bookmark-container [data-bookmark-id="editor-bookmark"] [data-icon-id="ideas"]'))
    .toHaveCSS('color', 'rgb(36, 36, 40)');
});

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
    await expect(modal.locator('.editor-look-item')).toHaveCount(type === 'bookmark' ? 4 : 3);
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
    const frame = await modal.locator('.bookmark-preview, .edit-item-modal-preview').boundingBox();
    const card = await modal.locator(editors[type].preview).boundingBox();
    expect(Math.abs(card.width - card.height)).toBeLessThanOrEqual(1);
    expect(card.width / frame.width).toBeGreaterThan(.8);
    expect(card.y).toBeGreaterThan(frame.y);
    expect(card.y + card.height).toBeLessThan(frame.y + frame.height);
    if (type === 'bookmark') {
      for (const selector of ['.bookmark-favicon-image', '.bookmark-title']) {
        const content = await modal.locator(`.bookmark-preview ${selector}`).boundingBox();
        expect(content.y).toBeGreaterThanOrEqual(card.y);
        expect(content.y + content.height).toBeLessThanOrEqual(card.y + card.height);
      }
    }
    await expect(modal.locator('[data-appearance-look="card"]')).toHaveCount(type === 'bookmark' ? 1 : 0);
    await modal.locator(`[data-appearance-look="${type === 'bookmark' ? 'card' : 'midnight'}"]`).click();
    const color = modal.locator(type === 'bookmark' ? '[data-field="backgroundColor"]'
      : type === 'folder' ? '#folder-editor-outer-color' : '#recycle-bin-editor-background-color');
    const textColor = modal.locator(type === 'bookmark' ? '[data-field="textColor"]'
      : type === 'folder' ? '#folder-editor-text-color' : '#recycle-bin-editor-text-color');
    const title = modal.locator(editors[type].preview).locator(type === 'bookmark' ? '.bookmark-title'
      : type === 'folder' ? '.folder-title' : '.recycle-bin-caption > strong');
    for (const [background, foreground, css] of [['#ffffff', '#000000', 'rgb(0, 0, 0)'],
      ['#000000', '#ffffff', 'rgb(255, 255, 255)']]) {
      await color.fill(background);
      await expect(textColor).toHaveValue(foreground);
      await expect(title).toHaveCSS('color', css);
    }
    expect(await storedValue(page, type)).toEqual(original);
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
  const original = await storedValue(page, 'bookmark');
  const modal = await openEditor(page, 'bookmark');
  await modal.locator('[data-field="showText"]').uncheck();
  await modal.locator('[data-appearance-look="card"]').click();
  await expect(modal.locator('[data-field="showText"]')).toBeChecked();
  await expect(modal.locator('[data-field="backgroundFavicon"]')).not.toBeChecked();
  await expect(modal.locator('.bookmark-preview > .bookmark')).toHaveCSS('background-color', 'rgb(17, 24, 39)');
  await expect(modal.locator('[data-appearance-look="card"] .editor-look-item')).toHaveCSS('background-color', 'rgb(17, 24, 39)');
  await expect(modal.locator('.bookmark-preview .bookmark-info')).toBeVisible();
  expect(await storedValue(page, 'bookmark')).toEqual(original);
  await modal.locator('[data-field="backgroundColor"]').fill('#81b64c');
  await expect(modal.locator('.bookmark-preview > .bookmark')).toHaveCSS('background-color', 'rgb(129, 182, 76)');
  await expect(modal.locator('[data-appearance-look="card"] .editor-look-item')).toHaveCSS('background-color', 'rgb(17, 24, 39)');
  await modal.locator('[data-appearance-look="card"]').click();
  await expect(modal.locator('[data-field="backgroundColor"]')).toHaveValue('#111827');
  await modal.locator('[data-field="showText"]').uncheck();
  await modal.locator('[data-field="showFavicon"]').uncheck();
  await modal.locator('[data-appearance-look="midnight"]').click();
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
  await expect(modal.locator('.editor-look > span:last-child')).toHaveText(['Original', 'Tarjeta', 'Oscuro', 'Claro']);
  await modal.locator('[data-appearance-look="midnight"]').click();
  for (const look of ['original', 'card', 'midnight', 'paper']) {
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
  await modal.locator('[data-appearance-look="original"]').click();
  await modal.getByRole('tab', { name: 'General', exact: true }).click();
  await page.mouse.move(0, 0);
  await modal.locator('.modal-card').screenshot({ path: testInfo.outputPath('editor-general-es.png') });
});
