import { expect, test } from './helpers/test.js';
import { expectAppReady } from './helpers/appReady.js';

const dialog = page => page.locator('#browser-bookmark-import-modal');
const treeView = page => page.locator('#browser-bookmark-import-tree');
const checkbox = (page, id) => treeView(page).locator(`input[data-node-id="${id}"]`);
const expand = async (page, id) => {
  const toggle = treeView(page).locator(`button[data-toggle-id="${id}"]`);
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
};
const link = (id, title) => ({ id, title, url: `https://example.test/${id}` });
const native = children => [{ id: '0', title: '', children }];
const pageErrors = new WeakMap();

test.beforeEach(({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page), 'unexpected page errors').toEqual([]);
});

async function start(page, bookmarks, { fresh = false } = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.addInitScript(bookmarks => {
    let chromeValue;
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      get: () => chromeValue,
      set(value) {
        chromeValue = value;
        value.bookmarks = {
          getTree(callback) {
            const result = structuredClone(bookmarks);
            callback?.(result);
            return Promise.resolve(result);
          }
        };
      }
    });
  }, bookmarks);
  await page.goto(`/tests/browser-harness.html${fresh ? '?fresh=1' : ''}`);
  await expectAppReady(page);
}

async function openNativeSettings(page) {
  await page.keyboard.press('KeyS');
  await page.locator('[data-tab="settings-modal-tab-bookmark"]').click();
  await page.locator('#import-chrome-bookmarks').click();
  await expect(dialog(page)).toBeVisible();
}

async function openSelection(page) {
  await page.locator('#browser-bookmark-import-preview').click();
  await expect(page.locator('#browser-bookmark-import-selection')).toBeVisible();
}

async function readImportedData(page) {
  const data = await page.evaluate(async () => {
    const { data } = (await import('/src/state/appStore.js')).getState();
    const imported = item => item.id.startsWith('browser-import-');
    return {
      bookmarks: data.bookmarks.filter(imported),
      folders: data.folders.filter(imported),
      activeWorkspaceId: data.settings.activeBookmarkGroupId,
      workspaceIds: data.settings.bookmarkGroups.map(workspace => workspace.id)
    };
  });
  expect([...data.bookmarks, ...data.folders].every(item => item.groupId === null)).toBe(true);
  expect(data.activeWorkspaceId).toBeNull();
  expect(data.workspaceIds).toEqual([]);
  return data;
}

async function importSelected(page, message) {
  await page.locator('#browser-bookmark-import-confirm').click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await page.locator('#alert-modal-accept').click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('.flash-success', { hasText: message })).toBeVisible();
}

test('chooses one detected native bookmark after the guide and puts it directly on the desktop', async ({ page }, testInfo) => {
  await start(page, native([
    { id: '1', title: 'Bookmarks bar', children: [] },
    { id: '2', title: 'Other bookmarks', children: [link('first', 'First page'), link('second', 'Second page')] }
  ]), { fresh: true });
  await page.locator('#onboarding-skip').click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('h2')).toContainText('New DeskTab');
  await openSelection(page);
  await expect(treeView(page).locator('.browser-import-node', { hasText: 'Bookmarks bar' })
    .locator('.browser-import-empty-badge')).toHaveText('Empty');
  const emptyFolder = treeView(page).locator('.browser-import-node', { hasText: 'Bookmarks bar' });
  await expect(emptyFolder.locator('.folder-visual')).toBeVisible();
  await expect(emptyFolder.locator('.browser-import-folder-chevron')).toHaveCount(0);
  await expect(emptyFolder.locator('button')).toHaveCount(0);
  const populatedFolder = treeView(page).locator('button[data-toggle-id="1"]');
  await expect(populatedFolder.locator('.folder-visual')).toBeVisible();
  await expect(populatedFolder.locator('.browser-import-folder-chevron')).toBeVisible();
  await expect(checkbox(page, '0')).not.toBeChecked();
  await page.locator('#browser-bookmark-import-select-none').click();
  await expect(page.locator('#browser-bookmark-import-confirm')).toBeDisabled();
  await expand(page, '1');
  await checkbox(page, '1/1').check();
  await expect(checkbox(page, '1/0')).not.toBeChecked();
  await expect.poll(() => checkbox(page, '1').evaluate(input => input.indeterminate)).toBe(true);
  await page.evaluate(async () => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language: 'es' }));
  await expect(treeView(page).locator('.browser-import-empty-badge')).toHaveText('Vacía');
  await page.screenshot({ path: testInfo.outputPath('select-native-bookmarks.png') });
  await page.evaluate(async () => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language: 'en' }));
  await importSelected(page, '1 bookmarks');
  const imported = await readImportedData(page);
  expect(imported.bookmarks.map(bookmark => bookmark.name)).toEqual(['Second page']);
  expect(imported.bookmarks[0].folderId).toBeNull();
  expect(imported.folders).toEqual([]);
});

test('selects a whole folder and exposes mixed parent checkboxes while preserving its children', async ({ page }) => {
  await start(page, native([{ id: '1', title: 'Bookmarks bar', children: [
    { id: 'work', title: 'Work', children: [link('alpha', 'Alpha'), link('beta', 'Beta')] },
    link('outside', 'Outside')
  ] }, { id: '2', title: 'Other bookmarks', children: [] }]));
  await openNativeSettings(page);
  await openSelection(page);
  await expect(treeView(page).locator('.browser-import-node', { hasText: 'Other bookmarks' })
    .locator('.browser-import-empty-badge')).toHaveText('Empty');
  await expect(checkbox(page, '1')).not.toBeChecked();
  await expand(page, '0');
  await expand(page, '0/0');
  await page.locator('#browser-bookmark-import-select-none').click();
  await checkbox(page, '0/0/0').check();
  await expect.poll(() => checkbox(page, '0/0').evaluate(input => input.indeterminate)).toBe(true);
  await expect.poll(() => checkbox(page, '0').evaluate(input => input.indeterminate)).toBe(true);
  await checkbox(page, '0/0').check();
  await expect(checkbox(page, '0/0/0')).toBeChecked();
  await expect(checkbox(page, '0/0/1')).toBeChecked();
  await expect(checkbox(page, '0/1')).not.toBeChecked();
  await page.locator('#browser-bookmark-import-preview').click();
  await expect(page.locator('#browser-bookmark-import-selection')).toBeHidden();
  await importSelected(page, '2 bookmarks');
  const imported = await readImportedData(page);
  expect(imported.bookmarks.map(bookmark => bookmark.name).sort()).toEqual(['Alpha', 'Beta']);
  const work = imported.folders.find(folder => folder.name === 'Work');
  expect(work).toBeTruthy();
  expect(imported.bookmarks.every(bookmark => bookmark.folderId === work.id)).toBe(true);
  expect(imported.folders.some(folder => folder.name === 'Bookmarks bar')).toBe(false);
});

test('selects one HTML bookmark with its ancestors and an explicitly chosen empty folder', async ({ page }) => {
  await start(page, native([]));
  await page.keyboard.press('KeyS');
  await page.locator('[data-tab="settings-modal-tab-bookmark"]').click();
  await page.locator('#import-html-bookmarks-input').setInputFiles({
    name: 'bookmarks.html', mimeType: 'text/html',
    buffer: Buffer.from('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><H3>Work</H3><DL>'
      + '<DT><A HREF="https://example.test/skip">Skip</A><DT><H3>Research</H3><DL>'
      + '<DT><A HREF="https://example.test/deep">Deep page</A></DL></DL>'
      + '<DT><H3>Empty collection</H3><DL></DL></DL>')
  });
  await expect(dialog(page)).toBeVisible();
  await openSelection(page);
  await expect(checkbox(page, '1')).not.toBeChecked();
  await page.locator('#browser-bookmark-import-select-none').click();
  await expand(page, '0');
  await expand(page, '0/1');
  await checkbox(page, '0/1/0').check();
  await checkbox(page, '1').check();
  await importSelected(page, '1 bookmarks');
  const imported = await readImportedData(page);
  expect(imported.bookmarks.map(bookmark => bookmark.name)).toEqual(['Deep page']);
  const work = imported.folders.find(folder => folder.name === 'Work');
  const research = imported.folders.find(folder => folder.name === 'Research');
  expect(work).toBeTruthy();
  expect(research.parentId).toBe(work.id);
  expect(imported.bookmarks[0].folderId).toBe(research.id);
  const empty = imported.folders.find(folder => folder.name === 'Empty collection');
  expect(empty).toBeTruthy();
  expect(empty.parentId).toBeNull();
});

test('bounds large selection lists, loads more and searches collapsed descendants', async ({ page }) => {
  await start(page, native([{ id: '1', title: 'Bookmarks bar', children:
    Array.from({ length: 250 }, (_, index) => link(String(index), `Page ${index}`))
  }]));
  await openNativeSettings(page);
  await openSelection(page);
  await expand(page, '0');
  await expect(treeView(page).locator('input')).toHaveCount(100);
  await page.locator('#browser-bookmark-import-show-more').click();
  await expect(treeView(page).locator('input')).toHaveCount(200);
  await page.locator('#browser-bookmark-import-select-none').click();
  await expect(treeView(page).locator('input:checked')).toHaveCount(0);
  await page.locator('#browser-bookmark-import-select-all').click();
  await expect(treeView(page).locator('input:checked')).toHaveCount(200);
  await treeView(page).locator('button[data-toggle-id="0"]').click();
  await expect(treeView(page).locator('input')).toHaveCount(1);
  await page.locator('#browser-bookmark-import-select-none').click();
  await page.locator('#browser-bookmark-import-search').fill('/249');
  await expect(treeView(page).locator('input')).toHaveCount(1);
  await expect(page.locator('#browser-bookmark-import-show-more')).toBeHidden();
  await checkbox(page, '0/249').check();
  await importSelected(page, '1 bookmarks');
  const imported = await readImportedData(page);
  expect(imported.bookmarks.map(bookmark => bookmark.name)).toEqual(['Page 249']);
  expect(imported.bookmarks[0].folderId).toBeNull();
});

test('keeps toolbar links on Main and other bookmarks in their browser folder', async ({ page }) => {
  await start(page, native([
    { id: '1', title: 'Bookmarks bar', children: [link('toolbar', 'Toolbar page')] },
    { id: '2', title: 'Other bookmarks', children: [link('other', 'Other page')] }
  ]));
  await openNativeSettings(page);
  await openSelection(page);
  await expect(checkbox(page, '0')).toBeChecked();
  await expect(checkbox(page, '1')).toBeChecked();
  await importSelected(page, '2 bookmarks');
  const imported = await readImportedData(page);
  expect(imported.bookmarks.find(bookmark => bookmark.name === 'Toolbar page').folderId).toBeNull();
  expect(imported.folders).toHaveLength(1);
  expect(imported.folders[0].name).toBe('Other bookmarks');
  expect(imported.folders[0].parentId).toBeNull();
  expect(imported.bookmarks.find(bookmark => bookmark.name === 'Other page').folderId).toBe(imported.folders[0].id);
});

test('omits empty custom folders by default even when the selection panel stays closed', async ({ page }) => {
  await start(page, native([]));
  await page.keyboard.press('KeyS');
  await page.locator('[data-tab="settings-modal-tab-bookmark"]').click();
  await page.locator('#import-html-bookmarks-input').setInputFiles({
    name: 'with-empty-folder.html', mimeType: 'text/html',
    buffer: Buffer.from('<DL><DT><H3>Empty hidden</H3><DL></DL>'
      + '<DT><A HREF="https://example.test/safe">Safe page</A></DL>')
  });
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator('#browser-bookmark-import-selection')).toBeHidden();
  await importSelected(page, '1 bookmarks');
  const imported = await readImportedData(page);
  expect(imported.bookmarks.map(bookmark => bookmark.name)).toEqual(['Safe page']);
  expect(imported.folders).toEqual([]);
});

test('cancelling the standard import confirmation keeps the selection and existing data', async ({ page }) => {
  await start(page, native([{ id: '1', title: 'Bookmarks bar', children: [
    link('first', 'First page'), link('second', 'Second page')
  ] }]));
  await openNativeSettings(page);
  await openSelection(page);
  await expand(page, '0');
  await page.locator('#browser-bookmark-import-select-none').click();
  await checkbox(page, '0/1').check();
  const before = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
  await page.locator('#browser-bookmark-import-confirm').click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await page.locator('#alert-modal-cancel').click();
  await expect(page.locator('#alert-modal')).toBeHidden();
  await expect(dialog(page)).toBeVisible();
  await expect(checkbox(page, '0/1')).toBeChecked();
  await expect(checkbox(page, '0/0')).not.toBeChecked();
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data)).toEqual(before);
  await expect(page.locator('.flash-success', { hasText: 'bookmarks' })).toHaveCount(0);
  await importSelected(page, '1 bookmarks');
  const imported = await readImportedData(page);
  expect(imported.bookmarks.map(bookmark => bookmark.name)).toEqual(['Second page']);
});
