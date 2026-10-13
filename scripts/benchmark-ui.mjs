import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createStaticServer } from './lib/staticServer.mjs';
import { expectAppReady, expectAppSaved } from '../tests/e2e/helpers/appReady.js';

const cpuRate = Number(process.env.NEWDESKTAB_BENCHMARK_CPU || 4);
const output = process.argv[2];
const server = createStaticServer(resolve('.'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const count of [60, 1200]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    await page.goto(`http://127.0.0.1:${server.address().port}/tests/browser-harness.html`);
    await expectAppReady(page);
    await page.evaluate(async count => {
      const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
      const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
      const { DEFAULT_RECYCLE_BIN } = await import('/src/domain/recycle-bin/recycleBinDefaults.js');
      const { getState } = await import('/src/state/appStore.js');
      const groups = Array.from({ length: Math.ceil(count / 60) - 1 }, (_, i) => ({ id: `bench-group-${i + 1}`, name: `Workspace ${i + 1}` }));
      const bookmarks = Array.from({ length: count }, (_, i) => ({ ...DEFAULT_BOOKMARK,
        id: `bench-${i}`, name: `Bookmark ${i}`, url: 'https://benchmark.internal',
        groupId: i < 60 ? null : `bench-group-${Math.floor(i / 60)}`,
        gx: i % 12, gy: Math.floor((i % 60) / 12), iconId: 'mail',
        backgroundFavicon: false, noBackground: false, backgroundColor: '#111827' }));
      const folder = { ...DEFAULT_FOLDER_STYLE, id: 'bench-folder', name: 'Benchmark folder',
        groupId: null, gx: 2, gy: 5, w: 1, h: 1, createdAt: 1, updatedAt: 1 };
      const children = Array.from({ length: 18 }, (_, i) => ({ ...bookmarks[i], id: `child-${i}`,
        folderId: folder.id, gx: i % 6, gy: Math.floor(i / 6) }));
      const trash = Array.from({ length: 60 }, (_, i) => ({ id: `trash-${i}`, type: 'bookmark',
        deletedAt: Date.now(), bookmark: { ...bookmarks[i], id: `deleted-${i}` } }));
      await new Promise(resolve => chrome.storage.local.set({ bookmarks: [...bookmarks, ...children],
        folders: [folder], trash, recycleBin: { ...DEFAULT_RECYCLE_BIN, gx: 11, gy: 5 },
        settings: { ...getState().data.settings, recycleBinRetentionDays: 0,
          showRecycleBin: true, bookmarkGroups: groups } }, resolve));
    }, count);
    await page.reload();
    await expectAppReady(page);
    const startup = await page.evaluate(() => window.NewDeskTabDebug.report());
    await page.evaluate(() => window.NewDeskTabDebug.toggle());
    const samples = {};
    async function measure(label, operation) {
      const timings = [];
      for (let i = 0; i < 8; i++) {
        const timing = await page.evaluate(async operation => {
          const { renderGrid, resizeGridView } = await import('/src/features/grid/gridRenderer.js');
          const { openEditBookmark } = await import('/src/features/bookmarks/bookmarkModal.js');
          const { openFolderModal } = await import('/src/features/folders/folderModal.js');
          const { openFolderEditor } = await import('/src/features/folders/folderEditorModal.js');
          const { openRecycleBinModal } = await import('/src/features/recycle-bin/recycleBinModal.js');
          const { openRecycleBinEditor } = await import('/src/features/recycle-bin/recycleBinEditorModal.js');
          const { openSearchModal } = await import('/src/features/search/searchModal.js');
          const { openWidgetCatalog } = await import('/src/widgets/widgetCatalog.js');
          const { openCreateClock } = await import('/src/widgets/builtin/clock/clockSettings.js');
          const start = performance.now();
          if (operation === 'settings') document.getElementById('settings').click();
          if (operation === 'editor') openEditBookmark('bench-0');
          if (operation === 'typing') {
            const input = document.getElementById('bookmark-modal-form-name');
            input.value += 'x';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (operation === 'render') renderGrid(document.getElementById('bookmark-container'));
          if (operation === 'resize') resizeGridView(document.getElementById('bookmark-container'));
          if (operation === 'folder') openFolderModal('bench-folder');
          if (operation === 'folderEditor') openFolderEditor('bench-folder');
          if (operation === 'bin') openRecycleBinModal();
          if (operation === 'binEditor') openRecycleBinEditor();
          if (operation === 'search') openSearchModal();
          if (operation === 'searchFilter') {
            const input = document.getElementById('search-modal-input');
            input.value = 'Bookmark 59';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (operation === 'catalog') openWidgetCatalog();
          if (operation === 'clock') openCreateClock();
          const jsMs = performance.now() - start;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return { jsMs, frameMs: performance.now() - start };
        }, operation);
        if (i >= 2) timings.push(timing);
        if (operation === 'settings') {
          await page.locator('#settings-modal-cancel').click();
          await page.locator('#settings-modal').waitFor({ state: 'hidden' });
        }
        if (operation === 'editor') {
          await page.locator('#edit-bookmark-modal-cancel').click();
          await page.locator('#edit-bookmark-modal').waitFor({ state: 'hidden' });
        }
        if (['folder', 'folderEditor', 'bin', 'binEditor', 'search', 'catalog', 'clock'].includes(operation)) {
          await page.keyboard.press('Escape');
          await page.locator('.modal.is-open').waitFor({ state: 'hidden' });
        }
      }
      const median = key => {
        const values = timings.map(value => value[key]).sort((a, b) => a - b);
        return Number(((values[2] + values[3]) / 2).toFixed(2));
      };
      samples[label] = { jsMs: median('jsMs'), frameMs: median('frameMs') };
    }
    await measure('settingsOpen', 'settings');
    await measure('bookmarkEditorOpen', 'editor');
    await page.evaluate(async () => (await import('/src/features/bookmarks/bookmarkModal.js')).openEditBookmark('bench-0'));
    await measure('editName', 'typing');
    await page.locator('#edit-bookmark-modal-save').click();
    await expectAppSaved(page);
    await page.locator('#edit-bookmark-modal').waitFor({ state: 'hidden' });
    await measure('gridRender', 'render');
    await measure('gridResize', 'resize');
    await measure('folderOpen', 'folder');
    await measure('folderEditorOpen', 'folderEditor');
    await measure('recycleBinOpen', 'bin');
    await measure('recycleBinEditorOpen', 'binEditor');
    await measure('searchOpen', 'search');
    await page.evaluate(async () => (await import('/src/features/search/searchModal.js')).openSearchModal());
    await measure('searchFilter', 'searchFilter');
    await page.keyboard.press('Escape');
    await measure('widgetCatalogOpen', 'catalog');
    await measure('clockCreateOpen', 'clock');
    for (let i = 0; i < 8; i++) {
      await page.evaluate(async i => {
        const { updateGridItemsByIds } = await import('/src/features/grid/gridItemActions.js');
        updateGridItemsByIds(new Map([['bench-0', { gx: 0, gy: i % 2 ? 0 : 5 }]]));
      }, i);
      await expectAppSaved(page);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    const history = await page.evaluate(() => window.NewDeskTabDebug.history());
    assert.deepEqual(errors, [], 'Benchmark journeys must finish without page errors');
    const result = { bookmarks: count, folderBookmarks: 18, trashEntries: 60,
      visibleBookmarks: 60, cpuRate, startup: startup.startup, samples,
      lastGridRender: history.filter(value => value.label === 'Render grid').at(-1) };
    results.push(result);
    console.log(JSON.stringify(result));
    await context.close();
  }
  if (output) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify({ browser: browser.version(), results }, null, 2));
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
