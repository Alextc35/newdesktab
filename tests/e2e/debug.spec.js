import { test, expect } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

async function expectReady(page) {
  await expectAppReady(page);
  expect(await page.evaluate(() => typeof window.NewDeskTabDebug?.report)).toBe('function');
}

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectReady(page);
  expect(await page.evaluate(() => window.NewDeskTabDebug.enabled)).toBe(false);
});

test('reports startup, actual quotas and persisted create/edit/delete timings', async ({ page }) => {
  expect(await page.evaluate(() => window.NewDeskTabDebug.toggle())).toBe(true);
  const initial = await page.evaluate(() => window.NewDeskTabDebug.report());
  expect(initial.summary.version).toBe('0.1.3'); // Browser harness manifest.
  expect(initial.summary.syncEnabled).toBe(false);
  expect(initial.summary.bookmarks).toBe(2);
  expect(initial.storage.map(area => area.mode)).toEqual(['local', 'sync']);
  expect(initial.storage[0].usedBytes).toBeGreaterThan(0);
  expect(initial.startup['JS start → UI ready (ms)']).toBeGreaterThan(0);
  expect(initial.startup['Navigation → UI ready (ms)'])
    .toBeGreaterThanOrEqual(initial.startup['JS start → UI ready (ms)']);

  await page.mouse.move(5, page.viewportSize().height / 2);
  await page.locator('#add-toggle').click();
  await page.locator('#add-bookmark').click();
  await page.locator('#bookmark-modal-form-name').fill('Debug example');
  await page.locator('#bookmark-modal-form-url').fill('https://debug.internal');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const bookmark = page.locator('#bookmark-container .bookmark').filter({ hasText: 'Debug example' });
  await expect(bookmark).toBeVisible();
  const created = await page.evaluate(() => window.NewDeskTabDebug.history().find(record => record.label === 'Create bookmark'));
  expect(created.status).toBe('ok');
  expect(created.details.persisted).toBe(true);
  expect(created.phases.map(phase => phase.phase)).toEqual([
    'Data preparation', 'Queue wait', 'Storage write', 'Notify UI'
  ]);

  const id = await bookmark.getAttribute('data-bookmark-id');
  await page.evaluate(async id => {
    const { updateBookmarkById, deleteBookmarksByIds } = await import('/src/features/bookmarks/bookmarkActions.js');
    updateBookmarkById(id, { name: 'Updated debug example' });
    deleteBookmarksByIds([id]);
  }, id);
  await expect(bookmark).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.NewDeskTabDebug.history().filter(record => (
    ['Edit bookmark', 'Delete bookmarks'].includes(record.label) && record.details.persisted
  )).length)).toBe(2);
  const report = await page.evaluate(() => window.NewDeskTabDebug.report());
  expect(report.summary.bookmarks).toBe(2);
  const bytes = await page.evaluate(() => new Promise(resolve => chrome.storage.local.getBytesInUse(null, resolve)));
  expect(report.storage[0].usedBytes).toBe(bytes);

  await page.evaluate(async () => {
    const { changeStorageMode } = await import('/src/state/appStore.js');
    await changeStorageMode('sync');
  });
  const synced = await page.evaluate(() => window.NewDeskTabDebug.report());
  expect(synced.summary.syncEnabled).toBe(true);
  expect(synced.storage.find(area => area.active).mode).toBe('sync');
  expect(synced.storage[1].usedBytes).toBeGreaterThan(0);
});

test('a failed storage write is reported as an error and later writes still succeed', async ({ page }) => {
  await page.evaluate(() => window.NewDeskTabDebug.toggle());
  await page.evaluate(async () => {
    const original = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      if (items.bookmarks) {
        chrome.storage.local.set = original;
        chrome.runtime.lastError = { message: 'Simulated quota error' };
        callback?.();
        chrome.runtime.lastError = null;
      } else original(items, callback);
    };
    const { addBookmark } = await import('/src/features/bookmarks/bookmarkActions.js');
    addBookmark({ name: 'Failure', url: 'https://failure.internal' });
  });
  await expect.poll(() => page.evaluate(() => window.NewDeskTabDebug.history().some(record => (
    record.label === 'Create bookmark' && record.status === 'error' && record.details.persisted === false
  )))).toBe(true);
  await page.evaluate(async () => {
    const { addBookmark } = await import('/src/features/bookmarks/bookmarkActions.js');
    addBookmark({ name: 'Recovery', url: 'https://recovery.internal' });
  });
  await expect.poll(() => page.evaluate(() => window.NewDeskTabDebug.history().some(record => (
    record.label === 'Create bookmark' && record.status === 'ok' && record.details.persisted
  )))).toBe(true);
});

test('shows startup guidance and command help, reports on demand and clears the console', async ({ page }) => {
  const messages = [];
  const groups = [];
  page.on('console', message => {
    if (message.text().includes('[NewDeskTab Debug]') && message.type().startsWith('startGroup')) {
      groups.push(message.type());
    }
    if (message.text().includes('[NewDeskTab Debug]') || message.text().includes('NewDeskTabDebug.')) {
      messages.push(message.text().replaceAll('%c', ''));
    }
  });
  await page.reload();
  await expectReady(page);
  await createBookmark(page, 'Before debug');
  expect(messages).toHaveLength(2);
  expect(messages[0]).toMatch(/^\[NewDeskTab Debug\] \d{2}:\d{2}:\d{2} /);
  expect(messages[0]).toContain('Debug available');
  expect(messages[1]).toContain('NewDeskTabDebug.toggle()');
  expect(messages[1]).toContain('Enable Debug mode');
  expect(await page.evaluate(() => window.NewDeskTabDebug.history())).toEqual([]);

  messages.length = 0;
  expect(await page.evaluate(() => window.NewDeskTabDebug.toggle())).toBe(true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(messages).toHaveLength(6);
  expect(messages[0]).toContain('Debug enabled · Commands');
  for (const command of ['toggle()', 'report()', 'history()', 'clear()', 'enabled']) {
    expect(messages.some(message => message.includes(`NewDeskTabDebug.${command}`))).toBe(true);
  }
  expect(messages.some(message => message.includes('General information · v'))).toBe(false);
  await createBookmark(page, 'During debug');
  const history = await page.evaluate(() => window.NewDeskTabDebug.history());
  expect(history.some(record => record.label === 'Create bookmark' && record.details.persisted)).toBe(true);
  const startup = (await page.evaluate(() => window.NewDeskTabDebug.report())).startup;
  expect(messages.some(message => message.includes('General information · v'))).toBe(true);
  for (const message of messages.filter(message => message.includes('[NewDeskTab Debug]'))) {
    expect(message).toMatch(/^\[NewDeskTab Debug\] \d{2}:\d{2}:\d{2} /);
  }
  const historyTimes = await page.evaluate(() => {
    const originalTable = console.table;
    let times;
    console.table = rows => {
      times = rows.map(row => row.Time);
      originalTable.call(console, rows);
    };
    window.NewDeskTabDebug.history();
    console.table = originalTable;
    return times;
  });
  for (const time of historyTimes) expect(time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  expect(groups.length).toBeGreaterThan(0);
  expect(groups.every(type => type === 'startGroupCollapsed')).toBe(true);
  expect(startup['JS start → UI ready (ms)']).toBeGreaterThan(0);

  expect(await page.evaluate(() => window.NewDeskTabDebug.toggle())).toBe(false);
  messages.length = 0;
  await createBookmark(page, 'After debug');
  expect(messages).toEqual([]);
  expect(await page.evaluate(() => window.NewDeskTabDebug.history())).toEqual(history);
  const inactiveReport = await page.evaluate(() => window.NewDeskTabDebug.report());
  expect(inactiveReport.summary.debugEnabled).toBe(false);
  expect(inactiveReport.startup).toEqual(startup);

  messages.length = 0;
  await page.evaluate(() => window.NewDeskTabDebug.toggle());
  expect(messages).toHaveLength(6);
  expect(messages[0]).toContain('Debug enabled · Commands');
  const cleared = await page.evaluate(() => {
    const originalClear = console.clear;
    let consoleCleared = false;
    console.clear = () => { consoleCleared = true; originalClear.call(console); };
    const result = window.NewDeskTabDebug.clear();
    console.clear = originalClear;
    return { ...result, consoleCleared, history: window.NewDeskTabDebug.history() };
  });
  expect(cleared).toEqual({ cleared: history.length, enabled: true, consoleCleared: true, history: [] });
  await createBookmark(page, 'After clear');
  expect((await page.evaluate(() => window.NewDeskTabDebug.history()))
    .some(record => record.label === 'Create bookmark')).toBe(true);
  await page.reload();
  await expectReady(page);
  expect(await page.evaluate(() => window.NewDeskTabDebug.enabled)).toBe(false);
});

for (const command of ['clear', 'toggle']) {
  test(`${command} cancels a requested report waiting for storage usage`, async ({ page }) => {
    await page.evaluate(() => {
      const original = chrome.storage.local.getBytesInUse;
      chrome.storage.local.getBytesInUse = (keys, callback) => {
        window.releaseDebugUsage = () => {
          chrome.storage.local.getBytesInUse = original;
          original(keys, callback);
        };
      };
      window.NewDeskTabDebug.toggle();
      window.pendingDebugReport = window.NewDeskTabDebug.report();
    });
    await page.waitForFunction(() => typeof window.releaseDebugUsage === 'function');
    await page.evaluate(command => window.NewDeskTabDebug[command](), command);
    const messages = [];
    page.on('console', message => {
      if (message.text().includes('[NewDeskTab Debug]')) messages.push(message.text());
    });
    await page.evaluate(async () => {
      window.releaseDebugUsage();
      await window.pendingDebugReport;
    });
    expect(messages).toEqual([]);
  });
}

async function createBookmark(page, name) {
  await page.evaluate(async name => {
    const { addBookmark } = await import('/src/features/bookmarks/bookmarkActions.js');
    addBookmark({ name, url: 'https://debug.internal' });
  }, name);
  await expect(page.locator('#bookmark-container .bookmark').filter({ hasText: name })).toBeVisible();
}
