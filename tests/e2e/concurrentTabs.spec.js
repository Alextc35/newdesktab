import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium, expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

const extensionPath = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8'));
const extensionId = createHash('sha256').update(Buffer.from(manifest.key, 'base64'))
  .digest('hex').slice(0, 32).replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));

let context;
let pages;

async function seedBookmarks(page) {
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('./js/domain/bookmarks/bookmarkDefaults.js');
    const { setState } = await import('./js/state/appStore.js');
    await setState({
      data: {
        bookmarks: [
          {
            ...DEFAULT_BOOKMARK,
            id: 'test-developed-by',
            name: 'DEVELOPED BY',
            url: 'https://www.alextc.es',
            urlLocked: true,
            noBackground: false,
            backgroundColor: '#161b22',
            gx: 0,
            gy: 1
          },
          {
            ...DEFAULT_BOOKMARK,
            id: 'test-banana',
            name: 'banana',
            backgroundImageUrl: 'https://cdn.osxdaily.com/wp-content/uploads/2013/07/dancing-banana.gif',
            backgroundImageUrlLocked: true,
            backgroundFavicon: false,
            noBackground: false,
            backgroundColor: '#eeff00',
            showText: false,
            showFavicon: false,
            gx: 1,
            gy: 1
          }
        ]
      }
    }, { recordHistory: false });
  });
}

test.beforeEach(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  await context.route(/^https?:/, route => route.abort());
  const firstPage = await context.newPage();
  await firstPage.goto(`chrome-extension://${extensionId}/${manifest.chrome_url_overrides.newtab}`);
  await expectAppReady(firstPage);
  await seedBookmarks(firstPage);

  pages = [firstPage, await context.newPage()];
  await pages[1].goto(`chrome-extension://${extensionId}/${manifest.chrome_url_overrides.newtab}`);
  for (const page of pages) {
    await expect(page.locator('#bookmark-container .bookmark')).toHaveCount(2);
    await page.evaluate(async () => {
      window.commands = await import('./js/features/bookmarks/bookmarkActions.js');
      window.store = await import('./js/state/appStore.js');
      window.folders = await import('./js/features/folders/folderActions.js');
    });
  }
});

test.afterEach(async () => { await context?.close(); });

// Hold the real origin lock until both pages have submitted stale edits. This
// makes the race deterministic without replacing Chrome storage or app code.
async function concurrently(operation) {
  await pages[0].evaluate(() => {
    void navigator.locks.request('newdesktab-persistence', () => new Promise(resolve => {
      window.releaseReviewLock = resolve;
    }));
  });
  await expect.poll(() => pages[0].evaluate(() => typeof window.releaseReviewLock)).toBe('function');
  try {
    await Promise.all(pages.map((page, index) => page.evaluate(operation, index)));
    await expect.poll(() => pages[0].evaluate(async () => (
      (await navigator.locks.query()).pending.filter(lock => lock.name === 'newdesktab-persistence').length
    ))).toBe(2);
  } finally {
    await pages[0].evaluate(() => window.releaseReviewLock());
  }
  for (const page of pages) {
    await expect.poll(() => page.evaluate(() => window.store.getState().ui.persistence.status)).toBe('saved');
  }
}

test('two real extension tabs preserve simultaneous bookmark and folder creations after reload', async () => {
  await concurrently(index => {
    window.commands.addBookmark({ name: `Concurrent ${index}`, url: `https://example.internal/${index}`, gx: 5, gy: 0 });
  });
  for (const page of pages) {
    await expect.poll(() => page.evaluate(() => window.store.getState().data.bookmarks.length)).toBe(4);
    const positions = await page.evaluate(() => window.store.getState().data.bookmarks
      .filter(bookmark => bookmark.name.startsWith('Concurrent')).map(bookmark => `${bookmark.gx},${bookmark.gy}`));
    expect(new Set(positions).size).toBe(2);
  }
  await concurrently(index => {
    window.folders.createBookmarkFolder(`Folder ${index}`, { columns: 12, rows: 6 });
  });
  for (const page of pages) {
    await page.reload();
    await expect(page.locator('#bookmark-container [data-bookmark-id]')).toHaveCount(4);
    await expect(page.locator('#bookmark-container [data-folder-id]')).toHaveCount(2);
    const positions = await page.locator('#bookmark-container [data-folder-id]').evaluateAll(elements =>
      elements.map(element => `${element.style.getPropertyValue('--x')},${element.style.getPropertyValue('--y')}`));
    expect(new Set(positions).size).toBe(2);
  }
});

test('independent edits to the same bookmark merge without losing either field', async () => {
  await concurrently(index => {
    const id = window.store.getState().data.bookmarks[0].id;
    window.commands.updateBookmarkById(id, index === 0
      ? { name: 'Renamed in first tab' }
      : { url: 'https://changed.internal' });
  });
  for (const page of pages) {
    await expect.poll(() => page.evaluate(() => {
      const bookmark = window.store.getState().data.bookmarks[0];
      return { name: bookmark.name, url: bookmark.url };
    })).toEqual({ name: 'Renamed in first tab', url: 'https://changed.internal' });
  }
});

test('a stale edit cannot resurrect a bookmark deleted by another tab', async () => {
  await concurrently(index => {
    const id = window.store.getState().data.bookmarks[0].id;
    if (index === 0) window.commands.deleteBookmarksByIds([id]);
    else window.commands.updateBookmarkById(id, { name: 'Stale edit' });
  });
  for (const page of pages) {
    await expect.poll(() => page.evaluate(() => window.store.getState().data.bookmarks.map(b => b.name))).toEqual(['banana']);
    await page.reload();
    await expect(page.locator('#bookmark-container [data-bookmark-id]')).toHaveCount(1);
  }
});
