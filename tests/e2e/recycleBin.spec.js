import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('#bookmark-container > .recycle-bin')).toBeVisible();
});

test('shows saved bookmark artwork and folder appearance in trash', async ({ page }) => {
  const cover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
  await page.evaluate(async image => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
    const {
      createBookmarkTrashEntry,
      createFolderTrashEntry
    } = await import('/src/domain/recycle-bin/recycleBinEntries.js');
    const { setState } = await import('/src/state/appStore.js');
    const deletedAt = Date.now();
    await setState({ data: { trash: [
      createBookmarkTrashEntry({
        ...DEFAULT_BOOKMARK,
        id: 'trash-cover',
        name: 'Cover bookmark',
        url: 'https://example.internal',
        backgroundFavicon: false,
        backgroundImageUrl: image,
        noBackground: false,
        backgroundColor: '#123456'
      }, { id: 'trash-cover-entry', deletedAt }),
      createBookmarkTrashEntry({
        ...DEFAULT_BOOKMARK,
        id: 'trash-favicon',
        name: 'Fallback bookmark',
        url: 'https://example.internal',
        backgroundFavicon: false,
        backgroundImageLocal: 'newdesktab-local-image:11111111-1111-4111-8111-111111111111',
        backgroundImageSource: 'local'
      }, { id: 'trash-favicon-entry', deletedAt }),
      createFolderTrashEntry({
        ...DEFAULT_FOLDER_STYLE,
        id: 'trash-folder',
        name: 'Styled folder',
        backgroundColor: '#ff8800',
        backgroundImageUrl: image
      }, [], { id: 'trash-folder-entry', deletedAt })
    ] } });
  }, cover);

  await page.locator('#bookmark-container .recycle-bin-open').click();
  const coverIcon = page.locator('[data-trash-id="trash-cover-entry"] .recycle-bin-item-icon');
  await expect(coverIcon.locator('img.bookmark-list-cover')).toHaveAttribute('src', cover);
  await expect(coverIcon).toHaveCSS('background-color', 'rgb(18, 52, 86)');

  const faviconIcon = page.locator('[data-trash-id="trash-favicon-entry"] .recycle-bin-item-icon');
  await expect(faviconIcon.locator('.bookmark-favicon')).toBeVisible();
  await expect(faviconIcon.locator('.bookmark-favicon-initials')).toBeVisible();

  const folderIcon = page.locator('[data-trash-id="trash-folder-entry"] .recycle-bin-item-icon');
  await expect(folderIcon.locator('.folder-visual')).toBeVisible();
  await expect(folderIcon).toHaveCSS('--folder-color', '#ff8800');
  await expect(folderIcon.locator('.folder-svg image')).toHaveAttribute('href', cover);
});

test('switches the recycle bin modal to its list layout at and below 600px', async ({ page }) => {
  await page.setViewportSize({ width: 601, height: 720 });
  await page.locator('#bookmark-container .recycle-bin-open').click();
  const card = page.locator('#recycle-bin-modal .modal-recycle-bin');
  const footer = page.locator('.recycle-bin-modal-footer');
  await expect(card).toBeVisible();
  await expect(footer).toHaveCSS('flex-direction', 'row');

  await page.setViewportSize({ width: 600, height: 720 });
  await expect(footer).toHaveCSS('flex-direction', 'column');
  await expect(card).toHaveCSS('width', '584px');

  await page.setViewportSize({ width: 601, height: 720 });
  await expect(footer).toHaveCSS('flex-direction', 'row');
});

test('opens the recycle-bin editor from its modal artwork and restores the modal afterwards', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  await page.locator('#bookmark-container .recycle-bin-open').click();

  const customize = page.locator('#recycle-bin-modal-customize');
  await expect(customize).toBeVisible();
  await expect(customize.locator('.recycle-bin-svg')).toBeVisible();
  await expect(customize.locator('.edit-indicator-svg')).toBeVisible();
  await customize.click();

  await expect(page.locator('#edit-recycle-bin-modal')).toBeVisible();
  await expect(page.locator('#recycle-bin-modal')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#recycle-bin-modal')).toHaveAttribute('inert', '');
  await page.locator('#edit-recycle-bin-modal-cancel').click();
  await expect(page.locator('#edit-recycle-bin-modal')).toBeHidden();
  await expect(page.locator('#recycle-bin-modal')).toBeVisible();
  await expect(page.locator('#recycle-bin-modal')).not.toHaveAttribute('inert', '');
});

test('shows the automatic light recycle-bin background in its color picker', async ({ page }) => {
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    await setState({ data: { settings: {
      ...getState().data.settings,
      interfaceTheme: 'light'
    } } });
  });
  await expect(page.locator('html')).toHaveAttribute('data-interface-theme', 'light');

  await page.locator('#bookmark-container .recycle-bin-open').click();
  await page.locator('#recycle-bin-modal-customize').click();
  const editor = page.locator('#edit-recycle-bin-modal');
  await editor.getByRole('tab', { name: 'Style' }).click();

  await expect(page.locator('#recycle-bin-editor-background-color'))
    .toHaveValue('#e2e8f0');
  await expect(page.locator('#edit-recycle-bin-modal-save')).toBeDisabled();
});

async function waitForSaved(page) {
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().ui.persistence.status;
  })).toMatch(/^(idle|saved)$/);
}

async function revealSideDock(page) {
  await page.mouse.move(5, page.viewportSize().height / 2);
  await expect(page.locator('#floating-menu')).toBeVisible();
}

async function toggleEditMode(page) {
  await revealSideDock(page);
  await page.locator('#edit-toggle-mode').click();
}

async function createDropBookmark(page) {
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { getState, setState } = await import('/src/state/appStore.js');
    const data = getState().data;
    const now = Date.now();
    await setState({
      data: {
        bookmarks: [...data.bookmarks, {
          ...DEFAULT_BOOKMARK,
          id: 'drop-bookmark',
          name: 'Drop bookmark',
          url: 'https://drop-bookmark.test',
          gx: 1,
          gy: 0,
          createdAt: now,
          updatedAt: now
        }]
      }
    });
  });
}

async function hoverCenterTo(page, source, target) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 - 7, from.y + from.height / 2 - 7);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
}

async function expectStackedDropPreview(source, target, feedback) {
  await expect(source).toHaveClass(/is-drop-landing/);
  await expect(target).toHaveClass(/is-drop-target/);
  await expect(feedback).toBeVisible();
  await expect.poll(async () => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) return false;
    const center = {
      x: sourceBox.x + sourceBox.width / 2,
      y: sourceBox.y + sourceBox.height / 2
    };
    return center.x > targetBox.x
      && center.x < targetBox.x + targetBox.width
      && center.y > targetBox.y
      && center.y < targetBox.y + targetBox.height
      && sourceBox.width < targetBox.width * .8
      && sourceBox.height < targetBox.height * .8;
  }).toBe(true);
  await expect.poll(() => source.evaluate(element => getComputedStyle(element).transform))
    .not.toBe('none');
}

test('moves, resizes, hides and shows the recycle bin', async ({ page }) => {
  await toggleEditMode(page);
  const bin = page.locator('#bookmark-container > .recycle-bin');
  const grid = await page.locator('#bookmark-container').boundingBox();
  const before = await bin.boundingBox();

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + grid.width / 12 * 3, before.y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await bin.boundingBox()).x).toBeGreaterThan(before.x + grid.width / 6);

  const moved = await bin.boundingBox();
  await bin.locator('.resizer.left').click({ position: { x: 2, y: 10 } });
  await expect.poll(async () => (await bin.boundingBox()).width).toBeGreaterThan(moved.width * 1.7);
  await waitForSaved(page);

  await toggleEditMode(page);
  await revealSideDock(page);
  await page.locator('#settings').click();
  const showBin = page.locator('#settings-show-recycle-bin');
  await showBin.uncheck();
  await page.locator('#settings-modal-save').click();
  await expect(bin).toBeHidden();

  const expectedPosition = await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { findFirstFreeSlot } = await import('/src/shared/grid/gridPlacement.js');
    const { getState, setState } = await import('/src/state/appStore.js');
    const { data } = getState();
    const blocker = {
      ...DEFAULT_BOOKMARK,
      id: 'hidden-bin-blocker',
      name: 'Hidden bin blocker',
      url: 'https://blocker.test',
      gx: data.recycleBin.gx,
      gy: data.recycleBin.gy,
      w: data.recycleBin.w,
      h: data.recycleBin.h
    };
    await setState({ data: { bookmarks: [...data.bookmarks, blocker] } });
    const next = getState().data;
    return findFirstFreeSlot([
      ...next.bookmarks.filter(bookmark => !bookmark.folderId && bookmark.groupId === null),
      ...next.folders.filter(folder => folder.groupId === null)
    ], {
      columns: 12,
      rows: 6,
      w: next.recycleBin.w,
      h: next.recycleBin.h
    });
  });

  await revealSideDock(page);
  await page.locator('#settings').click();
  await showBin.check();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#bookmark-container > .recycle-bin')).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const { recycleBin } = (await import('/src/state/appStore.js')).getState().data;
    return { gx: recycleBin.gx, gy: recycleBin.gy };
  })).toEqual(expectedPosition);
});

test('drops a bookmark into the bin and restores the selected item', async ({ page }) => {
  await createDropBookmark(page);
  await toggleEditMode(page);
  const bookmark = page.locator('.bookmark[data-bookmark-id="drop-bookmark"]');
  const bookmarkId = await bookmark.getAttribute('data-bookmark-id');
  const bin = page.locator('#bookmark-container > .recycle-bin');
  await hoverCenterTo(page, bookmark, bin);
  await expectStackedDropPreview(
    bookmark,
    bin,
    bin.locator('.recycle-bin-drop-feedback', { hasText: 'Drop to delete' })
  );
  await page.mouse.up();
  await expect(page.locator(`.bookmark[data-bookmark-id="${bookmarkId}"]`)).toHaveCount(0);
  await expect(bin.locator('.recycle-bin-caption small')).toHaveText('1 item');
  await waitForSaved(page);

  await toggleEditMode(page);
  await bin.getByRole('button', { name: /Open recycle bin/ }).click();
  const modal = page.locator('#recycle-bin-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.recycle-bin-item')).toHaveCount(1);
  await expect(modal).toContainText('Drop bookmark');
  await modal.locator('.recycle-bin-item input').check();
  await modal.getByRole('button', { name: 'Restore selected' }).click();
  await expect(modal.locator('.recycle-bin-item')).toHaveCount(0);
  await expect(page.locator(`.bookmark[data-bookmark-id="${bookmarkId}"]`)).toBeVisible();
});

test('asks before dropping a folder with contents and supports permanent deletion', async ({ page }) => {
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const data = getState().data;
    const folder = {
      id: 'trash-folder', name: 'Archive', gx: 3, gy: 0, w: 1, h: 1,
      groupId: null, createdAt: Date.now(), updatedAt: Date.now()
    };
    await setState({
      data: {
        folders: [...data.folders, folder],
        bookmarks: data.bookmarks.map((bookmark, index) => index === 0
          ? { ...bookmark, folderId: folder.id, gx: 0, gy: 0 }
          : bookmark)
      }
    });
  });

  await toggleEditMode(page);
  const folder = page.locator('.bookmark-folder[data-folder-id="trash-folder"]');
  const bin = page.locator('#bookmark-container > .recycle-bin');
  await hoverCenterTo(page, folder, bin);
  await expectStackedDropPreview(
    folder,
    bin,
    bin.locator('.recycle-bin-drop-feedback', { hasText: 'Drop to delete' })
  );
  await page.mouse.up();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await expect(page.locator('#alert-modal-title')).toContainText('Archive');
  await expect(folder).toBeHidden();
  await expect(folder).toHaveClass(/is-drop-committed/);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(folder).toHaveCount(0);

  await toggleEditMode(page);
  await bin.getByRole('button', { name: /Open recycle bin/ }).click();
  const modal = page.locator('#recycle-bin-modal');
  await expect(modal.locator('.recycle-bin-item')).toContainText('Archive');
  await modal.locator('.recycle-bin-item input').check();
  await modal.getByRole('button', { name: 'Delete selected' }).click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(modal.locator('.recycle-bin-item')).toHaveCount(0);
});
