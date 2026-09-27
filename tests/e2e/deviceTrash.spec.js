import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

async function syncSnapshot(page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-sync') || '{}'));
}

async function receiveSync(page, snapshot) {
  await page.evaluate(data => new Promise(resolve => chrome.storage.sync.set(data, resolve)), snapshot);
}

async function useSync(page) {
  await page.evaluate(async () => {
    const { changeStorageMode, getState } = await import('/src/js/core/store.js');
    await changeStorageMode('sync', getState().data);
  });
}

async function deleteBookmark(page, bookmarkId) {
  await page.evaluate(async id => {
    const { moveBookmarksToRecycleBin } = await import(
      '/src/js/features/recycle-bin/recycleBinActions.js'
    );
    const { waitForPersistence } = await import('/src/js/core/store.js');
    moveBookmarksToRecycleBin([id]);
    await waitForPersistence();
  }, bookmarkId);
}

async function deviceState(page) {
  return page.evaluate(async () => {
    const { getState } = await import('/src/js/core/store.js');
    const data = getState().data;
    return {
      bookmarks: data.bookmarks.map(bookmark => bookmark.id),
      trash: data.trash.map(entry => entry.type === 'folder'
        ? entry.folder.id
        : entry.bookmark.id)
    };
  });
}

function sharedPayload(snapshot) {
  const meta = snapshot.newdesktabSyncMeta;
  return JSON.parse(Array.from(
    { length: meta.chunkCount },
    (_, index) => snapshot[`newdesktabSyncChunk:${index}`]
  ).join(''));
}

test('each synchronized device keeps an independent recycle bin', async ({ page, browser, baseURL }) => {
  const otherContext = await browser.newContext({ baseURL });
  const other = await otherContext.newPage();

  try {
    await page.goto('/tests/browser-harness.html');
    await expectAppReady(page);
    await expect(page.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();
    await useSync(page);

    const initialState = await deviceState(page);
    const [firstId, secondId] = initialState.bookmarks;
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();

    await other.goto('/tests/browser-harness.html');
    await expectAppReady(other);
    await expect(other.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();
    await receiveSync(other, await syncSnapshot(page));
    await other.evaluate(() => new Promise(resolve => (
      chrome.storage.local.set({ newdesktabStorageMode: 'sync' }, resolve)
    )));
    await other.reload();

    await deleteBookmark(page, firstId);
    const afterFirstDeletion = await syncSnapshot(page);
    expect(Object.hasOwn(sharedPayload(afterFirstDeletion), 'trash')).toBe(false);
    await expect.poll(() => deviceState(page)).toMatchObject({ trash: [firstId] });

    await receiveSync(other, afterFirstDeletion);
    await expect.poll(() => deviceState(other)).toEqual({
      bookmarks: initialState.bookmarks.filter(id => id !== firstId),
      trash: []
    });

    await deleteBookmark(other, secondId);
    const afterSecondDeletion = await syncSnapshot(other);
    expect(Object.hasOwn(sharedPayload(afterSecondDeletion), 'trash')).toBe(false);
    await receiveSync(page, afterSecondDeletion);

    await expect.poll(() => deviceState(page)).toEqual({
      bookmarks: initialState.bookmarks.filter(id => id !== firstId && id !== secondId),
      trash: [firstId]
    });
    await expect.poll(() => deviceState(other)).toMatchObject({ trash: [secondId] });
  } finally {
    await otherContext.close();
  }
});
