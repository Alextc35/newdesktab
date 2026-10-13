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
  await expect(modal.locator('.editor-title-icon')).toHaveAttribute('data-icon-id', 'ui-editing');
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

for (const type of ['bookmark', 'folder', 'recycleBin']) {
  test(`${type}: background image disclosure animates both ways, reverses smoothly and respects reduced motion`, async ({ page }) => {
    const modal = await openEditor(page, type);
    const section = modal.locator('.editor-image-section');
    const summary = section.locator('summary');
    const content = section.locator('.editor-image-content');
    await expect(section).not.toHaveAttribute('open');
    await summary.evaluate(element => element.click());
    const middle = await content.evaluate(element => {
      const [animation] = element.getAnimations();
      animation.pause();
      animation.currentTime = 100;
      return { height: element.getBoundingClientRect().height, fullHeight: element.scrollHeight,
        opacity: Number(getComputedStyle(element).opacity) };
    });
    expect(middle.height).toBeGreaterThan(0);
    expect(middle.height).toBeLessThan(middle.fullHeight);
    expect(middle.opacity).toBeGreaterThan(0);
    expect(middle.opacity).toBeLessThan(1);
    await summary.click();
    await expect(section).not.toHaveAttribute('open');
    await summary.press('Enter');
    await expect.poll(() => content.evaluate(element => element.getAnimations().length)).toBe(0);
    await expect(content.locator('input[type="text"]').first()).toBeVisible();
    await summary.press('Space');
    await expect(section).not.toHaveAttribute('open');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await summary.press('Enter');
    await expect(content.locator('input[type="text"]').first()).toBeVisible();
    expect(await content.evaluate(element => element.getAnimations().length)).toBe(0);
    await summary.press('Space');
    await expect(section).not.toHaveAttribute('open');
    await expect(modal).toBeVisible();
  });
}

test('folders and the bin without names center their artwork in cards and previews', async ({ page }) => {
  const centered = async card => {
    const offsets = await card.evaluate(element => {
      const card = element.getBoundingClientRect();
      const visual = element.querySelector('.folder-visual, .recycle-bin-glyph').getBoundingClientRect();
      return {
        x: visual.x + visual.width / 2 - card.x - card.width / 2,
        y: visual.y + visual.height / 2 - card.y - card.height / 2
      };
    });
    expect(Math.abs(offsets.x)).toBeLessThan(0.5);
    expect(Math.abs(offsets.y)).toBeLessThan(0.5);
  };
  for (const type of ['folder', 'recycleBin']) {
    const modal = await openEditor(page, type);
    await modal.locator(type === 'folder' ? '#folder-editor-show-name' : '#recycle-bin-editor-show-name').uncheck();
    await centered(modal.locator(editors[type].preview));
    await modal.locator(editors[type].preview).screenshot({ path: `dist/release-audit/${type}-without-name-centered.png` });
    await page.locator(editors[type].save).click();
    await expect(modal).toBeHidden();
    if (type === 'folder') await page.keyboard.press('Escape');
    const card = page.locator(type === 'folder' ? '#bookmark-container [data-folder-id="editor-folder"]' : '#bookmark-container .recycle-bin');
    for (const size of [{ width: 1280, height: 800 }, { width: 940, height: 720 }, { width: 601, height: 720 }]) {
      await page.setViewportSize(size);
      await centered(card);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  }
});

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

for (const type of ['bookmark', 'folder']) {
  test(`${type}: category icons preview, undo, persist, render in lists and return to the original icon`, async ({ page }) => {
    const iconId = 'music';
    const original = await storedValue(page, type);
    let modal = await openEditor(page, type);
    await modal.locator('.editor-icon-picker summary').click();
    await modal.locator(`[data-icon-choice="${iconId}"]`).click();
    await expect(modal.locator(editors[type].preview).locator(`[data-icon-id="${iconId}"]`)).toBeVisible();
    if (type === 'folder') await expect(modal.locator(editors[type].preview).locator('.folder-tab')).toBeVisible();
    expect((await storedValue(page, type)).iconId).toBeNull();
    await modal.locator('[data-editor-history="undo"]').click();
    await expect(modal.locator(editors[type].preview).locator('[data-icon-id]')).toHaveCount(0);
    await modal.locator('[data-editor-history="redo"]').click();
    await expect(modal.locator(`[data-icon-choice="${iconId}"]`)).toHaveAttribute('aria-pressed', 'true');
    await modal.locator('[data-appearance-look="midnight"]').click();
    await modal.locator('[data-appearance-look="original"]').click();
    await expect(modal.locator(`[data-icon-choice="${iconId}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.locator(editors[type].save).click();
    await expect(modal).toBeHidden();
    await page.reload();
    await expectAppReady(page);
    const saved = await storedValue(page, type);
    expect(saved.iconId).toBe(iconId);
    for (const key of ['id', 'name', 'url', 'folderId', 'groupId', 'gx', 'gy', 'w', 'h']) {
      expect(saved[key]).toEqual(original[key]);
    }
    await page.setViewportSize({ width: 600, height: 800 });
    const row = type === 'bookmark' ? '[data-bookmark-id="editor-bookmark"]'
      : type === 'folder' ? '[data-folder-id="editor-folder"]' : '[data-recycle-bin-id]';
    await expect(page.locator(`#bookmark-container ${row} [data-icon-id="${iconId}"]`)).toBeVisible();
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

test('folder symbols keep their shell, independent color and empty option across editing and reloads', async ({ page }) => {
  let modal = await openEditor(page, 'folder');
  const preview = modal.locator(editors.folder.preview);
  await expect(modal.locator('.folder-symbol-color')).toBeHidden();
  await modal.locator('.editor-icon-picker summary').click();
  await modal.locator('[data-icon-choice="ui-cloud"]').click();
  await expect(preview.locator('.folder-tab')).toBeVisible();
  await expect(preview.locator('.folder-body [data-icon-id="ui-cloud"]')).toBeVisible();
  await expect(preview.locator('.folder-previews')).toHaveCount(0);
  await expect(modal.locator('#folder-editor-show-previews')).toBeDisabled();
  await expect(modal.locator('#folder-editor-show-previews')).toBeHidden();
  await modal.locator('#folder-editor-symbol-color').fill('#ffbb33');
  await expect(preview.locator('.folder-catalog-icon')).toHaveCSS('color', 'rgb(255, 187, 51)');
  await modal.locator('[data-editor-history="undo"]').click();
  await expect(preview.locator('.folder-catalog-icon')).not.toHaveCSS('color', 'rgb(255, 187, 51)');
  await modal.locator('[data-editor-history="redo"]').click();
  await expect(preview.locator('.folder-catalog-icon')).toHaveCSS('color', 'rgb(255, 187, 51)');
  const fill = await preview.locator('.folder-svg-body').evaluate(element => getComputedStyle(element).fill);
  await modal.locator('[data-editor-history="undo"]').click();
  await expect(preview.locator('.folder-catalog-icon')).not.toHaveCSS('color', 'rgb(255, 187, 51)');
  expect(await preview.locator('.folder-svg-body').evaluate(element => getComputedStyle(element).fill)).toBe(fill);
  await modal.locator('#folder-editor-symbol-color').fill('#ffbb33');
  await preview.screenshot({ path: 'dist/release-audit/folder-category-large-preview.png' });
  await page.locator(editors.folder.save).click();
  await expect(modal).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  expect((await storedValue(page, 'folder')).iconColor).toBe('#ffbb33');
  const card = page.locator('#bookmark-container [data-folder-id="editor-folder"]');
  await expect(card.locator('.folder-catalog-icon')).toHaveCSS('color', 'rgb(255, 187, 51)');
  await card.screenshot({ path: 'dist/release-audit/folder-category-large-grid.png' });
  await card.locator('.folder-open').click();
  await page.locator('#folder-modal-edit-toggle').click();
  await expect(page.locator('#folder-modal-customize .folder-body [data-icon-id="ui-cloud"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(card.locator('.folder-tab')).toBeVisible();
  await expect(card.locator('.folder-catalog-icon')).toHaveCSS('color', 'rgb(255, 187, 51)');
  await page.setViewportSize({ width: 1280, height: 800 });
  modal = await openEditor(page, 'folder');
  await modal.locator('.editor-icon-picker summary').click();
  const none = modal.locator('[data-icon-choice=""]');
  await expect(none).toHaveAttribute('aria-label', 'None');
  await expect(none.locator('[data-icon-id="ui-close"]')).toBeVisible();
  await none.click();
  await expect(modal.locator('#folder-editor-show-previews')).toBeVisible();
  await expect(modal.locator('#folder-editor-show-previews')).not.toBeChecked();
  await expect(modal.locator('.folder-symbol-color')).toBeHidden();
  await expect(modal.locator(editors.folder.preview).locator('.folder-tab')).toBeVisible();
  await expect(modal.locator(editors.folder.preview).locator('.folder-category-icon, .bookmark-favicon')).toHaveCount(0);
  await page.locator(editors.folder.save).click();
  await expect(modal).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await expect(card.locator('.folder-tab')).toBeVisible();
  await expect(card.locator('.folder-category-icon, .bookmark-favicon')).toHaveCount(0);
  expect((await storedValue(page, 'folder')).showPreviews).toBe(false);
});

test('every folder symbol is centered inside its front face at card, preview, list and header sizes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { ICON_CATALOG } = await import('/src/shared/icons/iconCatalog.js');
    const { createFolderVisual } = await import('/src/features/folders/folderVisual.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;';
    document.body.append(host);
    const failures = [];
    let checked = 0;
    try {
      for (const width of [28, 40, 120, 156, 200, 280]) {
        for (const { id } of ICON_CATALOG) {
          const visual = createFolderVisual({ iconId: id });
          visual.style.width = `${width}px`;
          host.replaceChildren(visual);
          const face = visual.querySelector('.folder-svg-body');
          const symbol = visual.querySelector('.folder-catalog-icon');
          const center = svg => {
            const bounds = svg.getBBox();
            return new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2).matrixTransform(svg.getScreenCTM());
          };
          const first = center(face);
          const second = center(symbol);
          const box = symbol.getBoundingClientRect();
          const bounds = symbol.getBBox();
          const start = new DOMPoint(bounds.x, bounds.y).matrixTransform(symbol.getScreenCTM());
          const end = new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height).matrixTransform(symbol.getScreenCTM());
          if (Math.abs(first.x - second.x) > .1 || Math.abs(first.y - second.y) > .1
            || start.x < box.left || end.x > box.right || start.y < box.top || end.y > box.bottom) {
            failures.push({ id, width, first, second });
          }
          checked++;
        }
      }
    } finally { host.remove(); }
    return { checked, failures };
  });
  expect(result.failures).toEqual([]);
  expect(result.checked).toBe(480);
});

test('the recycle bin keeps one visible SVG and can only be hidden as a whole', async ({ page }) => {
  const modal = await openEditor(page, 'recycleBin');
  await expect(modal.locator('.editor-icon-picker, #recycle-bin-editor-show-icon')).toHaveCount(0);
  const preview = modal.locator(editors.recycleBin.preview);
  await expect(preview.locator('.recycle-bin-svg')).toBeVisible();
  await modal.locator('#recycle-bin-editor-icon-color').fill('#94a3b8');
  await expect(preview.locator('.recycle-bin-can')).toHaveCSS('stroke', 'rgb(148, 163, 184)');
  await page.locator(editors.recycleBin.save).click();
  await expect(modal).toBeHidden();
  await page.keyboard.press('Escape');
  await page.mouse.move(1000, 700);
  const card = page.locator('#bookmark-container .recycle-bin');
  await card.screenshot({ path: 'dist/release-audit/recycle-bin-closed.png' });
  const lid = card.locator('.recycle-bin-lid-group');
  await expect(lid).toHaveCSS('transform', 'none');
  await card.locator('.recycle-bin-open').hover();
  await expect(lid).not.toHaveCSS('transform', 'none');
  await card.screenshot({ path: 'dist/release-audit/recycle-bin-open.png' });
  await card.locator('.recycle-bin-open').click();
  await expect(page.locator('#recycle-bin-modal-customize .recycle-bin-svg.is-open')).toBeVisible();
  await page.locator('#recycle-bin-modal-customize').click();
  await modal.getByRole('tab', { name: 'General', exact: true }).click();
  await modal.locator('#recycle-bin-editor-visible').uncheck();
  await page.locator(editors.recycleBin.save).click();
  await expect(modal).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await page.reload();
  await expectAppReady(page);
  await expect(card).toHaveCount(0);
});

test('General can disable recycle bin animation without hiding its SVG or changing the preference with looks', async ({ page }) => {
  const modal = await openEditor(page, 'recycleBin');
  await modal.getByRole('tab', { name: 'General', exact: true }).click();
  const animation = modal.locator('#recycle-bin-editor-animate-icon');
  await expect(animation).toBeChecked();
  await animation.uncheck();
  await modal.getByRole('tab', { name: 'Style', exact: true }).click();
  await modal.locator('[data-appearance-look="midnight"]').click();
  await modal.locator('.editor-reset-appearance').click();
  await modal.getByRole('tab', { name: 'General', exact: true }).click();
  await expect(animation).not.toBeChecked();
  await page.locator(editors.recycleBin.save).click();
  await expect(modal).toBeHidden();
  await page.keyboard.press('Escape');
  await page.reload();
  await expectAppReady(page);
  const card = page.locator('#bookmark-container .recycle-bin');
  await expect(card).toHaveClass(/is-recycle-bin-static/);
  await card.locator('.recycle-bin-open').hover();
  await expect(card.locator('.recycle-bin-svg')).toBeVisible();
  await expect(card.locator('.recycle-bin-lid-group')).toHaveCSS('transform', 'none');
  await card.evaluate(element => element.classList.add('is-drop-target'));
  await expect(card).toHaveCSS('transform', 'none');
  await expect(card.locator('.recycle-bin-lid-group')).toHaveCSS('transform', 'none');
  await card.evaluate(element => element.classList.remove('is-drop-target'));
  expect((await storedValue(page, 'recycleBin')).animateIcon).toBe(false);
});

test('external counters are absent while folder contents and launcher symbols remain available', async ({ page }) => {
  for (const type of ['folder', 'recycleBin']) {
    const modal = await openEditor(page, type);
    await expect(modal.locator('[id$="-show-count"]')).toHaveCount(0);
    await expect(modal.locator('.folder-count, .recycle-bin-caption small')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('#bookmark-container .folder-count, #bookmark-container .recycle-bin-caption small')).toHaveCount(0);
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.locator('#bookmark-container [data-folder-id] .bookmark-list-detail')).toHaveCount(0);
  await expect(page.locator('#bookmark-container [data-recycle-bin-id] .bookmark-list-detail')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.mouse.move(5, 400);
  await page.locator('#add-toggle').click();
  await expect(page.locator('#add-bookmark [data-icon-id="ui-bookmark"]')).toBeVisible();
  await expect(page.locator('#add-folder [data-icon-id="ui-folders"]')).toBeVisible();
  await expect(page.locator('#add-bookmark img, #add-folder img')).toHaveCount(0);
  await page.screenshot({ path: 'dist/release-audit/launcher-shared-symbols.png' });
});

test('folder symbol controls fit all languages and cover images retain the centered symbol', async ({ page }) => {
  const modal = await openEditor(page, 'folder');
  await modal.locator('.editor-icon-picker summary').click();
  await modal.locator('[data-icon-choice="ui-cloud"]').click();
  await modal.locator('.editor-icon-picker summary').click();
  for (const width of [1280, 900]) {
    await page.setViewportSize({ width, height: 800 });
    for (const language of ['en', 'es', 'es_419', 'pt_BR']) {
      await page.evaluate(async language => {
        const { changeLanguage } = await import('/src/platform/i18n/i18n.js');
        await changeLanguage({ language });
      }, language);
      const overflow = await modal.locator('.folder-symbol-color').evaluate(row => {
        const bounds = row.getBoundingClientRect();
        return [...row.children].some(child => {
          const box = child.getBoundingClientRect();
          return box.left < bounds.left - 1 || box.right > bounds.right + 1;
        });
      });
      expect(overflow, `${language}, ${width}px`).toBe(false);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await modal.locator('.editor-image-section summary').click();
  await modal.locator('#folder-editor-image').fill('https://images.test/cover.png');
  const preview = modal.locator(editors.folder.preview);
  await expect(preview.locator('.folder-svg image')).toHaveAttribute('href', 'https://images.test/cover.png');
  await expect(preview.locator('.folder-catalog-icon')).toBeVisible();
  await expect(preview.locator('.bookmark-favicon')).toHaveCount(0);
  await modal.locator('#folder-editor-symbol-color').fill('#ffbb33');
  await expect(preview.locator('.folder-catalog-icon')).toHaveCSS('color', 'rgb(255, 187, 51)');
  await preview.screenshot({ path: 'dist/release-audit/folder-symbol-with-cover.png' });
  await modal.locator('.modal-card').screenshot({ path: 'dist/release-audit/folder-symbol-editor-translated.png' });
});

for (const type of ['bookmark', 'folder']) {
  test(`${type}: quick delete and Shift-middle-click confirm, cancel and restore the complete item`, async ({ page }) => {
    if (type === 'folder') {
      await page.evaluate(async () => {
        const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
        const { getState } = await import('/src/state/appStore.js');
        await new Promise(resolve => chrome.storage.local.set({ bookmarks: [...getState().data.bookmarks,
          { ...DEFAULT_BOOKMARK, id: 'delete-child', name: 'Folder child', url: 'https://child.test', folderId: 'editor-folder', gx: 0, gy: 0 }
        ] }, resolve));
      });
      await page.reload();
      await expectAppReady(page);
    }
    await page.keyboard.press('KeyE');
    const source = page.locator(`#bookmark-container [data-${type}-id="editor-${type}"]`);
    const edit = source.locator('.item-action-button.edit');
    const remove = source.locator('.item-action-button.delete');
    await expect(remove.locator('[data-icon-id="ui-trash"]')).toBeVisible();
    const pencil = await edit.boundingBox();
    const trash = await remove.boundingBox();
    expect(trash.x).toBeGreaterThanOrEqual(pencil.x + pencil.width);
    expect(Math.abs(trash.y - pencil.y)).toBeLessThan(.1);
    await remove.click();
    await expect(page.locator('#alert-modal')).toBeVisible();
    await page.locator('#alert-modal-cancel').click();
    await expect(source).toBeVisible();
    await source.click({ button: 'middle', modifiers: ['Shift'] });
    await expect(page.locator('#alert-modal')).toBeVisible();
    await expect(page.locator(editors[type].modal)).toBeHidden();
    await page.locator('#alert-modal-accept').click();
    await expect(source).toHaveCount(0);
    const entry = await page.evaluate(async () => {
      const { getState } = await import('/src/state/appStore.js');
      return getState().data.trash[0];
    });
    expect(entry.type).toBe(type);
    if (type === 'folder') expect(entry.bookmarks.map(bookmark => bookmark.id)).toEqual(['delete-child']);
    await page.keyboard.press('KeyE');
    await page.locator('#bookmark-container .recycle-bin-open').click();
    await page.locator('#recycle-bin-list input').check();
    await page.locator('#recycle-bin-restore-selected').click();
    await expect(page.locator('#recycle-bin-list input')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(source).toBeVisible();
    if (type === 'folder') {
      expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data.bookmarks
        .find(bookmark => bookmark.id === 'delete-child').folderId)).toBe('editor-folder');
    }
  });
}

test('keyboard focus opens the bin lid and the compact header respects its saved appearance', async ({ page }) => {
  const bin = page.locator('#bookmark-container .recycle-bin');
  await page.mouse.move(1000, 700);
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#bookmark-container [data-folder-id="editor-folder"]')).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowRight');
  await expect(bin).toHaveClass(/is-keyboard-active/);
  await expect(bin.locator('.recycle-bin-lid-group')).not.toHaveCSS('transform', 'none');
  await page.keyboard.press('Enter');
  const icon = page.locator('#recycle-bin-modal-customize');
  await expect(icon).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(icon).toHaveCSS('box-shadow', 'none');
  const header = await page.locator('.recycle-bin-modal-header').boundingBox();
  const restore = await page.locator('#recycle-bin-restore-all').boundingBox();
  const title = await page.locator('.recycle-bin-modal-heading').boundingBox();
  expect(restore.x).toBeGreaterThan(title.x + title.width);
  expect(restore.y).toBeGreaterThanOrEqual(header.y);
  expect(restore.y + restore.height).toBeLessThanOrEqual(header.y + header.height);
  await page.locator('#recycle-bin-modal .modal-recycle-bin').screenshot({ path: 'dist/release-audit/recycle-bin-unified-header.png' });
  await page.setViewportSize({ width: 430, height: 800 });
  const buttons = await page.locator('.recycle-bin-toolbar').boundingBox();
  const narrow = await page.locator('#recycle-bin-modal .modal-recycle-bin').boundingBox();
  expect(buttons.x + buttons.width).toBeLessThanOrEqual(narrow.x + narrow.width);
  await expect(page.locator('#recycle-bin-restore-all')).toBeVisible();
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
