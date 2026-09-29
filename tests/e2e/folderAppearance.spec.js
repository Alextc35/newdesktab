import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

const folderId = 'appearance-folder';
const folderCard = page => page.locator(`#bookmark-container [data-folder-id="${folderId}"]`);
const previewCard = page => page.locator('.folder-editor-preview-card');
const saveButton = page => page.locator('#edit-folder-modal-save');

async function start(page, layouts = [{ id: folderId, gx: 0, gy: 0, w: 2, h: 2 }]) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    if (route.request().resourceType() === 'image') {
      return route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#34b399"/></svg>' });
    }
    return route.abort();
  });
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await expect(page.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();
  await page.evaluate(folderLayouts => {
    globalThis.folderAppearanceSetupStatus = 'pending';
    void (async () => {
      try {
        const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
        const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
        const { getState, setState } = await import('/src/state/appStore.js');
        const folders = folderLayouts.map(layout => ({ ...DEFAULT_FOLDER_STYLE,
          noOuterBackground: false,
          showCount: true,
          name: 'Reading', groupId: null, createdAt: 1, updatedAt: 1, ...layout }));
        const bookmarks = folders.flatMap(folder => Array.from({ length: 3 }, (_, index) => ({
          ...DEFAULT_BOOKMARK, id: `${folder.id}-${index}`, name: `Saved page ${index + 1}`,
          url: `https://example.test/page-${index}`, folderId: folder.id, gx: index, gy: 0
        })));
        await setState({ data: { folders, bookmarks,
          settings: { ...getState().data.settings, interfaceTheme: 'dark', language: 'en' } } });
        globalThis.folderAppearanceSetupStatus = 'done';
      } catch (error) {
        globalThis.folderAppearanceSetupStatus = `error: ${error.message}`;
      }
    })();
  }, layouts);
  await expect.poll(() => page.evaluate(() => globalThis.folderAppearanceSetupStatus),
    { timeout: 10_000 }).toBe('done');
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('#bookmark-container .bookmark-folder')).toHaveCount(layouts.length);
}

async function openEditor(page) {
  await folderCard(page).locator('.folder-open').click();
  await expect(page.locator('#folder-modal-customize .edit-indicator-svg')).toBeVisible();
  await page.locator('#folder-modal-customize').click();
  await expect(page.locator('#edit-folder-modal')).toBeVisible();
  await expect(saveButton(page)).toBeHidden();
}

async function tab(page, name) {
  await page.locator('#edit-folder-modal').getByRole('tab', { name, exact: true }).click();
}

async function saveAndClose(page) {
  await saveButton(page).click();
  await expect(page.locator('#edit-folder-modal')).toBeHidden();
  await page.locator('#folder-modal-close').click();
}

async function savedFolder(page) {
  return page.evaluate(async id => (
    (await import('/src/state/appStore.js')).getState().data.folders.find(folder => folder.id === id)
  ), folderId);
}

async function expectBorder(card) {
  await expect(card).toHaveCSS('border-top-style', 'solid');
  expect(await card.evaluate(element => parseFloat(getComputedStyle(element).borderTopWidth)))
    .toBeGreaterThan(0);
  await expect(card).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
}

async function measureGridCardAlignment(page) {
  return page.evaluate(id => {
    const measure = (card, icon, title, count) => {
      const cardRect = card.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const countRect = count?.getBoundingClientRect();
      return {
        iconTop: iconRect.top - cardRect.top,
        titleTop: titleRect.top - cardRect.top,
        titleBottom: titleRect.bottom - cardRect.top,
        gap: titleRect.top - iconRect.bottom,
        countTop: countRect?.height ? countRect.top - cardRect.top : null,
        countBottom: countRect?.height ? countRect.bottom - cardRect.top : null,
        cardHeight: cardRect.height
      };
    };
    const folder = document.querySelector(`[data-folder-id="${id}"]`);
    const bookmark = document.querySelector('[data-bookmark-id="comparison-bookmark"]');
    const recycleBin = document.querySelector('#bookmark-container > .recycle-bin');
    return {
      folder: measure(folder, folder.querySelector('.folder-visual'),
        folder.querySelector('.folder-title'), folder.querySelector('.folder-count')),
      bookmark: measure(bookmark, bookmark.querySelector('.bookmark-favicon'),
        bookmark.querySelector('.bookmark-title')),
      recycleBin: measure(recycleBin, recycleBin.querySelector('.recycle-bin-glyph'),
        recycleBin.querySelector('.recycle-bin-caption strong'),
        recycleBin.querySelector('.recycle-bin-caption small'))
    };
  }, folderId);
}

test('new folders and the default recycle bin have no outer background', async ({ page }) => {
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(async () => {
    const { DEFAULT_RECYCLE_BIN } = await import('/src/domain/recycle-bin/recycleBinDefaults.js');
    const { setState } = await import('/src/state/appStore.js');
    await setState({ data: { bookmarks: [], folders: [],
      recycleBin: structuredClone(DEFAULT_RECYCLE_BIN) } });
  });

  const recycleBin = page.locator('#bookmark-container .recycle-bin');
  await expect(recycleBin).toHaveClass(/is-recycle-bin-transparent/);
  await expect(recycleBin).toHaveClass(/is-recycle-bin-count-hidden/);
  await expect(recycleBin.locator('.recycle-bin-caption small')).toBeHidden();
  await expect(recycleBin).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await page.mouse.move(5, page.viewportSize().height / 2);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.locator('#folder-editor-name').fill('New folder');
  await page.locator('#edit-folder-modal').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('#edit-folder-modal')).toBeHidden();

  const folder = page.locator('#bookmark-container .bookmark-folder', { hasText: 'New folder' });
  await expect(folder).toHaveClass(/is-folder-outer-transparent/);
  await expect(folder).toHaveClass(/is-folder-count-hidden/);
  await expect(folder.locator('.folder-count')).toBeHidden();
  await expect(folder).toHaveCSS('background-image', 'none');
  await expect(folder).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(folder).toHaveCSS('box-shadow', 'none');

  await folder.locator('.folder-open').click();
  await page.locator('#folder-modal-customize').click();
  await page.locator('#edit-folder-modal').getByRole('tab', { name: 'Style' }).click();
  const noOuterBackground = page.locator('#folder-editor-no-outer-background');
  await expect(noOuterBackground).toBeChecked();
  await expect(page.locator('#folder-editor-outer-color')).toBeDisabled();
  await expect(page.locator('#folder-editor-no-background')).not.toBeChecked();
  await page.locator('#edit-folder-modal').getByRole('tab', { name: 'Text' }).click();
  await expect(page.locator('#folder-editor-show-count')).not.toBeChecked();
  await page.locator('#edit-folder-modal').getByRole('tab', { name: 'Style' }).click();
  await noOuterBackground.uncheck();
  await expect(previewCard(page)).not.toHaveCSS('background-image', 'none');
  await page.locator('#edit-folder-modal-save').click();
  await expect(page.locator('#edit-folder-modal')).toBeHidden();
  await page.locator('#folder-modal-close').click();
  await expect(folder).not.toHaveClass(/is-folder-outer-transparent/);
  await page.reload();
  await expectAppReady(page);
  await expect(folder).not.toHaveClass(/is-folder-outer-transparent/);
});

test('aligns bookmark, folder and recycle bin independently of their optional counts', async ({ page }) => {
  await start(page, [{ id: folderId, gx: 0, gy: 0, w: 1, h: 1, showCount: false }]);
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { getState, setState } = await import('/src/state/appStore.js');
    const data = getState().data;
    await setState({ data: { recycleBin: { ...data.recycleBin, gx: 2, gy: 0, w: 1, h: 1 },
      bookmarks: [...data.bookmarks, {
      ...DEFAULT_BOOKMARK,
      id: 'comparison-bookmark', name: 'YouTube', url: 'https://youtube.com',
      backgroundFavicon: true, showText: true, gx: 1, gy: 0, w: 1, h: 1
    }] } });
  });

  const bookmark = page.locator('[data-bookmark-id="comparison-bookmark"]');
  await expect(bookmark).toBeVisible();
  const withoutCounts = await measureGridCardAlignment(page);
  for (const card of [withoutCounts.folder, withoutCounts.recycleBin]) {
    expect(Math.abs(card.iconTop - withoutCounts.bookmark.iconTop)).toBeLessThanOrEqual(2);
    expect(Math.abs(card.titleTop - withoutCounts.bookmark.titleTop)).toBeLessThanOrEqual(2);
    expect(card.gap).toBeGreaterThanOrEqual(5);
    expect(card.countTop).toBeNull();
  }

  await page.evaluate(async id => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const data = getState().data;
    await setState({ data: {
      folders: data.folders.map(folder => folder.id === id ? { ...folder, showCount: true } : folder),
      recycleBin: { ...data.recycleBin, showCount: true }
    } });
  }, folderId);
  await expect(folderCard(page).locator('.folder-count')).toBeVisible();
  await expect(page.locator('#bookmark-container > .recycle-bin .recycle-bin-caption small'))
    .toBeVisible();
  const withCounts = await measureGridCardAlignment(page);
  for (const kind of ['folder', 'recycleBin']) {
    expect(Math.abs(withCounts[kind].iconTop - withoutCounts[kind].iconTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(withCounts[kind].titleTop - withoutCounts[kind].titleTop)).toBeLessThanOrEqual(1);
    expect(withCounts[kind].countTop).toBeGreaterThan(withCounts[kind].titleBottom);
    expect(withCounts[kind].countBottom).toBeLessThan(withCounts[kind].cardHeight);
  }

  await page.evaluate(async id => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const data = getState().data;
    await setState({ data: {
      folders: data.folders.map(folder => folder.id === id ? { ...folder, w: 2, h: 2 } : folder),
      bookmarks: data.bookmarks.map(item => item.id === 'comparison-bookmark'
        ? { ...item, gx: 2, w: 2, h: 2 } : item),
      recycleBin: { ...data.recycleBin, gx: 4, w: 2, h: 2 }
    } });
  }, folderId);
  await expect.poll(() => folderCard(page).evaluate(card => card.getBoundingClientRect().width))
    .toBeGreaterThan(150);
  const enlarged = await measureGridCardAlignment(page);
  for (const card of [enlarged.folder, enlarged.recycleBin]) {
    expect(Math.abs(card.iconTop - enlarged.bookmark.iconTop)).toBeLessThanOrEqual(2);
    expect(Math.abs(card.titleTop - enlarged.bookmark.titleTop)).toBeLessThanOrEqual(2);
    expect(card.countTop).toBeGreaterThan(card.titleBottom);
    expect(card.countBottom).toBeLessThan(card.cardHeight);
  }
});

test('previews, persists and resets the exterior color without making an unchanged editor dirty', async ({ page }) => {
  await start(page);
  const originalBackground = await folderCard(page).evaluate(element => getComputedStyle(element).backgroundImage);
  await openEditor(page);
  await tab(page, 'Style');
  const color = page.locator('#folder-editor-outer-color');
  const reset = page.locator('#folder-editor-outer-color-reset');

  await color.fill('#2468ac');
  await expect(previewCard(page)).toHaveCSS('background-color', 'rgb(36, 104, 172)');
  await expect(previewCard(page)).toHaveCSS('background-image', 'none');
  await expectBorder(previewCard(page));
  await reset.click();
  await expect(saveButton(page)).toBeHidden();
  await color.fill('#2468ac');
  await saveAndClose(page);

  await expect(folderCard(page)).toHaveCSS('background-color', 'rgb(36, 104, 172)');
  await expect(folderCard(page)).toHaveCSS('background-image', 'none');
  await expectBorder(folderCard(page));
  await page.reload();
  await expectAppReady(page);
  await expect(folderCard(page)).toHaveCSS('background-color', 'rgb(36, 104, 172)');
  await openEditor(page);
  await tab(page, 'Style');
  await expect(color).toHaveValue('#2468ac');
  await expect(saveButton(page)).toBeHidden();
  await reset.click();
  await saveAndClose(page);
  await page.reload();
  await expectAppReady(page);
  await expect(folderCard(page)).toHaveCSS('background-image', originalBackground);
  expect((await savedFolder(page)).outerBackgroundColor).toBeNull();
  await openEditor(page);
  await tab(page, 'Style');
  await expect(saveButton(page)).toBeHidden();
});

test('shows the automatic light folder background in the exterior color picker', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    await setState({ data: { settings: {
      ...getState().data.settings,
      interfaceTheme: 'light'
    } } });
  });
  await expect(page.locator('html')).toHaveAttribute('data-interface-theme', 'light');

  await openEditor(page);
  await tab(page, 'Style');
  const color = page.locator('#folder-editor-outer-color');
  const reset = page.locator('#folder-editor-outer-color-reset');
  await expect(color).toHaveValue('#f4f4f5');
  await expect(reset).toBeDisabled();

  await color.fill('#2468ac');
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(color).toHaveValue('#f4f4f5');
  await expect(reset).toBeDisabled();
  await expect(saveButton(page)).toBeHidden();
});

test('shares the bookmark edit control position and adapts it to the folder surface', async ({ page }) => {
  await start(page, [
    { id: 'light-folder', gx: 0, gy: 0, w: 1, h: 1, outerBackgroundColor: '#ffffff' },
    { id: 'dark-folder', gx: 1, gy: 0, w: 1, h: 1, outerBackgroundColor: '#000000' }
  ]);
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { getState, setState } = await import('/src/state/appStore.js');
    await setState({ data: { bookmarks: [...getState().data.bookmarks, {
      ...DEFAULT_BOOKMARK,
      id: 'action-bookmark',
      name: 'Action bookmark',
      url: 'https://action.test',
      gx: 2,
      gy: 0,
      noBackground: false,
      backgroundColor: '#ffffff'
    }] } });
  });
  await page.keyboard.press('Control+KeyE');

  const bookmark = page.locator('[data-bookmark-id="action-bookmark"]');
  const lightFolder = page.locator('[data-folder-id="light-folder"]');
  const darkFolder = page.locator('[data-folder-id="dark-folder"]');
  const editOffset = locator => locator.evaluate(element => {
    const card = element.getBoundingClientRect();
    const action = element.querySelector('.item-action-button.edit').getBoundingClientRect();
    return {
      x: Math.round(action.x - card.x),
      y: Math.round(action.y - card.y),
      width: Math.round(action.width),
      height: Math.round(action.height)
    };
  });

  expect(await editOffset(lightFolder)).toEqual(await editOffset(bookmark));
  await expect(lightFolder.locator('.item-action-button.edit')).toHaveClass(/is-light/);
  await expect(darkFolder.locator('.item-action-button.edit')).toHaveClass(/is-dark/);
});

test('keeps folder artwork and captions aligned across visibility and editing states', async ({ page }) => {
  await start(page, [
    { id: folderId, gx: 0, gy: 0, w: 1, h: 1 },
    { id: 'no-name-folder', gx: 1, gy: 0, w: 1, h: 1, showName: false },
    { id: 'no-count-folder', gx: 2, gy: 0, w: 1, h: 1, showCount: false },
    { id: 'visual-only-folder', gx: 3, gy: 0, w: 1, h: 1,
      showName: false, showCount: false }
  ]);

  const cards = page.locator('#bookmark-container .bookmark-folder');
  const captionHeights = await cards.evaluateAll(elements => elements.map(element => (
    element.querySelector('.folder-caption').getBoundingClientRect().height
  )));
  expect(captionHeights[0]).toBeGreaterThan(captionHeights[1]);
  expect(captionHeights[0]).toBe(captionHeights[2]);
  expect(captionHeights[3]).toBe(0);

  const geometry = await folderCard(page).evaluate(element => {
    const card = element.getBoundingClientRect();
    const visual = element.querySelector('.folder-visual').getBoundingClientRect();
    const title = element.querySelector('.folder-title').getBoundingClientRect();
    const count = element.querySelector('.folder-count').getBoundingClientRect();
    return {
      card: card.toJSON(),
      visual: visual.toJSON(),
      title: title.toJSON(),
      count: count.toJSON()
    };
  });
  const cardCenter = geometry.card.x + geometry.card.width / 2;
  expect(Math.abs(geometry.visual.x + geometry.visual.width / 2 - cardCenter)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.title.x + geometry.title.width / 2 - cardCenter)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.count.x + geometry.count.width / 2 - cardCenter)).toBeLessThanOrEqual(1);
  expect(geometry.title.y).toBeGreaterThanOrEqual(geometry.visual.y + geometry.visual.height);
  expect(geometry.card.y + geometry.card.height - geometry.count.y - geometry.count.height)
    .toBeLessThanOrEqual(18);

  await page.keyboard.press('Control+KeyE');
  const editingWidth = await folderCard(page).locator('.folder-visual')
    .evaluate(element => element.getBoundingClientRect().width);
  expect(Math.abs(editingWidth - geometry.visual.width)).toBeLessThanOrEqual(1);

  await folderCard(page).locator('.item-action-button.edit').click();
  const previewGeometry = await previewCard(page).evaluate(element => {
    const card = element.getBoundingClientRect();
    const visual = element.querySelector('.folder-visual').getBoundingClientRect();
    const title = element.querySelector('.folder-title').getBoundingClientRect();
    const count = element.querySelector('.folder-count').getBoundingClientRect();
    return {
      card: card.toJSON(),
      visual: visual.toJSON(),
      title: title.toJSON(),
      count: count.toJSON()
    };
  });
  const previewCenter = previewGeometry.card.x + previewGeometry.card.width / 2;
  expect(Math.abs(previewGeometry.card.width - previewGeometry.card.height)).toBeLessThanOrEqual(1);
  expect(previewGeometry.card.width).toBeLessThanOrEqual(150);
  expect(Math.abs(
    previewGeometry.visual.x + previewGeometry.visual.width / 2 - previewCenter
  )).toBeLessThanOrEqual(1);
  expect(Math.abs(
    previewGeometry.title.x + previewGeometry.title.width / 2 - previewCenter
  )).toBeLessThanOrEqual(1);
  expect(Math.abs(
    previewGeometry.count.x + previewGeometry.count.width / 2 - previewCenter
  )).toBeLessThanOrEqual(1);
  expect(previewGeometry.title.y)
    .toBeGreaterThanOrEqual(previewGeometry.visual.y + previewGeometry.visual.height);
  expect(
    previewGeometry.card.y + previewGeometry.card.height
      - previewGeometry.count.y - previewGeometry.count.height
  ).toBeLessThanOrEqual(18);
});

test('hides previews and keeps the folder name and saved count independently configurable', async ({ page }) => {
  await start(page);
  await openEditor(page);
  await expect(previewCard(page).locator('.folder-previews .bookmark-favicon')).toHaveCount(3);
  await tab(page, 'Style');
  await page.locator('#folder-editor-show-previews').uncheck();
  await expect(previewCard(page).locator('.folder-previews')).toBeHidden();
  await expect(previewCard(page).locator('.folder-visual')).toBeVisible();
  await tab(page, 'Text');
  await page.locator('#folder-editor-show-name').uncheck();
  await expect(previewCard(page).locator('.folder-title')).toBeHidden();
  await expect(previewCard(page).locator('.folder-count')).toBeVisible();
  await saveAndClose(page);
  await page.reload();
  await expectAppReady(page);

  await expect(folderCard(page).locator('.folder-previews')).toBeHidden();
  await expect(folderCard(page).locator('.folder-visual')).toBeVisible();
  await expect(folderCard(page).locator('.folder-title')).toBeHidden();
  await expect(folderCard(page).locator('.folder-count')).toHaveText('3 saved');
  await expect(folderCard(page).locator('.folder-count')).toBeVisible();
  await openEditor(page);
  await tab(page, 'Style');
  await expect(page.locator('#folder-editor-show-previews')).not.toBeChecked();
  await expect(page.locator('#folder-editor-show-previews')).toBeEnabled();
  await tab(page, 'Text');
  await expect(page.locator('#folder-editor-show-name')).not.toBeChecked();
  await expect(page.locator('#folder-editor-show-count')).toBeChecked();
  await page.locator('#folder-editor-show-name').check();
  await page.locator('#folder-editor-show-count').uncheck();
  await expect(previewCard(page).locator('.folder-title')).toBeVisible();
  await expect(previewCard(page).locator('.folder-count')).toBeHidden();
  await saveAndClose(page);
  await page.reload();
  await expectAppReady(page);
  await expect(folderCard(page).locator('.folder-title')).toBeVisible();
  await expect(folderCard(page).locator('.folder-count')).toBeHidden();
  await openEditor(page);
  await tab(page, 'Text');
  await expect(page.locator('#folder-editor-show-name')).toBeChecked();
  await expect(page.locator('#folder-editor-show-count')).not.toBeChecked();
});

test('hiding the glyph also hides previews while an empty bordered card still opens its folder', async ({ page }) => {
  await start(page);
  await openEditor(page);
  await tab(page, 'Style');
  const showFolder = page.locator('#folder-editor-show-folder');
  const showPreviews = page.locator('#folder-editor-show-previews');
  await expect(showPreviews).toBeChecked();
  await showFolder.uncheck();
  await expect(showPreviews).not.toBeChecked();
  await expect(showPreviews).toBeDisabled();
  await expect(previewCard(page).locator('.folder-visual')).toBeHidden();
  await expect(previewCard(page).locator('.folder-previews')).toBeHidden();
  await tab(page, 'Text');
  await page.locator('#folder-editor-show-name').uncheck();
  await page.locator('#folder-editor-show-count').uncheck();
  await expectBorder(previewCard(page));
  await saveAndClose(page);
  await page.reload();
  await expectAppReady(page);

  await expect(folderCard(page)).toBeVisible();
  await expectBorder(folderCard(page));
  for (const selector of ['.folder-visual', '.folder-previews', '.folder-title', '.folder-count']) {
    await expect(folderCard(page).locator(selector)).toBeHidden();
  }
  expect(await savedFolder(page)).toMatchObject({
    name: 'Reading', showFolder: false, showPreviews: false, showName: false, showCount: false
  });
  await folderCard(page).getByRole('button', { name: /Open Reading/ }).click();
  await expect(page.locator('#folder-modal')).toBeVisible();
  await expect(page.locator('#folder-modal-items [data-bookmark-id]')).toHaveCount(3);
  await page.locator('#folder-modal-customize').click();
  await expect(saveButton(page)).toBeHidden();
  await tab(page, 'Style');
  await expect(showFolder).not.toBeChecked();
  await expect(showPreviews).not.toBeChecked();
  await expect(showPreviews).toBeDisabled();
  await showFolder.check();
  await expect(showPreviews).toBeEnabled();
  await showPreviews.check();
  await expect(previewCard(page).locator('.folder-visual')).toBeVisible();
  await expect(previewCard(page).locator('.folder-previews')).toBeVisible();
});

test('transparent SVG tabs meet the folder face at small, normal and large sizes', async ({ page }) => {
  await start(page, [
    { id: 'small-folder', gx: 0, gy: 0, w: 1, h: 1, noBackground: true },
    { id: folderId, gx: 1, gy: 0, w: 2, h: 2, noBackground: true },
    { id: 'large-folder', gx: 3, gy: 0, w: 4, h: 3, noBackground: true }
  ]);
  const assertTabBounds = async visual => {
    await expect(visual).toBeVisible();
    const structure = await visual.evaluate(element => {
      const svg = element.querySelector('.folder-svg');
      const tab = svg.querySelector('.folder-tab');
      const body = svg.querySelector('.folder-svg-body');
      return {
        viewBox: svg.getAttribute('viewBox'),
        preserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
        sameArtwork: tab.parentElement === body.parentElement,
        bodyPaintsAfterTab: Boolean(
          tab.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
        shadow: getComputedStyle(element).filter,
        tabFill: getComputedStyle(tab).fill,
        bodyFill: getComputedStyle(body).fill,
        highlight: getComputedStyle(svg.querySelector('.folder-svg-highlight')).display,
        bodyOverlay: getComputedStyle(element.querySelector('.folder-body'), '::before').backgroundImage
      };
    });
    expect(structure).toEqual({
      viewBox: '0 0 136 100',
      preserveAspectRatio: 'xMidYMid meet',
      sameArtwork: true,
      bodyPaintsAfterTab: true,
      shadow: 'none',
      tabFill: 'none',
      bodyFill: 'none',
      highlight: 'none',
      bodyOverlay: 'none'
    });
  };
  for (const visual of await page.locator('#bookmark-container .folder-visual').all()) {
    await assertTabBounds(visual);
  }
  await folderCard(page).locator('.folder-open').click();
  await assertTabBounds(page.locator('#folder-modal-customize .folder-visual'));
  await page.locator('#folder-modal-customize').click();
  await assertTabBounds(previewCard(page).locator('.folder-visual'));
});

test('fills the entire SVG folder silhouette with one continuous image', async ({ page }) => {
  const image = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="#ef4444"/></svg>'
  )}`;
  await start(page, [
    { id: folderId, gx: 0, gy: 0, w: 1, h: 1, backgroundImageUrl: image },
    { id: 'transparent-image-folder', gx: 1, gy: 0, w: 2, h: 2,
      backgroundImageUrl: image, noBackground: true }
  ]);

  for (const visual of await page.locator('#bookmark-container .folder-visual').all()) {
    const appearance = await visual.evaluate((element, imageUrl) => {
      const svg = element.querySelector('.folder-svg');
      const pattern = svg.querySelector('pattern');
      const tab = svg.querySelector('.folder-tab');
      const body = svg.querySelector('.folder-svg-body');
      const artwork = element.getBoundingClientRect();
      const face = element.querySelector('.folder-body').getBoundingClientRect();
      const previews = element.querySelector('.folder-previews').getBoundingClientRect();
      return {
        patternId: pattern.id,
        patternUnits: pattern.getAttribute('patternUnits'),
        imageSource: pattern.querySelector('image').getAttribute('href'),
        imageSize: [pattern.querySelector('image').getAttribute('width'),
          pattern.querySelector('image').getAttribute('height')],
        imageFit: pattern.querySelector('image').getAttribute('preserveAspectRatio'),
        sameFill: getComputedStyle(tab).fill === getComputedStyle(body).fill,
        tabFill: getComputedStyle(tab).fill,
        previewsInside: previews.left >= face.left && previews.right <= face.right
          && previews.top >= face.top && previews.bottom <= face.bottom,
        imageMatches: pattern.querySelector('image').getAttribute('href') === imageUrl,
        artworkRatio: artwork.width / artwork.height
      };
    }, image);
    expect(appearance.patternUnits).toBe('userSpaceOnUse');
    expect(appearance.imageSource).toBe(image);
    expect(appearance.imageSize).toEqual(['136', '100']);
    expect(appearance.imageFit).toBe('xMidYMid slice');
    expect(appearance.sameFill).toBe(true);
    expect(appearance.tabFill).toContain(appearance.patternId);
    expect(appearance.previewsInside).toBe(true);
    expect(appearance.artworkRatio).toBeCloseTo(1.36, 1);
  }

  await openEditor(page);
  await expect(previewCard(page).locator('.folder-svg pattern image'))
    .toHaveAttribute('href', image);
});

test('centers the search glyph and preserves the opened-folder SVG proportions', async ({ page }) => {
  await start(page, [{
    id: folderId,
    gx: 0,
    gy: 0,
    w: 2,
    h: 2,
    backgroundImageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="%230ea5e9"/%3E%3C/svg%3E'
  }]);

  await page.mouse.move(640, 799);
  const searchGeometry = await page.locator('#search-bookmarks').evaluate(button => {
    const control = button.getBoundingClientRect();
    const glyph = button.querySelector('svg').getBoundingClientRect();
    return { control: control.toJSON(), glyph: glyph.toJSON() };
  });
  expect(searchGeometry.glyph.width).toBeGreaterThanOrEqual(20);
  expect(Math.abs(
    searchGeometry.glyph.x + searchGeometry.glyph.width / 2
      - searchGeometry.control.x - searchGeometry.control.width / 2
  )).toBeLessThanOrEqual(1);
  expect(Math.abs(
    searchGeometry.glyph.y + searchGeometry.glyph.height / 2
      - searchGeometry.control.y - searchGeometry.control.height / 2
  )).toBeLessThanOrEqual(1);
  await folderCard(page).locator('.folder-open').click();
  const previewGeometry = await page.locator('#folder-modal-customize').evaluate(button => {
    const control = button.getBoundingClientRect();
    const preview = button.querySelector('.folder-visual').getBoundingClientRect();
    return { control: control.toJSON(), preview: preview.toJSON() };
  });
  expect(previewGeometry.preview.width / previewGeometry.control.width).toBeGreaterThan(.8);
  expect(previewGeometry.preview.height / previewGeometry.control.height).toBeGreaterThan(.6);
  expect(Math.abs(
    previewGeometry.preview.width / previewGeometry.preview.height - 1.36
  )).toBeLessThan(.02);
  expect(Math.abs(
    previewGeometry.preview.x + previewGeometry.preview.width / 2
      - previewGeometry.control.x - previewGeometry.control.width / 2
  ), JSON.stringify(previewGeometry)).toBeLessThanOrEqual(1);
  expect(Math.abs(
    previewGeometry.preview.y + previewGeometry.preview.height / 2
      - previewGeometry.control.y - previewGeometry.control.height / 2
  )).toBeLessThanOrEqual(1);
});
