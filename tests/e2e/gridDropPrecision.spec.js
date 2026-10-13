import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
});

for (const mode of ['none', 'cascade', 'relocate']) {
  test(`the cursor resolves all four corners of a card gap in ${mode} mode`, async ({ page }) => {
    await page.evaluate(async mode => {
      const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
      const { getState } = await import('/src/state/appStore.js');
      const positions = [[2, 2], [3, 2], [2, 3], [3, 3], [5, 4]];
      await new Promise(resolve => chrome.storage.local.set({
        bookmarks: positions.map(([gx, gy], index) => ({
          ...DEFAULT_BOOKMARK, id: `gap-${index}`, name: `Gap ${index}`,
          url: 'https://gap.test', gx, gy, w: 1, h: 1, groupId: null
        })), folders: [], trash: [],
        settings: { ...getState().data.settings, language: 'en', showRecycleBin: false, bookmarkDragMode: mode }
      }, resolve));
    }, mode);
    await page.reload();
    await expectAppReady(page);
    await page.keyboard.press('KeyE');
    const source = page.locator('#bookmark-container [data-bookmark-id="gap-4"]');
    const original = await source.boundingBox();
    const grid = await page.locator('#bookmark-container').boundingBox();
    const cellWidth = grid.width / 12;
    const cellHeight = grid.height / 6;
    // Grab near the bottom-right corner instead of the centre of the card.
    await page.mouse.move(original.x + original.width - 20, original.y + original.height - 20);
    await page.mouse.down();
    for (const [dx, dy] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) {
      await page.mouse.move(grid.x + 3 * cellWidth + dx, grid.y + 3 * cellHeight + dy, { steps: 8 });
      const gx = dx < 0 ? 2 : 3;
      const gy = dy < 0 ? 2 : 3;
      await expect(source).toHaveClass(/is-dragging/);
      if (mode === 'none') await expect(source).toHaveClass(/is-invalid/);
      else await expect(source).not.toHaveClass(/is-invalid/);
      await expect.poll(async () => {
        const box = await source.boundingBox();
        return Math.abs(box.x - (original.x + (gx - 5) * cellWidth)) < 1
          && Math.abs(box.y - (original.y + (gy - 4) * cellHeight)) < 1;
      }, { message: `gap corner ${dx}, ${dy} must use cell ${gx}, ${gy}` }).toBe(true);
      const previous = await source.boundingBox();
      for (const offset of [-1, 0, 1]) {
        await page.mouse.move(grid.x + 3 * cellWidth + offset, grid.y + 3 * cellHeight + offset);
        const retained = await source.boundingBox();
        expect(retained.x).toBeCloseTo(previous.x, 0);
        expect(retained.y).toBeCloseTo(previous.y, 0);
      }
    }
    await page.mouse.move(grid.x + 2.5 * cellWidth, grid.y + 4.5 * cellHeight, { steps: 8 });
    await expect(source).not.toHaveClass(/is-invalid/);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(async () => {
      const { getState } = await import('/src/state/appStore.js');
      const { gx, gy } = getState().data.bookmarks.find(item => item.id === 'gap-4');
      return { gx, gy };
    })).toEqual({ gx: 2, gy: 4 });
  });
}

for (const kind of ['bookmark', 'folder']) {
  test(`${kind}: touching the four bin borders never snaps into its occupied cell`, async ({ page }) => {
    for (const direction of ['left', 'right', 'top', 'bottom']) {
      await page.evaluate(async ({ kind, direction }) => {
        const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
        const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
        const { DEFAULT_RECYCLE_BIN } = await import('/src/domain/recycle-bin/recycleBinDefaults.js');
        const { getState } = await import('/src/state/appStore.js');
        const gx = direction === 'left' ? 1 : direction === 'right' ? 3 : 2;
        const gy = direction === 'top' ? 1 : direction === 'bottom' ? 3 : 2;
        const item = { id: 'precision-source', name: 'Precision', gx: 2, gy: 2, w: 1, h: 1, groupId: null };
        await new Promise(resolve => chrome.storage.local.set({
          bookmarks: kind === 'bookmark' ? [{ ...DEFAULT_BOOKMARK, ...item, url: 'https://precision.test' }] : [],
          folders: kind === 'folder' ? [{ ...DEFAULT_FOLDER_STYLE, ...item, iconId: 'ui-cloud' }] : [],
          recycleBin: { ...DEFAULT_RECYCLE_BIN, gx, gy }, trash: [],
          settings: { ...getState().data.settings, language: 'en', bookmarkDragMode: 'none' }
        }, resolve));
      }, { kind, direction });
      await page.reload();
      await expectAppReady(page);
      await page.keyboard.press('KeyE');
      const source = page.locator(`#bookmark-container [data-${kind}-id="precision-source"]`);
      const bin = page.locator('#bookmark-container .recycle-bin');
      const original = await source.boundingBox();
      const bounds = await bin.boundingBox();
      const horizontal = ['left', 'right'].includes(direction);
      const before = direction === 'left' || direction === 'top';
      const start = horizontal
        ? { x: original.x + (before ? original.width - 14 : 14), y: original.y + original.height / 2 }
        : { x: original.x + original.width - 14, y: original.y + (before ? original.height - 14 : 14) };
      const outside = horizontal
        ? { x: before ? bounds.x + bounds.width + 9 : bounds.x - 9, y: start.y }
        : { x: bounds.x + bounds.width / 2, y: before ? bounds.y + bounds.height + 9 : bounds.y - 9 };
      const inside = horizontal
        ? { x: before ? bounds.x + bounds.width + 2 : bounds.x - 2, y: start.y }
        : { x: outside.x, y: before ? bounds.y + bounds.height + 2 : bounds.y - 2 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(outside.x, outside.y, { steps: 8 });
      await expect(source).toHaveClass(/is-dragging/);
      await expect(source).not.toHaveClass(/is-invalid|is-drop-landing/);
      await expect(bin).not.toHaveClass(/is-drop-target/);
      const held = await source.boundingBox();
      expect(held.x, direction).toBeCloseTo(original.x, 0);
      expect(held.y, direction).toBeCloseTo(original.y, 0);
      await page.mouse.move(inside.x, inside.y);
      await expect(source).toHaveClass(/is-drop-landing/);
      await expect(bin).toHaveClass(/is-drop-target/);
      await page.mouse.move(outside.x, outside.y);
      await expect(source).not.toHaveClass(/is-invalid|is-drop-landing/);
      await expect(bin).not.toHaveClass(/is-drop-target/);
      await page.mouse.up();
      await expect(source).toBeVisible();
      await expect(page.locator('#alert-modal')).toBeHidden();
      const data = await page.evaluate(async kind => {
        const { getState } = await import('/src/state/appStore.js');
        const data = getState().data;
        return { item: data[kind === 'folder' ? 'folders' : 'bookmarks'][0], trash: data.trash };
      }, kind);
      expect(data.item).toMatchObject({ id: 'precision-source', gx: 2, gy: 2 });
      expect(data.trash).toEqual([]);
    }
  });
}

for (const kind of ['bookmark', 'folder']) {
  test(`${kind}: all eight bin handles open the lid and accept a real drop`, async ({ page }) => {
    await page.evaluate(async kind => {
      const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
      const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
      const { DEFAULT_RECYCLE_BIN } = await import('/src/domain/recycle-bin/recycleBinDefaults.js');
      const item = { id: 'handle-source', name: 'Handles', gx: 2, gy: 2, w: 1, h: 1, groupId: null };
      await new Promise(resolve => chrome.storage.local.set({
        bookmarks: kind === 'bookmark' ? [{ ...DEFAULT_BOOKMARK, ...item, url: 'https://handles.test' }] : [],
        folders: kind === 'folder' ? [{ ...DEFAULT_FOLDER_STYLE, ...item }] : [],
        recycleBin: { ...DEFAULT_RECYCLE_BIN, gx: 1, gy: 2 }, trash: []
      }, resolve));
    }, kind);
    await page.reload();
    await expectAppReady(page);
    await page.keyboard.press('KeyE');
    const source = page.locator(`#bookmark-container [data-${kind}-id="handle-source"]`);
    const bin = page.locator('#bookmark-container .recycle-bin');
    const bounds = await source.boundingBox();
    const handles = await bin.locator('.resizer').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      const direction = element.className.replace('resizer ', '');
      return {
        direction,
        x: direction.includes('left') ? box.left + 2 : direction.includes('right') ? box.right - 2 : box.left + box.width / 2,
        y: direction.includes('top') ? box.top + 2 : direction.includes('bottom') ? box.bottom - 2 : box.top + box.height / 2
      };
    }));
    expect(handles).toHaveLength(8);
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (const handle of handles) {
      await page.mouse.move(handle.x, handle.y, { steps: 8 });
      await expect(bin, handle.direction).toHaveClass(/is-drop-target/);
      await expect(source, handle.direction).toHaveClass(/is-drop-landing/);
      await expect(bin.locator('.recycle-bin-lid-group')).not.toHaveCSS('transform', 'none');
      await page.mouse.move(start.x, start.y, { steps: 8 });
      await expect(bin).not.toHaveClass(/is-drop-target/);
      await expect(source).not.toHaveClass(/is-drop-landing|is-invalid/);
    }
    await page.mouse.move(handles[0].x, handles[0].y, { steps: 8 });
    await page.mouse.up();
    if (kind === 'folder') {
      await expect(page.locator('#alert-modal')).toBeVisible();
      await page.locator('#alert-modal-accept').click();
    }
    await expect(source).toHaveCount(0);
    await expect.poll(() => page.evaluate(async () => {
      const { getState } = await import('/src/state/appStore.js');
      return getState().data.trash.map(entry => entry.type);
    })).toEqual([kind]);
  });
}
