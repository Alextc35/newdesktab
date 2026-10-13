import { expect, test } from './helpers/test.js';
import { expectAppReady } from './helpers/appReady.js';

const data = page => page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
async function dragTo(page, source, destination) {
  const box = await source.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 12 });
  await page.mouse.up();
}
async function seed(page, scenario) {
  await page.evaluate(async scenario => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
    const { DEFAULT_RECYCLE_BIN } = await import('/src/domain/recycle-bin/recycleBinDefaults.js');
    const { getState } = await import('/src/state/appStore.js');
    const bookmark = (id, gx, gy, folderId = null) => ({ ...DEFAULT_BOOKMARK, id, name: id,
      url: 'https://capacity.test', iconId: 'mail', gx, gy, folderId });
    const folder = { ...DEFAULT_FOLDER_STYLE, id: 'cap-folder', name: 'Capacity', gx: 2, gy: 1, w: 1, h: 1 };
    const fullGrid = scenario === 'grid';
    const children = Array.from({ length: scenario === 'folder' ? 17 : 18 }, (_, i) => bookmark(`child-${i}`, i % 6, Math.floor(i / 6), folder.id));
    const bookmarks = fullGrid
      ? Array.from({ length: 71 }, (_, i) => bookmark(`cap-${i}`, (i + 1) % 12, Math.floor((i + 1) / 12)))
      : [...children, bookmark('candidate-18', 0, 1), ...(scenario === 'folder' ? [bookmark('candidate-19', 0, 2)] : [])];
    const trashCount = scenario === 'trash' ? 250 : fullGrid ? 1 : 0;
    await new Promise(resolve => chrome.storage.local.set({ bookmarks, folders: fullGrid ? [] : [folder],
      recycleBin: { ...DEFAULT_RECYCLE_BIN, gx: fullGrid ? 0 : 5, gy: fullGrid ? 0 : 1 },
      trash: Array.from({ length: trashCount }, (_, i) => ({ id: `old-trash-${i}`, type: 'bookmark',
        deletedAt: Date.now(), bookmark: bookmark(`old-deleted-${i}`, 0, 0) })),
      settings: { ...getState().data.settings, language: 'en', showRecycleBin: true,
        recycleBinRetentionDays: 0, bookmarkDragMode: 'none' }
    }, resolve));
  }, scenario);
  await page.reload();
  await expectAppReady(page);
  await page.keyboard.press('KeyE');
}

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
});

test('the eighteenth folder bookmark succeeds and the nineteenth stays in place with a full-folder flash', async ({ page }) => {
  await seed(page, 'folder');
  const folder = page.locator('#bookmark-container [data-folder-id="cap-folder"]');
  const box = await folder.boundingBox();
  const destination = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await dragTo(page, page.locator('#bookmark-container [data-bookmark-id="candidate-18"]'), destination);
  await expect(page.locator('.flash-success')).toContainText('Bookmark added to folder');
  await expect.poll(async () => (await data(page)).bookmarks.filter(item => item.folderId === 'cap-folder').length).toBe(18);
  const nineteenth = page.locator('#bookmark-container [data-bookmark-id="candidate-19"]');
  const previous = (await data(page)).bookmarks.find(item => item.id === 'candidate-19');
  await dragTo(page, nineteenth, destination);
  await expect(page.locator('.flash-error')).toContainText('This folder already has 18 bookmarks');
  expect((await data(page)).bookmarks.find(item => item.id === 'candidate-19')).toEqual(previous);
  expect((await data(page)).bookmarks.filter(item => item.folderId === 'cap-folder')).toHaveLength(18);
  await page.reload();
  await expectAppReady(page);
  expect((await data(page)).bookmarks.filter(item => item.folderId === 'cap-folder')).toHaveLength(18);
});

test('a full grid cannot drag or resize outside its bounds and unrestorable items remain in trash', async ({ page }) => {
  await seed(page, 'grid');
  const source = page.locator('#bookmark-container [data-bookmark-id="cap-70"]');
  const before = (await data(page)).bookmarks;
  const grid = await page.locator('#bookmark-container').boundingBox();
  for (const destination of [
    { x: grid.x - 30, y: grid.y + grid.height / 2 },
    { x: grid.x + grid.width + 30, y: grid.y + grid.height / 2 },
    { x: grid.x + grid.width / 2, y: grid.y - 30 },
    { x: grid.x + grid.width / 2, y: grid.y + grid.height + 30 }
  ]) {
    await dragTo(page, source, destination);
    await expect(source).not.toHaveClass(/is-dragging/);
    expect((await data(page)).bookmarks).toEqual(before);
  }
  for (const direction of ['right', 'bottom']) await source.locator(`.resizer.${direction}`).click();
  expect((await data(page)).bookmarks).toEqual(before);
  for (const item of [...(await data(page)).bookmarks, (await data(page)).recycleBin]) {
    expect(item.gx).toBeGreaterThanOrEqual(0);
    expect(item.gy).toBeGreaterThanOrEqual(0);
    expect(item.gx + item.w).toBeLessThanOrEqual(12);
    expect(item.gy + item.h).toBeLessThanOrEqual(6);
  }
  await page.keyboard.press('KeyE');
  await page.locator('#bookmark-container .recycle-bin-open').click();
  await page.locator('#recycle-bin-restore-all').click();
  await expect(page.locator('#alert-modal')).toContainText('They remain in the recycle bin');
  expect((await data(page)).trash).toHaveLength(1);
  expect((await data(page)).bookmarks).toEqual(before);
});

test('trash accepts more than grid and folder capacity, retains folder contents and emits success flashes', async ({ page }) => {
  await seed(page, 'trash');
  for (const selector of ['[data-bookmark-id="candidate-18"]', '[data-folder-id="cap-folder"]']) {
    await page.locator(`#bookmark-container ${selector} .item-action-button.delete`).click();
    await page.locator('#alert-modal-accept').click();
    await expect(page.locator('.flash-success').last()).toContainText('Moved to the recycle bin');
  }
  const saved = await data(page);
  expect(saved.bookmarks).toEqual([]);
  expect(saved.folders).toEqual([]);
  expect(saved.trash).toHaveLength(252);
  expect(saved.trash.find(entry => entry.type === 'folder').bookmarks).toHaveLength(18);
  expect(new Set(saved.trash.map(entry => entry.id)).size).toBe(252);
  await page.reload();
  await expectAppReady(page);
  expect((await data(page)).trash).toHaveLength(252);
  await page.locator('#bookmark-container .recycle-bin-open').click();
  await expect(page.locator('#recycle-bin-list .recycle-bin-item')).toHaveCount(252);
});
