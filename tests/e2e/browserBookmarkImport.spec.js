import { expect, test } from './helpers/test.js';
import { expectAppReady } from './helpers/appReady.js';

const importDialog = page => page.locator('#browser-bookmark-import-modal');
const tree = [{ id: '0', title: '', children: [{
  id: '1', title: 'Bookmarks bar', children: [
    { id: '2', title: 'First page', url: 'https://first.example/' },
    { id: '3', title: 'Research', children: [
      { id: '4', title: 'Deep page', url: 'https://deep.example/' }
    ] },
    { id: '5', title: 'Last page', url: 'https://last.example/' }
  ]
}] }];

async function start(page, { fresh = false, bookmarks = tree, query = '' } = {}) {
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
  const params = new URLSearchParams(query);
  if (fresh) params.set('fresh', '1');
  await page.goto(`/tests/browser-harness.html?${params}`);
  await expectAppReady(page);
}

async function openBookmarkSettings(page) {
  await page.keyboard.press('KeyS');
  await page.locator('[data-tab="settings-modal-tab-bookmark"]').click();
}

async function confirmImport(page, message) {
  await page.locator('#browser-bookmark-import-confirm').click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await page.locator('#alert-modal-accept').click();
  await expect(importDialog(page)).toBeHidden();
  await expect(page.locator('.flash-success', { hasText: message })).toBeVisible();
}

test('offers native bookmarks only after the first guide and remembers a dismissal', async ({ page }) => {
  await start(page, { fresh: true });
  await expect(page.locator('#onboarding-modal')).toBeVisible();
  await expect(importDialog(page)).toBeHidden();
  await page.locator('#onboarding-skip').click();
  await expect(importDialog(page)).toBeVisible();
  await expect(page.locator('#browser-bookmark-import-description')).toContainText('3 bookmarks and 1 folders');
  await expect(page.locator('#browser-bookmark-import-confirm')).toBeFocused();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(importDialog(page)).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await expect(importDialog(page)).toBeHidden();
  await openBookmarkSettings(page);
  await page.locator('[data-tab="settings-modal-tab-help"]').click();
  await page.locator('#settings-open-guide').click();
  await page.locator('#onboarding-skip').click();
  await expect(importDialog(page)).toBeHidden();
});

test('opens the native toolbar by default and preserves a manual collapse when reopening the list', async ({ page }) => {
  await start(page);
  await openBookmarkSettings(page);
  await page.locator('#import-chrome-bookmarks').click();
  await page.locator('#browser-bookmark-import-preview').click();
  const toolbar = page.locator('#browser-bookmark-import-tree button[data-toggle-id="0"]');
  const research = page.locator('#browser-bookmark-import-tree button[data-toggle-id="0/1"]');
  await expect(toolbar).toHaveAttribute('aria-expanded', 'true');
  await expect(research).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#browser-bookmark-import-tree input[data-node-id="0/0"]')).toBeVisible();
  await expect(page.locator('#browser-bookmark-import-selected-count')).toContainText('3 bookmarks and 1 folders');
  await toolbar.click();
  await expect(toolbar).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#browser-bookmark-import-preview').click();
  await page.locator('#browser-bookmark-import-preview').click();
  await expect(toolbar).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#browser-bookmark-import-tree input[data-node-id="0/0"]')).toHaveCount(0);
});

test('opens an HTML toolbar by default and keeps progress in the import button while work is pending', async ({ page }) => {
  await start(page);
  await openBookmarkSettings(page);
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      File.prototype.text = original;
      return new Promise(resolve => {
        window.__finishBookmarkRead = () => resolve(original.call(this));
      });
    };
  });
  await page.locator('#import-html-bookmarks-input').setInputFiles({
    name: 'toolbar.html', mimeType: 'text/html',
    buffer: Buffer.from('<DL><DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Barra exportada</H3><DL>'
      + '<DT><A HREF="https://progress.example/">Progress page</A>'
      + '<DT><H3>Research</H3><DL><DT><A HREF="https://nested.example/">Nested page</A></DL></DL></DL>')
  });
  await page.locator('#browser-bookmark-import-preview').click();
  const status = page.locator('#browser-bookmark-import-status');
  const confirm = page.locator('#browser-bookmark-import-confirm');
  await expect(importDialog(page)).toHaveAttribute('aria-busy', 'true');
  await expect(status).toBeHidden();
  await expect(status).toHaveText('');
  await expect(confirm).toHaveText('Import bookmarks');
  await expect(confirm).toBeDisabled();
  await page.evaluate(() => window.__finishBookmarkRead());
  await expect(importDialog(page)).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#browser-bookmark-import-tree button[data-toggle-id="0"]'))
    .toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#browser-bookmark-import-tree button[data-toggle-id="0/1"]'))
    .toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#browser-bookmark-import-tree input[data-node-id="0/0"]')).toBeVisible();
  await page.evaluate(() => {
    const original = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      if (items.bookmarks?.some(bookmark => bookmark.url === 'https://progress.example/')) {
        chrome.storage.local.set = original;
        window.__finishBookmarkWrite = () => original(items, callback);
      } else original(items, callback);
    };
  });
  await confirm.click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await page.locator('#alert-modal-accept').click();
  await expect(importDialog(page)).toHaveAttribute('aria-busy', 'true');
  await expect(confirm).toHaveText('Importing bookmarks…');
  await expect(confirm).toBeDisabled();
  await expect(status).toBeHidden();
  await expect(status).toHaveText('');
  await expect.poll(() => page.evaluate(() => typeof window.__finishBookmarkWrite)).toBe('function');
  await page.evaluate(() => window.__finishBookmarkWrite());
  await expect(importDialog(page)).toBeHidden();
  await expect(page.locator('.flash-success', { hasText: '2 bookmarks and 1 folders imported.' })).toBeVisible();
});

test('does not offer an empty native collection', async ({ page }) => {
  await start(page, { fresh: true, bookmarks: [{ id: '0', title: '', children: [] }] });
  await page.locator('#onboarding-skip').click();
  await expect(page.locator('#onboarding-modal')).toBeHidden();
  await expect(importDialog(page)).toBeHidden();
  await openBookmarkSettings(page);
  await page.locator('#import-chrome-bookmarks').click();
  await expect(page.locator('#browser-bookmark-import-settings-status')).toHaveText('No bookmarks were found to import.');
});

test('follows release notes and the guide while daily tips wait for the import choice', async ({ page }) => {
  await start(page, { fresh: true, query: 'release=1&tips=1' });
  await expect(page.locator('#release-notes-modal')).toBeVisible();
  await expect(importDialog(page)).toBeHidden();
  await page.locator('#release-notes-continue').click();
  await expect(page.locator('#onboarding-modal')).toBeVisible();
  await expect(importDialog(page)).toBeHidden();
  await page.locator('#onboarding-skip').click();
  await expect(importDialog(page)).toBeVisible();
  await page.waitForTimeout(1600);
  await expect(page.locator('#daily-tip')).toBeHidden();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.locator('#daily-tip')).toBeVisible();
});

test('imports natively after the guide and preserves the nested folder tree', async ({ page }) => {
  await start(page, { fresh: true });
  await page.locator('#onboarding-skip').click();
  await expect(importDialog(page)).toBeVisible();
  await confirmImport(page, '3 bookmarks and 1 folders imported.');
  const imported = await page.evaluate(async () => {
    const { data } = (await import('/src/state/appStore.js')).getState();
    return { bookmarks: data.bookmarks, folders: data.folders };
  });
  const nested = imported.folders.find(folder => folder.name === 'Research');
  expect(imported.folders.some(folder => folder.name === 'Bookmarks bar')).toBe(false);
  expect(nested.parentId).toBeNull();
  expect(imported.bookmarks.find(bookmark => bookmark.name === 'First page').folderId).toBeNull();
  expect(imported.bookmarks.find(bookmark => bookmark.name === 'Deep page').folderId).toBe(nested.id);
  await expect(importDialog(page)).toBeHidden();
  await expect(page.locator('#onboarding-modal')).toBeHidden();
});

test('HTML import keeps existing bookmarks and handles invalid files without dismissing the dialog', async ({ page }) => {
  await start(page);
  await expect(importDialog(page)).toBeHidden();
  await openBookmarkSettings(page);
  await page.locator('#import-html-bookmarks-input').setInputFiles({
    name: 'chrome-bookmarks.html', mimeType: 'text/html',
    buffer: Buffer.from('<!DOCTYPE NETSCAPE-Bookmark-file-1><TITLE>Bookmarks</TITLE><H1>Bookmarks</H1><DL><p><DT><H3>Work</H3><DL><p><DT><A HREF="https://work.example/">Work page</A></DL><p></DL><p>')
  });
  await expect(importDialog(page)).toBeVisible();
  await expect(page.locator('#browser-bookmark-import-description')).toContainText('chrome-bookmarks.html');
  await confirmImport(page, '1 bookmarks and 1 folders imported.');
  expect(await page.evaluate(async () =>
    (await import('/src/state/appStore.js')).getState().data.bookmarks.length
  )).toBe(3);
  await page.locator('#import-html-bookmarks-input').setInputFiles({
    name: 'invalid.html', mimeType: 'text/html', buffer: Buffer.from('<p>No bookmarks</p>')
  });
  await page.locator('#browser-bookmark-import-confirm').click();
  await expect(page.locator('#browser-bookmark-import-status')).toContainText('Could not import your bookmarks.');
  await expect(page.locator('#alert-modal')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('#browser-bookmark-import-status')).toContainText('Could not import your bookmarks.');
  await page.keyboard.press('Escape');
  await expect(importDialog(page)).toBeHidden();
  await expect(page.locator('#settings-modal')).toBeVisible();
});

test('native import from settings preserves a pending settings draft', async ({ page }) => {
  await start(page);
  await page.keyboard.press('KeyS');
  await page.locator('input[name="interface-theme"][value="dark"]').check();
  await page.locator('[data-tab="settings-modal-tab-bookmark"]').click();
  await page.locator('#import-chrome-bookmarks').click();
  await expect(importDialog(page)).toBeVisible();
  await confirmImport(page, '3 bookmarks');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await page.locator('[data-tab="settings-modal-tab-general"]').click();
  await expect(page.locator('input[name="interface-theme"][value="dark"]')).toBeChecked();
  await expect(page.locator('#settings-modal-save')).toBeEnabled();
  await page.locator('#settings-modal-save').click();
  const data = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
  expect(data.settings.interfaceTheme).toBe('dark');
  expect(data.bookmarks).toHaveLength(5);
  expect(data.settings.bookmarkGroups.some(workspace => workspace.id.startsWith('browser-import-'))).toBe(false);
  expect(data.settings.activeBookmarkGroupId).toBeNull();
  expect(data.bookmarks.every(bookmark => bookmark.groupId === null)).toBe(true);
});

test('browses a large imported folder with bounded pages, search and breadcrumbs', async ({ page }, testInfo) => {
  const library = [{ id: '0', title: '', children: [{ id: '1', title: 'Library', children: [
    ...Array.from({ length: 1200 }, (_, index) => ({
      id: `bookmark-${index}`, title: `Saved page ${index}`, url: `https://example.test/library/${index}`
    })),
    { id: 'archive', title: 'Archive', children: [{ id: 'archived', title: 'Archived page', url: 'https://archive.example/' }] }
  ]
  }] }];
  await start(page, { bookmarks: library });
  await openBookmarkSettings(page);
  await page.locator('#import-chrome-bookmarks').click();
  await confirmImport(page, '1201 bookmarks');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.locator('#bookmark-container .folder-open').click();
  await expect(page.locator('#folder-modal-title')).toHaveText('Imported bookmarks');
  const rows = page.locator('#folder-modal-items [data-bookmark-id]');
  await expect(rows).toHaveCount(54);
  await expect(page.locator('.folder-pagination')).toContainText('Page 1 of 23');
  const shell = page.locator('#folder-modal .folder-grid-shell');
  await shell.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.locator('#folder-modal-next-page').click();
  await expect(page.locator('.folder-pagination')).toContainText('Page 2 of 23');
  await expect.poll(() => shell.evaluate(element => element.scrollTop)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('large-folder.png') });
  await page.locator('#folder-modal-search').fill('/1199');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Saved page 1199');
  await page.locator('#folder-modal-edit-toggle').click();
  await expect(rows.first().locator('.folder-bookmark-actions')).toBeVisible();
  await page.locator('#folder-modal-search').fill('Archive');
  await page.locator('#folder-modal-items .folder-open').click();
  await expect(page.locator('#folder-modal-title')).toHaveText('Archive');
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await expect(page.locator('#folder-modal-title')).toHaveText('Imported bookmarks');
  await expect(rows).toHaveCount(54);
  const firstId = await rows.first().getAttribute('data-bookmark-id');
  await rows.first().locator('.folder-row-select').check();
  await page.locator('#folder-move-down').click();
  await expect.poll(() => rows.nth(1).getAttribute('data-bookmark-id')).toBe(firstId);
  await expect(page.locator('#folder-move-up')).toBeEnabled();
  const selectedRow = page.locator(`#folder-modal-items [data-bookmark-id="${firstId}"]`);
  await expect(selectedRow.locator('.folder-row-select')).toBeChecked();
  const bounds = await selectedRow.evaluate(row => {
    const item = row.getBoundingClientRect();
    const actions = row.querySelector('.folder-bookmark-actions').getBoundingClientRect();
    return { rightGap: item.right - actions.right, centerY: Math.abs((item.top + item.bottom - actions.top - actions.bottom) / 2) };
  });
  expect(bounds.rightGap).toBeLessThan(15);
  expect(bounds.centerY).toBeLessThan(1);
  await page.screenshot({ path: testInfo.outputPath('folder-edit-actions.png') });
  await page.locator('#folder-move-up').click();
  await expect.poll(() => rows.first().getAttribute('data-bookmark-id')).toBe(firstId);
});

test('a failed import write keeps the dialog open, restores data and can be retried after confirmation', async ({ page }) => {
  await start(page, { bookmarks: [{ id: '0', title: '', children: [
    { id: '1', title: 'Bookmarks bar', children: [
      { id: 'failed', title: 'Retry page', url: 'https://retry.example/' }
    ] }
  ] }] });
  await openBookmarkSettings(page);
  await page.locator('#import-chrome-bookmarks').click();
  await expect(importDialog(page)).toBeVisible();
  const before = await page.evaluate(async () => {
    const original = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      if (items.bookmarks?.some(bookmark => bookmark.url === 'https://retry.example/')) {
        chrome.storage.local.set = original;
        chrome.runtime.lastError = { message: 'Simulated import write failure' };
        callback?.();
        chrome.runtime.lastError = null;
        return;
      }
      original(items, callback);
    };
    return (await import('/src/state/appStore.js')).getState().data;
  });
  await page.locator('#browser-bookmark-import-confirm').click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await page.locator('#alert-modal-accept').click();
  await expect(importDialog(page)).toBeVisible();
  await expect(page.locator('#browser-bookmark-import-status')).toContainText('Could not import your bookmarks.');
  await expect(page.locator('#browser-bookmark-import-confirm')).toBeEnabled();
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data)).toEqual(before);
  await expect(page.locator('.flash-success', { hasText: 'bookmarks' })).toHaveCount(0);
  await confirmImport(page, '1 bookmarks');
  expect(await page.evaluate(() => new Promise(resolve => chrome.storage.local.get('bookmarks', stored => {
    resolve(stored.bookmarks.some(bookmark => bookmark.url === 'https://retry.example/'));
  })))).toBe(true);
});
