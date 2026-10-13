import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

for (const theme of ['light', 'dark']) {
  test(`list and trash SVGs retain saved artwork colors in the ${theme} interface`, async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue() : route.abort());
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/tests/browser-harness.html');
    await expectAppReady(page);
    await page.evaluate(async theme => {
      const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
      const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
      const { DEFAULT_RECYCLE_BIN } = await import('/src/domain/recycle-bin/recycleBinDefaults.js');
      const { getState } = await import('/src/state/appStore.js');
      const bookmarks = ['mail', 'ideas', 'code'].map((iconId, i) => ({ ...DEFAULT_BOOKMARK,
        id: `artwork-${i}`, name: iconId, url: 'https://artwork.internal', iconId,
        gx: i, gy: 1, noBackground: false, backgroundFavicon: i === 2,
        backgroundColor: i === 2 ? '#111827' : '#ffffff',
        textColor: i === 2 ? '#ffbb33' : '#000000' }));
      await new Promise(resolve => chrome.storage.local.set({ bookmarks,
        folders: [{ ...DEFAULT_FOLDER_STYLE, id: 'artwork-folder', name: 'Folder',
          gx: 4, gy: 0, w: 1, h: 1, groupId: null, iconId: 'ui-cloud', iconColor: '#000000' }],
        recycleBin: { ...DEFAULT_RECYCLE_BIN, gx: 5, gy: 0, noBackground: false,
          backgroundColor: '#ffffff', iconColor: '#000000' },
        trash: [{ id: 'artwork-trash', type: 'bookmark', deletedAt: Date.now(), bookmark: bookmarks[0] }],
        settings: { ...getState().data.settings, interfaceTheme: theme, showRecycleBin: true }
      }, resolve));
    }, theme);
    await page.reload();
    await expectAppReady(page);
    const colors = ['rgb(0, 0, 0)', 'rgb(0, 0, 0)', 'rgb(255, 187, 51)'];
    for (const [i, color] of colors.entries()) {
      await expect(page.locator(`[data-bookmark-id="artwork-${i}"] .catalog-icon`)).toHaveCSS('color', color);
    }
    await page.setViewportSize({ width: 430, height: 800 });
    await expect(page.locator('#bookmark-container')).toHaveClass(/is-list-view/);
    for (const [i, color] of colors.entries()) {
      await expect(page.locator(`[data-bookmark-id="artwork-${i}"] .catalog-icon`)).toHaveCSS('color', color);
    }
    await expect(page.locator('[data-folder-id="artwork-folder"] .folder-catalog-icon'))
      .toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(page.locator('.recycle-bin-list-icon .recycle-bin-can'))
      .toHaveCSS('stroke', 'rgb(0, 0, 0)');
    await page.locator('.recycle-bin-list-item .recycle-bin-list-link').click();
    await expect(page.locator('[data-trash-id="artwork-trash"] .catalog-icon'))
      .toHaveCSS('color', 'rgb(0, 0, 0)');
  });
}
