import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  // Grid keyboard navigation is installed after the asynchronous application
  // bootstrap, including on installations without starter bookmarks.
  await expectAppReady(page);
});

async function waitForSaved(page) {
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().ui.persistence.status;
  })).toMatch(/^(idle|saved)$/);
}

async function reloadSavedPage(page) {
  await waitForSaved(page);
  await page.reload();
  await expectAppReady(page);
}

async function visibleBox(locator) {
  let box;
  await expect.poll(async () => {
    box = await locator.boundingBox();
    return box !== null;
  }).toBe(true);
  return box;
}

async function revealSideDock(page) {
  const menu = page.locator('#floating-menu');
  await page.mouse.move(5, page.viewportSize().height / 2);
  await expect.poll(async () => (await visibleBox(menu)).x).toBeGreaterThanOrEqual(0);
}

async function chooseWorkspace(page, workspaceId) {
  const toolbar = page.getByRole('navigation', { name: 'Workspace controls' });
  await toolbar.hover();
  await page.locator('#workspace-toggle').click();
  await page.locator(`#workspace-options [data-workspace-id="${workspaceId}"]`).click();
}

async function openClockCreator(page) {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-widgets').click();
  await page.locator('#widget-catalog-modal [data-widget-type="clock"]').click();
  await expect(page.locator('#clock-widget-modal')).toBeVisible();
}

async function enableEditMode(page) {
  await revealSideDock(page);
  await page.locator('#edit-toggle-mode').click();
}

async function enableFolderEditMode(page) {
  const toggle = page.locator('#folder-modal-edit-toggle');
  if (await toggle.getAttribute('aria-pressed') === 'false') {
    await toggle.click();
  }
}

async function setBookmarkDragMode(page, mode) {
  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  const input = page.locator(`input[name="bookmark-drag-mode"][value="${mode}"]`);
  if (await input.isChecked()) {
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-modal')).toBeHidden();
    return;
  }
  if (!(await page.locator('input[name="bookmark-drag-mode"]').first().isVisible())) {
    await page.locator('#bookmark-drag-settings-title').click();
  }
  await input.check();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
}

async function createBookmark(page, name, url) {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-bookmark').click();
  await expect(page.locator('#bookmark-modal-form-name')).toBeFocused();
  await page.locator('#bookmark-modal-form-name').fill(name);
  await page.locator('#bookmark-modal-form-url').fill(url);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.bookmark[data-bookmark-id]').last()).toContainText(name);
}

async function moveGridItemByCells(page, bookmark, deltaX, deltaY) {
  await expect(bookmark).toBeVisible();
  const gridBox = await visibleBox(page.locator('#bookmark-container'));
  const start = await visibleBox(bookmark);
  const pointer = {
    x: start.x + start.width * .75,
    y: start.y + start.height / 2
  };

  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  await expect(bookmark).not.toHaveClass(/is-dragging/);
  const distance = Math.hypot(deltaX, deltaY);
  await page.mouse.move(
    pointer.x + deltaX / distance * 6,
    pointer.y + deltaY / distance * 6
  );
  await expect(bookmark).toHaveClass(/is-dragging/);
  await page.mouse.move(
    pointer.x + deltaX * gridBox.width / 12,
    pointer.y + deltaY * gridBox.height / 6,
    { steps: 10 }
  );
  await page.mouse.up();
  await expect.poll(async () => (await visibleBox(bookmark)).x)
    .toBeCloseTo(start.x + deltaX * gridBox.width / 12, 0);
  await expect.poll(async () => (await visibleBox(bookmark)).y)
    .toBeCloseTo(start.y + deltaY * gridBox.height / 6, 0);
}

test('reveals the bottom workspace dock on hover and keyboard focus', async ({ page }) => {
  const toolbar = page.getByRole('navigation', { name: 'Workspace controls' });
  const viewportHeight = page.viewportSize().height;

  await expect(toolbar).toHaveCSS('bottom', '0px');
  await expect.poll(async () => (await visibleBox(toolbar)).y)
    .toBeGreaterThan(viewportHeight - 20);

  await toolbar.hover();
  await expect.poll(async () => (await visibleBox(toolbar)).y)
    .toBeLessThan(viewportHeight - 40);

  await page.mouse.move(0, 0);
  await page.locator('#workspace-toggle').focus();
  await expect.poll(async () => (await visibleBox(toolbar)).y)
    .toBeLessThan(viewportHeight - 40);
});

test('expands the bottom dock around workspace choices and collapses on toggle', async ({ page }) => {
  const toolbar = page.getByRole('navigation', { name: 'Workspace controls' });
  const toggle = page.locator('#workspace-toggle');
  const options = page.locator('#workspace-options');
  await toolbar.hover();
  const collapsedHeight = (await visibleBox(toolbar)).height;

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(options).toHaveAttribute('aria-hidden', 'false');
  await expect(options).toBeVisible();
  await expect.poll(async () => (await visibleBox(toolbar)).height)
    .toBeGreaterThan(collapsedHeight + 30);

  const expandedToolbar = await visibleBox(toolbar);
  const expandedOptions = await visibleBox(options);
  expect(expandedOptions.x).toBeGreaterThanOrEqual(expandedToolbar.x);
  expect(expandedOptions.x + expandedOptions.width)
    .toBeLessThanOrEqual(expandedToolbar.x + expandedToolbar.width);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(options).toHaveAttribute('aria-hidden', 'true');
  await expect(options).toBeHidden();
  await expect.poll(async () => (await visibleBox(toolbar)).height)
    .toBeCloseTo(collapsedHeight, 0);
});

test('reveals the left action dock on hover and keyboard focus', async ({ page }) => {
  const menu = page.locator('#floating-menu');
  const viewportHeight = page.viewportSize().height;

  await expect.poll(async () => (await visibleBox(menu)).x).toBeLessThan(-40);

  await page.mouse.move(5, viewportHeight / 2);
  await expect.poll(async () => (await visibleBox(menu)).x).toBeGreaterThanOrEqual(0);
  await page.locator('#add-toggle').hover();
  await expect(page.locator('#add-toggle'))
    .toHaveCSS('background-color', 'rgba(22, 163, 74, 0.82)');

  await page.mouse.move(page.viewportSize().width / 2, viewportHeight / 2);
  await page.locator('#edit-toggle-mode').focus();
  await expect.poll(async () => (await visibleBox(menu)).x).toBeGreaterThanOrEqual(0);
});

test('keeps long bookmark titles centered and truncated inside their card', async ({ page }) => {
  const bookmark = page.locator('#bookmark-container > .bookmark').first();
  const title = bookmark.locator('.bookmark-title');
  const bookmarkBox = await visibleBox(bookmark);
  const titleBox = await visibleBox(title);

  await expect(title).toHaveCSS('text-align', 'center');
  await expect(title).toHaveCSS('text-overflow', 'ellipsis');
  expect(await title.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(titleBox.x).toBeGreaterThanOrEqual(bookmarkBox.x);
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(bookmarkBox.x + bookmarkBox.width);
});

test('selects on a short click and exposes only the direct edit control', async ({ page }) => {
  await enableEditMode(page);
  const bookmark = page.locator('#bookmark-container > .bookmark').first();
  const secondBookmark = page.locator('#bookmark-container > .bookmark').nth(1);
  const controls = bookmark.getByRole('group', { name: 'Bookmark controls' });
  const edit = bookmark.getByRole('button', { name: 'Edit bookmark' });

  await expect(controls).toBeVisible();
  await expect(controls.getByRole('button')).toHaveCount(1);
  await expect(bookmark.locator('.bookmark-select-toggle')).toHaveCount(0);
  await expect(edit).toBeVisible();
  await expect(bookmark.locator('.bookmark-action-menu, .bookmark-actions')).toHaveCount(0);

  const editBox = await visibleBox(edit);
  const bookmarkBox = await visibleBox(bookmark);
  expect(editBox.x - bookmarkBox.x).toBeGreaterThanOrEqual(0);
  expect(editBox.x + editBox.width).toBeLessThanOrEqual(bookmarkBox.x + bookmarkBox.width);
  expect(editBox.y - bookmarkBox.y).toBeGreaterThanOrEqual(0);
  expect(editBox.y + editBox.height).toBeLessThanOrEqual(bookmarkBox.y + bookmarkBox.height);

  await bookmark.click();
  await expect(bookmark).toHaveClass(/is-selected/);
  await secondBookmark.click();
  await expect(page.locator('#bookmark-container > .bookmark.is-selected')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(bookmark).not.toHaveClass(/is-selected/);
  await expect(secondBookmark).not.toHaveClass(/is-selected/);
  await expect(page.locator('#bulk-actions')).toHaveClass(/is-hidden/);

  await page.mouse.move(
    bookmarkBox.x + bookmarkBox.width / 2,
    bookmarkBox.y + bookmarkBox.height / 2
  );
  await page.mouse.down();
  await page.waitForTimeout(220);
  await expect(bookmark).toHaveClass(/is-dragging/);
  await page.mouse.up();
  await expect(bookmark).not.toHaveClass(/is-selected/);

  await edit.click();
  const editor = page.locator('#edit-bookmark-modal');
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  await page.mouse.move(page.viewportSize().width / 2, page.viewportSize().height / 2);
  await expect(edit).toBeFocused();
  await expect(edit).not.toHaveCSS('background-color', 'rgb(37, 99, 235)');
});

test('navigates the grid with Tab and opens the keyboard-focused bookmark', async ({ page }) => {
  const grid = page.locator('#bookmark-container');
  const bookmarks = page.locator('#bookmark-container > .bookmark[data-bookmark-id]');
  const first = bookmarks.nth(0);
  const second = bookmarks.nth(1);
  const recycleBin = page.locator('#bookmark-container .recycle-bin');

  await page.keyboard.press('Tab');
  await expect(grid).toHaveCSS('outline-style', 'none');
  await expect(recycleBin).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowDown');
  await expect(first).toHaveClass(/is-keyboard-active/);
  await expect(page.locator('.flash-message').last()).toHaveText('Selection mode enabled');

  await page.keyboard.press('ArrowRight');
  await expect(second).toHaveClass(/is-keyboard-active/);

  await page.keyboard.press('ArrowLeft');
  await expect(first).toHaveClass(/is-keyboard-active/);

  await page.keyboard.press('Tab');
  await expect(page.locator('.bookmark.is-keyboard-active')).toHaveCount(0);
  await expect(page.locator('.flash-message').last()).toHaveText('Selection mode disabled');

  await page.keyboard.press('Tab');
  await expect(recycleBin).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowDown');
  await expect(first).toHaveClass(/is-keyboard-active/);

  await first.locator('.bookmark-link').evaluate(link => {
    link.setAttribute('href', '#keyboard-opened');
  });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#keyboard-opened$/);
});

test('opens the recycle bin or its editor from Tab navigation according to edit mode', async ({ page }) => {
  const recycleBin = page.locator('#bookmark-container .recycle-bin');

  await page.keyboard.press('Tab');
  await expect(recycleBin).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#recycle-bin-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#recycle-bin-modal')).toBeHidden();

  await enableEditMode(page);
  await expect(page.locator('#bookmark-container')).toBeFocused();
  await expect(recycleBin).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#edit-recycle-bin-modal')).toBeVisible();
});

test('customizes and hides the recycle bin from its edit action', async ({ page }) => {
  await enableEditMode(page);
  let recycleBin = page.locator('#bookmark-container .recycle-bin');
  const edit = recycleBin.getByRole('button', { name: 'Edit recycle bin' });
  await expect(edit).toBeVisible();
  await edit.click();

  const editor = page.locator('#edit-recycle-bin-modal');
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('tab')).toHaveCount(2);
  await expect(editor.getByRole('tab', { name: 'General' })).toHaveClass(/active/);

  await editor.getByRole('tab', { name: 'Style' }).click();
  await page.locator('#recycle-bin-editor-no-background').check();
  await expect(page.locator('#recycle-bin-editor-background-color')).toBeDisabled();
  await expect(page.locator('.edit-item-modal-preview > .recycle-bin-editor-preview-card'))
    .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.locator('#recycle-bin-editor-no-background').uncheck();
  await page.locator('#recycle-bin-editor-background-color').fill('#663399');

  await editor.getByRole('tab', { name: 'Style' }).click();
  await page.locator('#recycle-bin-editor-icon-color').fill('#ffaa00');
  await page.locator('#recycle-bin-editor-show-icon').uncheck();

  await editor.getByRole('tab', { name: 'Style' }).click();
  await page.locator('#recycle-bin-editor-text-color').fill('#00ff00');
  await page.locator('#recycle-bin-editor-show-name').uncheck();
  await page.locator('#edit-recycle-bin-modal-save').click();
  await expect(editor).toBeHidden();

  recycleBin = page.locator('#bookmark-container .recycle-bin');
  await expect(recycleBin).toHaveClass(/has-recycle-bin-background/);
  await expect(recycleBin).toHaveClass(/is-recycle-bin-icon-hidden/);
  await expect(recycleBin).toHaveClass(/is-recycle-bin-name-hidden/);
  await expect(recycleBin).toHaveCSS('background-color', 'rgb(102, 51, 153)');

  await recycleBin.getByRole('button', { name: 'Edit recycle bin' }).click();
  await expect(editor.getByRole('tab', { name: 'General' })).toHaveClass(/active/);
  await page.locator('#recycle-bin-editor-visible').uncheck();
  await page.locator('#edit-recycle-bin-modal-save').click();
  await expect(page.locator('#bookmark-container .recycle-bin')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getState().data.settings.showRecycleBin)).toBe(false);
});

test('removes and persists the recycle bin background from the style tab', async ({ page }) => {
  await enableEditMode(page);
  await page.locator('#bookmark-container .recycle-bin')
    .getByRole('button', { name: 'Edit recycle bin' })
    .click();

  const editor = page.locator('#edit-recycle-bin-modal');
  await editor.getByRole('tab', { name: 'Style' }).click();
  await page.locator('#recycle-bin-editor-no-background').uncheck();
  await page.locator('#recycle-bin-editor-background-color').fill('#663399');
  await page.locator('#edit-recycle-bin-modal-save').click();

  let recycleBin = page.locator('#bookmark-container .recycle-bin');
  await expect(recycleBin).toHaveClass(/has-recycle-bin-background/);
  await recycleBin.getByRole('button', { name: 'Edit recycle bin' }).click();
  await editor.getByRole('tab', { name: 'Style' }).click();
  await page.locator('#recycle-bin-editor-no-background').check();
  await page.locator('#edit-recycle-bin-modal-save').click();

  recycleBin = page.locator('#bookmark-container .recycle-bin');
  await expect(recycleBin).toHaveClass(/is-recycle-bin-transparent/);
  await expect(recycleBin).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(recycleBin).toHaveCSS('box-shadow', 'none');

  await reloadSavedPage(page);
  recycleBin = page.locator('#bookmark-container .recycle-bin');
  await expect(recycleBin).toHaveClass(/is-recycle-bin-transparent/);
  await expect(recycleBin).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('restores the recycle bin defaults from the general tab', async ({ page }) => {
  await enableEditMode(page);
  let recycleBin = page.locator('#bookmark-container .recycle-bin');
  await recycleBin.getByRole('button', { name: 'Edit recycle bin' }).click();

  const editor = page.locator('#edit-recycle-bin-modal');
  await editor.getByRole('tab', { name: 'Style' }).click();
  await page.locator('#recycle-bin-editor-no-background').uncheck();
  await page.locator('#recycle-bin-editor-background-color').fill('#663399');
  await editor.getByRole('tab', { name: 'Style' }).click();
  await page.locator('#recycle-bin-editor-show-name').uncheck();
  await page.locator('#edit-recycle-bin-modal-save').click();
  await expect(recycleBin).toHaveClass(/is-recycle-bin-name-hidden/);

  await recycleBin.getByRole('button', { name: 'Edit recycle bin' }).click();
  await expect(editor.getByRole('tab', { name: 'General' })).toHaveClass(/active/);
  await page.locator('#recycle-bin-editor-reset').click();
  await expect(page.locator('#recycle-bin-editor-background-color')).toHaveValue(/#[\da-f]{6}/i);
  await expect(page.locator('#recycle-bin-editor-no-background')).toBeChecked();
  await expect(page.locator('#recycle-bin-editor-show-name')).toBeChecked();
  await expect(page.locator('#recycle-bin-editor-show-count')).not.toBeChecked();
  await page.locator('#edit-recycle-bin-modal-save').click();

  recycleBin = page.locator('#bookmark-container .recycle-bin');
  await expect(recycleBin).not.toHaveClass(/is-recycle-bin-name-hidden/);
  await expect(recycleBin).toHaveClass(/is-recycle-bin-count-hidden/);
  await expect(recycleBin).not.toHaveClass(/has-recycle-bin-background/);
});

test('marks the keyboard-focused bookmark with S while editing', async ({ page }) => {
  await enableEditMode(page);
  const grid = page.locator('#bookmark-container');
  const bookmarks = page.locator('#bookmark-container > .bookmark[data-bookmark-id]');
  const first = bookmarks.nth(0);
  const second = bookmarks.nth(1);

  await expect(grid).toBeFocused();
  await page.keyboard.press('Tab');
  const recycleBin = page.locator('#bookmark-container .recycle-bin');
  await expect(recycleBin).toHaveClass(/is-keyboard-active/);

  await page.keyboard.press('s');
  await expect(grid).toHaveClass(/is-grid-keyboard-rejected/);
  await expect(page.locator('#bookmark-container .is-selected')).toHaveCount(0);
  await expect.poll(() => grid.evaluate(element => (
    getComputedStyle(element, '::after').borderTopColor
  ))).toBe('rgba(239, 68, 68, 0.98)');

  await page.keyboard.press('Backspace');
  await expect(grid).toHaveClass(/is-grid-keyboard-rejected/);
  await expect(page.locator('#alert-modal')).toBeHidden();

  await page.keyboard.press('ArrowDown');
  await expect(first).toHaveClass(/is-keyboard-active/);
  await expect(grid).not.toHaveClass(/is-grid-keyboard-rejected/);

  await page.keyboard.press('s');
  await expect(first).toHaveClass(/is-selected/);

  await page.keyboard.press('Escape');
  await expect(first).not.toHaveClass(/is-selected/);
  await expect(first).toHaveClass(/is-keyboard-active/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#bookmark-container .is-keyboard-active')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().ui.isEditing;
  })).toBe(false);

  await enableEditMode(page);

  await grid.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await expect(first).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('s');
  await expect(first).toHaveClass(/is-selected/);

  await page.keyboard.press('Enter');
  await expect(page.locator('#edit-bookmark-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#edit-bookmark-modal')).toBeHidden();

  await expect(grid).toBeFocused();
  await expect(first).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowRight');
  await expect(second).toHaveClass(/is-keyboard-active/);
  await expect(first).toHaveClass(/is-selected/);
});

test('does not move a selected bookmark until Tab navigation is disabled', async ({ page }) => {
  await enableEditMode(page);
  const grid = page.locator('#bookmark-container');
  const first = page.locator('#bookmark-container > .bookmark[data-bookmark-id]').first();
  const gridBox = await visibleBox(grid);

  await first.click();
  await expect(first).toHaveClass(/is-selected/);
  await grid.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await expect(first).toHaveClass(/is-keyboard-active/);

  const start = await visibleBox(first);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  await expect.poll(async () => (await visibleBox(first)).y)
    .toBeCloseTo(start.y, 0);

  await page.keyboard.press('Tab');
  await expect(page.locator('.bookmark.is-keyboard-active')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await visibleBox(first)).y)
    .toBeCloseTo(start.y + gridBox.height / 6, 0);
  await expect(first).toHaveClass(/is-selected/);
});

test('navigates folders and opens them according to the current edit mode', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Keyboard folder');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await waitForSaved(page);
  await expect(page.locator('#add-toggle')).toBeFocused();

  const grid = page.locator('#bookmark-container');
  const folder = grid.locator('.bookmark-folder', { hasText: 'Keyboard folder' });
  const folderVisual = folder.locator('.folder-visual');
  await folder.locator('.folder-open').hover();
  await expect(folderVisual).toHaveCSS('transform', 'none');
  await expect(folderVisual).toHaveCSS('filter', /drop-shadow/);
  await grid.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(folder).toHaveClass(/is-keyboard-active/);

  await page.keyboard.press('Enter');
  await expect(page.locator('#folder-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#folder-modal')).toBeHidden();

  await enableEditMode(page);
  await expect(grid).toBeFocused();
  await expect(folder).toHaveClass(/is-keyboard-active/);

  await page.keyboard.press('s');
  await expect(folder).toHaveClass(/is-selected/);
  await expect(page.locator('.bookmark.is-selected')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('#edit-folder-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#edit-folder-modal')).toBeHidden();
  await expect(grid).toBeFocused();
  await expect(folder).toHaveClass(/is-keyboard-active/);
});

test('prefers the item aligned with the active grid column', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Column folder');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);
  await createBookmark(page, 'Directly below', 'below.test');
  await createBookmark(page, 'Left below', 'left-below.test');

  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const folder = stored.folders.find(entry => entry.name === 'Column folder');
    const below = stored.bookmarks.find(entry => entry.name === 'Directly below');
    const leftBelow = stored.bookmarks.find(entry => entry.name === 'Left below');

    Object.assign(stored.bookmarks[0], { gx: 0, gy: 3 });
    Object.assign(stored.bookmarks[1], { gx: 1, gy: 3 });
    Object.assign(folder, { gx: 5, gy: 0 });
    Object.assign(below, { gx: 5, gy: 1 });
    Object.assign(leftBelow, { gx: 3, gy: 1 });
    Object.assign(stored.recycleBin, { gx: 6, gy: 0 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);

  await page.locator('#bookmark-container').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.bookmark-folder', { hasText: 'Column folder' }))
    .toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.bookmark', { hasText: 'Directly below' }))
    .toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.bookmark', { hasText: 'Left below' }))
    .toHaveClass(/is-keyboard-active/);
});

test('keeps horizontal navigation on the current row across a gap', async ({ page }) => {
  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));

    Object.assign(stored.bookmarks[0], { gx: 4, gy: 2 });
    Object.assign(stored.bookmarks[1], { gx: 2, gy: 2 });
    Object.assign(stored.recycleBin, { gx: 4, gy: 1 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);

  const grid = page.locator('#bookmark-container');
  const current = page.locator('#bookmark-container > .bookmark').nth(0);
  const left = page.locator('#bookmark-container > .bookmark').nth(1);
  const recycleBin = page.locator('#bookmark-container .recycle-bin');

  await grid.focus();
  await page.keyboard.press('Tab');
  await expect(recycleBin).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowDown');
  await expect(current).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowLeft');
  await expect(left).toHaveClass(/is-keyboard-active/);
});

test('confirms Backspace and Delete on the keyboard-focused bookmark while editing', async ({ page }) => {
  await enableEditMode(page);
  const grid = page.locator('#bookmark-container');
  const first = page.locator('#bookmark-container > .bookmark[data-bookmark-id]').first();
  const bookmarkId = await first.getAttribute('data-bookmark-id');
  const secondBookmarkId = await page
    .locator('#bookmark-container > .bookmark[data-bookmark-id]')
    .nth(1)
    .getAttribute('data-bookmark-id');
  const second = page.locator(`[data-bookmark-id="${secondBookmarkId}"]`);
  const trashCount = await page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().data.trash.length;
  });

  await grid.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await expect(first).toHaveClass(/is-keyboard-active/);
  await expect(first).not.toHaveClass(/is-selected/);

  await page.keyboard.press('Backspace');
  await expect(page.locator('#alert-modal-title')).toHaveText('Delete “DEVELOPED BY”?');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(first).toBeVisible();
  await expect(first).toHaveClass(/is-keyboard-active/);
  await expect(grid).toBeFocused();

  await page.keyboard.press('Shift+Delete');
  await expect(page.locator('#alert-modal-title'))
    .toHaveText('Permanently delete “DEVELOPED BY”? This cannot be undone.');
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.locator(`[data-bookmark-id="${bookmarkId}"]`)).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().data.trash.length;
  })).toBe(trashCount);
  await page.keyboard.press('Control+KeyZ');
  await expect(page.locator(`[data-bookmark-id="${bookmarkId}"]`)).toHaveCount(0);
  await expect(second).toHaveClass(/is-keyboard-active/);
  await expect(grid).toBeFocused();

  await page.keyboard.press('Delete');
  await expect(page.locator('#alert-modal-title')).toHaveText('Delete “banana”?');
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.locator(`[data-bookmark-id="${secondBookmarkId}"]`)).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().data.trash.length;
  })).toBe(trashCount + 1);
  await expect(page.locator('#bookmark-container .is-keyboard-active')).toHaveCount(1);
  await expect(grid).toBeFocused();
  await expect(grid).toHaveClass(/has-grid-keyboard-cursor/);
});

test('confirms Delete and Backspace on an unselected keyboard-focused folder', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Delete with keyboard');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await waitForSaved(page);

  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    Object.assign(stored.recycleBin, { gx: 0, gy: 0, w: 1, h: 1 });
    const folder = stored.folders.find(item => item.name === 'Delete with keyboard');
    Object.assign(folder, { gx: 0, gy: 1, w: 1, h: 1 });
    stored.bookmarks.forEach((bookmark, index) => {
      Object.assign(bookmark, { gx: 4 + index, gy: 4 });
    });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);
  await enableEditMode(page);

  const grid = page.locator('#bookmark-container');
  const folder = page.locator('.bookmark-folder', { hasText: 'Delete with keyboard' });
  await grid.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await expect(folder).toHaveClass(/is-keyboard-active/);
  await expect(folder).not.toHaveClass(/is-selected/);

  await page.keyboard.press('Delete');
  await expect(page.locator('#alert-modal-title'))
    .toHaveText('Move “Delete with keyboard” and its 0 bookmarks to the recycle bin?');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(grid).toBeFocused();
  await expect(folder).toBeVisible();

  await page.keyboard.press('Shift+Backspace');
  await expect(page.locator('#alert-modal-title')).toHaveText(
    'Permanently delete “Delete with keyboard” and its 0 bookmarks? This cannot be undone.'
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(folder).toHaveClass(/is-keyboard-active/);

  await page.keyboard.press('Backspace');
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(folder).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().data.trash.some(entry => (
      entry.type === 'folder' && entry.folder.name === 'Delete with keyboard'
    ));
  })).toBe(true);
  await expect(page.locator('#bookmark-container .is-keyboard-active')).toHaveCount(1);
  await expect(grid).toBeFocused();
  await expect(grid).toHaveClass(/has-grid-keyboard-cursor/);
});

test('continues Tab navigation on the next occupied row after the row edge', async ({ page }) => {
  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));

    Object.assign(stored.recycleBin, { gx: 0, gy: 0, w: 1, h: 1 });
    Object.assign(stored.bookmarks[0], { gx: 10, gy: 0, w: 1, h: 1 });
    Object.assign(stored.bookmarks[1], { gx: 3, gy: 4, w: 3, h: 2 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);

  const grid = page.locator('#bookmark-container');
  const rowEnd = page.locator('#bookmark-container > .bookmark').nth(0);
  const nextRow = page.locator('#bookmark-container > .bookmark').nth(1);

  await grid.focus();
  await page.keyboard.press('Tab');
  await expect(grid).toHaveClass(/has-grid-keyboard-cursor/);
  const entranceGeometryAnimations = await grid.evaluate(element => (
    element.getAnimations({ subtree: true })
      .filter(animation => ['left', 'top', 'width', 'height'].includes(animation.transitionProperty))
      .length
  ));
  expect(entranceGeometryAnimations).toBe(0);
  const initialCursorX = await grid.evaluate(element => (
    element.style.getPropertyValue('--grid-keyboard-cursor-x')
  ));

  await page.keyboard.press('ArrowRight');
  await expect(rowEnd).toHaveClass(/is-keyboard-active/);
  await expect(rowEnd).toHaveCSS('outline-style', 'none');
  await expect.poll(() => grid.evaluate(element => (
    element.style.getPropertyValue('--grid-keyboard-cursor-x')
  ))).not.toBe(initialCursorX);

  await page.keyboard.press('ArrowRight');
  await expect(nextRow).toHaveClass(/is-keyboard-active/);

  await page.keyboard.press('ArrowLeft');
  await expect(rowEnd).toHaveClass(/is-keyboard-active/);
});

test('limits rapid Tab navigation to one pending arrow move', async ({ page }) => {
  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));

    Object.assign(stored.recycleBin, { gx: 0, gy: 0, w: 1, h: 1 });
    Object.assign(stored.bookmarks[0], { gx: 10, gy: 0, w: 1, h: 1 });
    Object.assign(stored.bookmarks[1], { gx: 3, gy: 4, w: 3, h: 2 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);

  const grid = page.locator('#bookmark-container');
  const rowEnd = page.locator('#bookmark-container > .bookmark').nth(0);
  const nextRow = page.locator('#bookmark-container > .bookmark').nth(1);

  await grid.focus();
  await page.keyboard.press('Tab');
  await page.evaluate(() => {
    for (let index = 0; index < 3; index++) {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true
      }));
    }
  });

  await expect(rowEnd).toHaveClass(/is-keyboard-active/);
  await page.waitForTimeout(150);
  await expect(nextRow).toHaveClass(/is-keyboard-active/);
  await page.waitForTimeout(150);
  await expect(nextRow).toHaveClass(/is-keyboard-active/);
});

test('keeps the current row even when its next card is far away', async ({ page }) => {
  await createBookmark(page, 'Same row target', 'same-row.test');

  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const target = stored.bookmarks.find(entry => entry.name === 'Same row target');

    Object.assign(stored.bookmarks[0], { gx: 0, gy: 1 });
    Object.assign(stored.bookmarks[1], { gx: 1, gy: 0 });
    Object.assign(target, { gx: 2, gy: 1 });
    Object.assign(stored.recycleBin, { gx: 0, gy: 0 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);

  const grid = page.locator('#bookmark-container');
  const current = page.locator('.bookmark', { hasText: 'DEVELOPED BY' });
  const target = page.locator('.bookmark', { hasText: 'Same row target' });

  await grid.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await expect(current).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowRight');
  await expect(target).toHaveClass(/is-keyboard-active/);

  // Empty cells do not make a diagonal card steal horizontal navigation.
  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const targetEntry = stored.bookmarks.find(entry => entry.name === 'Same row target');
    Object.assign(targetEntry, { gx: 3, gy: 1 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);
  await grid.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(target)
    .toHaveClass(/is-keyboard-active/);
});

test('follows adjacent folders through remembered entry rows and columns', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('PokeMMO');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await waitForSaved(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('test');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await waitForSaved(page);
  await createBookmark(page, 'Wayback Machine', 'https://web.archive.org');
  await createBookmark(page, 'Gmail', 'https://mail.google.com');
  await createBookmark(page, 'Web3Forms', 'https://web3forms.com');

  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const folder = stored.folders.find(entry => entry.name === 'PokeMMO');
    const testFolder = stored.folders.find(entry => entry.name === 'test');
    const wayback = stored.bookmarks.find(entry => entry.name === 'Wayback Machine');
    const gmail = stored.bookmarks.find(entry => entry.name === 'Gmail');
    const web3 = stored.bookmarks.find(entry => entry.name === 'Web3Forms');

    Object.assign(stored.bookmarks[0], { gx: 0, gy: 3 });
    Object.assign(stored.bookmarks[1], { gx: 1, gy: 0 });
    Object.assign(wayback, { gx: 1, gy: 1 });
    Object.assign(folder, { gx: 2, gy: 0, w: 2, h: 2 });
    Object.assign(gmail, { gx: 8, gy: 1 });
    Object.assign(web3, { gx: 5, gy: 4 });
    Object.assign(testFolder, { gx: 9, gy: 4 });
    Object.assign(stored.recycleBin, { gx: 7, gy: 4, w: 2, h: 2 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);

  const grid = page.locator('#bookmark-container');
  const banana = page.locator('#bookmark-container > .bookmark').nth(1);
  await grid.focus();
  await page.keyboard.press('Tab');
  await expect(banana).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.bookmark-folder', { hasText: 'PokeMMO' }))
    .toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowLeft');
  await expect(banana).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.bookmark', { hasText: 'Wayback Machine' }))
    .toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.bookmark-folder', { hasText: 'PokeMMO' }))
    .toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.bookmark', { hasText: 'Wayback Machine' }))
    .toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.bookmark-folder', { hasText: 'PokeMMO' }))
    .toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.bookmark', { hasText: 'DEVELOPED BY' }))
    .toHaveClass(/is-keyboard-active/);
});

test('skips occupied cells to the next free gap with arrow keys in none mode', async ({ page }) => {
  await setBookmarkDragMode(page, 'none');
  await createBookmark(page, 'Arrow blocker', 'arrow-blocker.test');
  await enableEditMode(page);
  const bookmarks = page.locator('#bookmark-container > .bookmark[data-bookmark-id]');
  const first = bookmarks.nth(0);
  const selected = bookmarks.nth(1);
  const blocker = bookmarks.nth(2);
  const gridBox = await visibleBox(page.locator('#bookmark-container'));
  const firstStart = await visibleBox(first);

  await moveGridItemByCells(page, selected, 2, 0);
  await moveGridItemByCells(page, blocker, 2, -1);
  const selectedStart = await visibleBox(selected);

  await selected.click();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await visibleBox(selected)).x)
    .toBeCloseTo(selectedStart.x - gridBox.width / 12 * 2, 0);
  await expect.poll(async () => (await visibleBox(first)).x)
    .toBeCloseTo(firstStart.x, 0);

  const freeGap = await visibleBox(selected);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await visibleBox(selected)).x)
    .toBeCloseTo(freeGap.x, 0);

  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await visibleBox(selected)).x)
    .toBeCloseTo(selectedStart.x, 0);
  await expect(selected).toHaveClass(/is-selected/);
});

for (const mode of ['relocate', 'cascade']) {
  test(`moves a single selection one occupied cell at a time in ${mode} mode`, async ({ page }) => {
    await setBookmarkDragMode(page, mode);
    await enableEditMode(page);
    const bookmarks = page.locator('#bookmark-container > .bookmark[data-bookmark-id]');
    const selected = bookmarks.nth(0);
    const neighbor = bookmarks.nth(1);
    const selectedStart = await visibleBox(selected);
    const neighborStart = await visibleBox(neighbor);

    await selected.click();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await visibleBox(selected)).x)
      .toBeCloseTo(neighborStart.x, 0);
    await expect.poll(async () => (await visibleBox(neighbor)).x)
      .toBeCloseTo(selectedStart.x, 0);
    await expect(selected).toHaveClass(/is-selected/);

    await neighbor.click();
    const selectedBeforeMultiple = await visibleBox(selected);
    const neighborBeforeMultiple = await visibleBox(neighbor);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await visibleBox(selected)).x)
      .toBeCloseTo(selectedBeforeMultiple.x, 0);
    await expect.poll(async () => (await visibleBox(neighbor)).x)
      .toBeCloseTo(neighborBeforeMultiple.x, 0);
  });
}

test('turns cascades across rows and persists the whole path atomically', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await setBookmarkDragMode(page, 'cascade');
  await createBookmark(page, 'Chain one', 'chain-one.test');
  await createBookmark(page, 'Chain two', 'chain-two.test');
  await enableEditMode(page);
  const grid = page.locator('#bookmark-container');
  const bookmarks = page.locator('.bookmark[data-bookmark-id]');
  await moveGridItemByCells(page, bookmarks.nth(2), 2, -1);
  await moveGridItemByCells(page, bookmarks.nth(3), 3, -2);
  const displaced = [bookmarks.nth(0), bookmarks.nth(1), bookmarks.nth(2)];
  const dragged = bookmarks.nth(3);
  const gridBox = await visibleBox(grid);
  const starts = await Promise.all([
    ...displaced.map(bookmark => visibleBox(bookmark)),
    visibleBox(dragged)
  ]);
  const draggedStart = starts[3];
  const cellWidth = gridBox.width / 12;
  const cellHeight = gridBox.height / 6;
  const pointerStart = {
    x: draggedStart.x + draggedStart.width / 2,
    y: draggedStart.y + draggedStart.height / 2
  };

  await page.mouse.move(pointerStart.x, pointerStart.y);
  await page.mouse.down();
  await expect(dragged).not.toHaveClass(/is-dragging/);
  await page.mouse.move(pointerStart.x - 6, pointerStart.y);
  await expect(dragged).toHaveClass(/is-dragging/);
  await page.mouse.move(pointerStart.x - cellWidth * 3, pointerStart.y, { steps: 12 });

  expect(pageErrors).toEqual([]);
  await expect(dragged).not.toHaveClass(/is-invalid/);
  for (const bookmark of displaced) await expect(bookmark).toHaveClass(/is-smart-displaced/);
  for (let index = 0; index < displaced.length; index += 1) {
    await expect.poll(async () => (await visibleBox(displaced[index])).x)
      .toBeCloseTo(starts[index + 1].x, 0);
  }
  await expect.poll(async () => (await visibleBox(dragged)).x)
    .toBeCloseTo(starts[0].x, 0);

  await page.mouse.move(
    pointerStart.x - cellWidth * 3,
    pointerStart.y + cellHeight,
    { steps: 10 }
  );

  for (let index = 0; index < displaced.length; index += 1) {
    await expect(displaced[index]).not.toHaveClass(/is-smart-displaced/);
    await expect.poll(async () => (await visibleBox(displaced[index])).x)
      .toBeCloseTo(starts[index].x, 0);
  }
  await expect.poll(async () => (await visibleBox(dragged)).x)
    .toBeCloseTo(starts[0].x, 0);
  await expect.poll(async () => (await visibleBox(dragged)).y)
    .toBeCloseTo(draggedStart.y + cellHeight, 0);

  await page.mouse.move(pointerStart.x - cellWidth * 3, pointerStart.y, { steps: 12 });
  await expect(displaced[0]).toHaveClass(/is-smart-displaced/);
  await expect(displaced[1]).not.toHaveClass(/is-smart-displaced/);
  await expect(displaced[2]).not.toHaveClass(/is-smart-displaced/);
  await expect.poll(async () => (await visibleBox(displaced[0])).y)
    .toBeCloseTo(starts[0].y + cellHeight, 0);
  for (let index = 1; index < displaced.length; index += 1) {
    await expect.poll(async () => (await visibleBox(displaced[index])).x)
      .toBeCloseTo(starts[index].x, 0);
  }

  await page.mouse.move(
    pointerStart.x - cellWidth * 2,
    pointerStart.y,
    { steps: 8 }
  );
  await expect(dragged).not.toHaveClass(/is-invalid/);
  await expect(displaced[0]).toHaveClass(/is-smart-displaced/);
  await expect(displaced[1]).toHaveClass(/is-smart-displaced/);
  await expect(displaced[2]).not.toHaveClass(/is-smart-displaced/);
  await expect.poll(async () => (await visibleBox(displaced[1])).x)
    .toBeCloseTo(starts[0].x, 0);

  await page.mouse.move(
    pointerStart.x - cellWidth,
    pointerStart.y,
    { steps: 8 }
  );
  await expect(dragged).not.toHaveClass(/is-invalid/);
  for (const bookmark of displaced) await expect(bookmark).toHaveClass(/is-smart-displaced/);
  await expect.poll(async () => (await visibleBox(displaced[2])).x)
    .toBeCloseTo(starts[1].x, 0);
  await page.mouse.up();

  await expect.poll(async () => (await visibleBox(displaced[0])).y)
    .toBeCloseTo(starts[0].y + cellHeight, 0);
  await expect.poll(async () => (await visibleBox(displaced[1])).x)
    .toBeCloseTo(starts[0].x, 0);
  await expect.poll(async () => (await visibleBox(displaced[2])).x)
    .toBeCloseTo(starts[1].x, 0);
  await expect.poll(async () => (await visibleBox(dragged)).x)
    .toBeCloseTo(starts[2].x, 0);

  await reloadSavedPage(page);
  await expect(page.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();
  await expect.poll(async () => (await visibleBox(displaced[0])).y)
    .toBeCloseTo(starts[0].y + cellHeight, 0);
  await expect.poll(async () => (await visibleBox(displaced[1])).x)
    .toBeCloseTo(starts[0].x, 0);
  await expect.poll(async () => (await visibleBox(displaced[2])).x)
    .toBeCloseTo(starts[1].x, 0);
  await expect.poll(async () => (await visibleBox(dragged)).x)
    .toBeCloseTo(starts[2].x, 0);
});

test('defaults to none, warns about sequence, and persists drag modes', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();

  const cascade = page.locator('input[name="bookmark-drag-mode"][value="cascade"]');
  const relocate = page.locator('input[name="bookmark-drag-mode"][value="relocate"]');
  const none = page.locator('input[name="bookmark-drag-mode"][value="none"]');
  expect(await page.locator('input[name="bookmark-drag-mode"]').evaluateAll(
    inputs => inputs.map(input => input.value)
  )).toEqual(['none', 'relocate', 'cascade']);
  await expect(none).toBeChecked();
  await expect(relocate).not.toBeChecked();
  await expect(cascade).not.toBeChecked();
  if (!(await page.locator('input[name="bookmark-drag-mode"]').first().isVisible())) {
    await page.locator('#bookmark-drag-settings-title').click();
  }
  await expect(page.getByText('Experimental · May contain minor bugs.')).toBeVisible();
  await cascade.check();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();

  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await expect(cascade).toBeChecked();
  if (!(await page.locator('input[name="bookmark-drag-mode"]').first().isVisible())) {
    await page.locator('#bookmark-drag-settings-title').click();
  }
  await relocate.check();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();

  await createBookmark(page, 'Relocate me', 'relocate.test');
  await enableEditMode(page);
  const bookmarks = page.locator('.bookmark[data-bookmark-id]');
  await moveGridItemByCells(page, bookmarks.nth(2), 2, -1);
  const target = bookmarks.nth(0);
  const middle = bookmarks.nth(1);
  const dragged = bookmarks.nth(2);
  const gridBox = await visibleBox(page.locator('#bookmark-container'));
  const [targetStart, middleStart, draggedStart] = await Promise.all([
    visibleBox(target),
    visibleBox(middle),
    visibleBox(dragged)
  ]);
  const pointerStart = {
    x: draggedStart.x + draggedStart.width / 2,
    y: draggedStart.y + draggedStart.height / 2
  };

  await page.mouse.move(pointerStart.x, pointerStart.y);
  await page.mouse.down();
  await expect(dragged).not.toHaveClass(/is-dragging/);
  await page.mouse.move(pointerStart.x - 6, pointerStart.y);
  await expect(dragged).toHaveClass(/is-dragging/);
  await page.mouse.move(pointerStart.x - gridBox.width / 6, pointerStart.y, { steps: 10 });

  await expect(target).toHaveClass(/is-smart-displaced/);
  await expect(middle).not.toHaveClass(/is-smart-displaced/);
  await expect.poll(async () => (await visibleBox(target)).x)
    .toBeCloseTo(draggedStart.x, 0);
  await expect.poll(async () => (await visibleBox(middle)).x)
    .toBeCloseTo(middleStart.x, 0);
  await expect.poll(async () => (await visibleBox(dragged)).x)
    .toBeCloseTo(targetStart.x, 0);
  await page.mouse.up();
});

test('none drag mode rejects an occupied cell and restores the source', async ({ page }) => {
  await setBookmarkDragMode(page, 'none');
  await enableEditMode(page);

  const bookmarks = page.locator('.bookmark[data-bookmark-id]');
  const occupied = bookmarks.nth(0);
  const dragged = bookmarks.nth(1);
  const gridBox = await visibleBox(page.locator('#bookmark-container'));
  const occupiedStart = await visibleBox(occupied);
  const draggedStart = await visibleBox(dragged);
  const pointer = {
    x: draggedStart.x + draggedStart.width / 2,
    y: draggedStart.y + draggedStart.height / 2
  };

  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  await page.mouse.move(pointer.x - gridBox.width / 12, pointer.y, { steps: 8 });

  await expect(dragged).toHaveClass(/is-invalid/);
  await expect.poll(async () => (await visibleBox(occupied)).x)
    .toBeCloseTo(occupiedStart.x, 0);
  await expect.poll(async () => (await visibleBox(dragged)).x)
    .toBeCloseTo(draggedStart.x, 0);
  await page.mouse.up();

  await expect(dragged).not.toHaveClass(/is-invalid/);
  await expect.poll(async () => (await visibleBox(dragged)).x)
    .toBeCloseTo(draggedStart.x, 0);
  await reloadSavedPage(page);
  await expect.poll(async () => (await visibleBox(dragged)).x)
    .toBeCloseTo(draggedStart.x, 0);
});

test('restores the source after a swap and inserts through the released cell', async ({ page }) => {
  await setBookmarkDragMode(page, 'cascade');
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Barrier');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);
  await createBookmark(page, 'Dragged', 'dragged.test');
  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const draggedBookmark = stored.bookmarks.find(bookmark => bookmark.name === 'Dragged');
    const barrierFolder = stored.folders.find(folder => folder.name === 'Barrier');

    Object.assign(stored.bookmarks[0], { gx: 2, gy: 1 });
    Object.assign(stored.bookmarks[1], { gx: 3, gy: 1 });
    Object.assign(draggedBookmark, { gx: 6, gy: 1 });
    Object.assign(barrierFolder, { gx: 4, gy: 0, w: 2, h: 2 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);
  await expect(page.getByRole('link', { name: /Dragged/ })).toBeVisible();
  await enableEditMode(page);

  const grid = page.locator('#bookmark-container');
  const bookmarks = page.locator('.bookmark[data-bookmark-id]');
  const first = bookmarks.nth(0);
  const second = bookmarks.nth(1);
  const dragged = bookmarks.nth(2);
  const folder = page.locator('.bookmark-folder', { hasText: 'Barrier' });
  const [gridBox, firstStart, secondStart, draggedStart] = await Promise.all([
    grid.boundingBox(),
    first.boundingBox(),
    second.boundingBox(),
    dragged.boundingBox()
  ]);
  const folderStart = await folder.evaluate(element => ({
    left: element.offsetLeft,
    top: element.offsetTop
  }));
  const pointerStart = {
    x: draggedStart.x + draggedStart.width / 2,
    y: draggedStart.y + draggedStart.height / 2
  };

  await page.mouse.move(pointerStart.x, pointerStart.y);
  await page.mouse.down();
  await page.mouse.move(
    secondStart.x + secondStart.width / 2,
    secondStart.y + secondStart.height / 2,
    { steps: 10 }
  );
  await expect(dragged).not.toHaveClass(/is-invalid/);
  await expect.poll(async () => (await visibleBox(second)).x)
    .toBeCloseTo(draggedStart.x, 0);
  await expect.poll(async () => (await visibleBox(first)).x)
    .toBeCloseTo(firstStart.x, 0);

  await page.mouse.move(pointerStart.x, pointerStart.y, { steps: 10 });
  await expect(dragged).not.toHaveClass(/is-invalid/);
  await expect.poll(async () => (await visibleBox(dragged)).x)
    .toBeCloseTo(draggedStart.x, 0);
  await expect.poll(async () => (await visibleBox(second)).x)
    .toBeCloseTo(secondStart.x, 0);
  await expect.poll(async () => (await visibleBox(first)).x)
    .toBeCloseTo(firstStart.x, 0);

  await page.mouse.move(
    secondStart.x + secondStart.width / 2,
    secondStart.y + secondStart.height / 2,
    { steps: 10 }
  );
  await expect(dragged).not.toHaveClass(/is-invalid/);
  await expect.poll(async () => (await visibleBox(second)).x)
    .toBeCloseTo(draggedStart.x, 0);

  await page.mouse.move(
    firstStart.x + firstStart.width / 2,
    firstStart.y + firstStart.height / 2,
    { steps: 8 }
  );
  await expect(dragged).not.toHaveClass(/is-invalid/);
  await expect.poll(async () => (await visibleBox(second)).x)
    .toBeCloseTo(draggedStart.x, 0);
  await expect.poll(async () => (await visibleBox(first)).x)
    .toBeCloseTo(secondStart.x, 0);
  await expect.poll(async () => (await visibleBox(dragged)).x)
    .toBeCloseTo(firstStart.x, 0);

  await page.mouse.move(
    pointerStart.x + gridBox.width / 12,
    pointerStart.y,
    { steps: 12 }
  );
  await expect.poll(async () => (await visibleBox(first)).x)
    .toBeCloseTo(firstStart.x, 0);
  await expect.poll(async () => (await visibleBox(second)).x)
    .toBeCloseTo(secondStart.x, 0);
  await expect.poll(async () => (await visibleBox(dragged)).x)
    .toBeCloseTo(draggedStart.x + gridBox.width / 12, 0);
  await expect.poll(() => folder.evaluate(element => element.offsetLeft))
    .toBe(folderStart.left);
  await expect.poll(() => folder.evaluate(element => element.offsetTop))
    .toBe(folderStart.top);
  await page.mouse.up();
});

test('keeps a wide folder collision-free across consecutive sequence steps', async ({ page }) => {
  await setBookmarkDragMode(page, 'cascade');
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Wide folder');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);
  await createBookmark(page, 'Test', 'test.example');
  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const folder = stored.folders.find(item => item.name === 'Wide folder');
    const testBookmark = stored.bookmarks.find(item => item.name === 'Test');

    stored.bookmarks
      .filter(item => item.id !== testBookmark.id)
      .forEach((item, index) => Object.assign(item, { gx: 6 + index, gy: 3 }));
    Object.assign(folder, { gx: 0, gy: 0, w: 2, h: 2 });
    Object.assign(testBookmark, { gx: 2, gy: 0, w: 1, h: 1 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);
  await enableEditMode(page);

  const folder = page.locator('.bookmark-folder', { hasText: 'Wide folder' });
  const testBookmark = page.locator('.bookmark[data-bookmark-id]', { hasText: 'Test' });
  const gridBox = await visibleBox(page.locator('#bookmark-container'));
  const cellWidth = gridBox.width / 12;
  const initialFolder = await visibleBox(folder);
  const initialBookmark = await visibleBox(testBookmark);
  const pointer = {
    x: initialFolder.x + initialFolder.width * .75,
    y: initialFolder.y + initialFolder.height / 2
  };

  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  await page.mouse.move(pointer.x + cellWidth, pointer.y, { steps: 8 });
  await expect.poll(async () => (await visibleBox(testBookmark)).x)
    .toBeCloseTo(initialFolder.x, 0);

  await page.mouse.move(pointer.x + cellWidth * 2, pointer.y, { steps: 8 });
  const secondStepFolder = await visibleBox(folder);
  const secondStepBookmark = await visibleBox(testBookmark);

  expect(secondStepFolder.x).toBeCloseTo(initialFolder.x + cellWidth * 2, 0);
  expect(secondStepFolder.width).toBeCloseTo(initialFolder.width, 0);
  expect(secondStepBookmark.x).toBeCloseTo(initialFolder.x, 0);
  expect(secondStepBookmark.x + secondStepBookmark.width)
    .toBeLessThanOrEqual(secondStepFolder.x);

  await page.mouse.move(pointer.x + cellWidth * 3, pointer.y, { steps: 8 });
  await expect.poll(async () => (await visibleBox(testBookmark)).x)
    .toBeCloseTo(initialBookmark.x, 0);
  await page.mouse.up();
});

test('keeps a relocated bookmark still while a wide folder continues moving', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Relocating folder');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);
  await createBookmark(page, 'Test', 'test.example');
  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const folder = stored.folders.find(item => item.name === 'Relocating folder');
    const testBookmark = stored.bookmarks.find(item => item.name === 'Test');

    stored.settings.bookmarkDragMode = 'relocate';
    stored.bookmarks
      .filter(item => item.id !== testBookmark.id)
      .forEach((item, index) => Object.assign(item, { gx: 7 + index, gy: 4 }));
    Object.assign(folder, { gx: 0, gy: 0, w: 2, h: 2 });
    Object.assign(testBookmark, { gx: 2, gy: 0, w: 1, h: 1 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);
  await enableEditMode(page);

  const grid = page.locator('#bookmark-container');
  const folder = page.locator('.bookmark-folder', { hasText: 'Relocating folder' });
  const testBookmark = page.locator('.bookmark[data-bookmark-id]', { hasText: 'Test' });
  const gridBox = await visibleBox(grid);
  const folderStart = await visibleBox(folder);
  const bookmarkStart = await visibleBox(testBookmark);
  const cellWidth = gridBox.width / 12;
  const cellHeight = gridBox.height / 6;
  const pointer = {
    x: folderStart.x + folderStart.width * .75,
    y: folderStart.y + folderStart.height / 2
  };

  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  await expect(folder).not.toHaveClass(/is-dragging/);
  await page.mouse.move(pointer.x + 6, pointer.y);
  await expect(folder).toHaveClass(/is-dragging/);
  await page.mouse.move(pointer.x + cellWidth, pointer.y, { steps: 8 });
  await expect(folder).not.toHaveClass(/is-invalid/);
  await expect.poll(async () => (await visibleBox(folder)).x)
    .toBeCloseTo(folderStart.x + cellWidth, 0);
  await expect.poll(async () => (await visibleBox(testBookmark)).x)
    .toBeCloseTo(folderStart.x, 0);
  const relocated = await visibleBox(testBookmark);
  expect(relocated.x + relocated.width)
    .toBeLessThanOrEqual((await visibleBox(folder))?.x);

  await page.mouse.move(
    pointer.x + cellWidth * 2,
    pointer.y,
    { steps: 8 }
  );
  await expect.poll(async () => (await visibleBox(testBookmark)).x)
    .toBeCloseTo(relocated.x, 0);
  await expect.poll(async () => (await visibleBox(testBookmark)).y)
    .toBeCloseTo(relocated.y, 0);

  await page.mouse.move(
    pointer.x + cellWidth * 2,
    pointer.y + cellHeight,
    { steps: 8 }
  );
  await expect.poll(async () => (await visibleBox(testBookmark)).x)
    .toBeCloseTo(bookmarkStart.x, 0);
  await expect.poll(async () => (await visibleBox(testBookmark)).y)
    .toBeCloseTo(bookmarkStart.y, 0);
  await page.mouse.up();
});

test('resizes one cell on handle click and ignores blocked directions', async ({ page }) => {
  await enableEditMode(page);
  const grid = page.locator('#bookmark-container');
  const bookmark = page.locator('.bookmark[data-bookmark-id]').nth(1);
  const gridBox = await visibleBox(grid);
  const initialBox = await visibleBox(bookmark);
  const cellWidth = gridBox.width / 12;
  const cellHeight = gridBox.height / 6;

  await bookmark.locator('.resizer.bottom-right').click();
  await expect.poll(async () => (await visibleBox(bookmark)).width)
    .toBeCloseTo(initialBox.width + cellWidth, 0);
  await expect.poll(async () => (await visibleBox(bookmark)).height)
    .toBeCloseTo(initialBox.height + cellHeight, 0);

  const grownBox = await visibleBox(bookmark);
  await bookmark.locator('.resizer.left').click();
  await expect.poll(async () => (await visibleBox(bookmark)).x)
    .toBeCloseTo(grownBox.x, 0);
  await expect.poll(async () => (await visibleBox(bookmark)).width)
    .toBeCloseTo(grownBox.width, 0);

  await reloadSavedPage(page);
  await expect.poll(async () => (await visibleBox(bookmark)).width)
    .toBeCloseTo(grownBox.width, 0);
  await expect.poll(async () => (await visibleBox(bookmark)).height)
    .toBeCloseTo(grownBox.height, 0);
});

test('shrinks width and height one cell with Shift plus resize click', async ({ page }) => {
  await enableEditMode(page);
  const bookmark = page.locator('.bookmark[data-bookmark-id]').nth(1);
  const gridBox = await visibleBox(page.locator('#bookmark-container'));
  const cellWidth = gridBox.width / 12;
  const cellHeight = gridBox.height / 6;
  const initialBox = await visibleBox(bookmark);

  await bookmark.locator('.resizer.bottom-right').click();
  await expect.poll(async () => (await visibleBox(bookmark)).width)
    .toBeCloseTo(initialBox.width + cellWidth, 0);
  await expect.poll(async () => (await visibleBox(bookmark)).height)
    .toBeCloseTo(initialBox.height + cellHeight, 0);

  await bookmark.locator('.resizer.right').click({ modifiers: ['Shift'] });
  await expect.poll(async () => (await visibleBox(bookmark)).width)
    .toBeCloseTo(initialBox.width, 0);
  await expect.poll(async () => (await visibleBox(bookmark)).height)
    .toBeCloseTo(initialBox.height + cellHeight, 0);

  await bookmark.locator('.resizer.bottom').click({ modifiers: ['Shift'] });
  await expect.poll(async () => (await visibleBox(bookmark)).width)
    .toBeCloseTo(initialBox.width, 0);
  await expect.poll(async () => (await visibleBox(bookmark)).height)
    .toBeCloseTo(initialBox.height, 0);

  await bookmark.locator('.resizer.top-left').click({ modifiers: ['Shift'] });
  await expect.poll(async () => (await visibleBox(bookmark)).width)
    .toBeCloseTo(initialBox.width, 0);
  await expect.poll(async () => (await visibleBox(bookmark)).height)
    .toBeCloseTo(initialBox.height, 0);
});

test('resizes smoothly from corners, snaps to the grid and rejects collisions', async ({ page }) => {
  await enableEditMode(page);
  const grid = page.locator('#bookmark-container');
  const bookmark = page.locator('.bookmark[data-bookmark-id]').nth(1);
  const indicator = bookmark.locator('.resize-indicator');
  const gridBox = await visibleBox(grid);
  const initialBox = await visibleBox(bookmark);
  const cellWidth = gridBox.width / 12;
  const cellHeight = gridBox.height / 6;

  const cornerHandle = bookmark.locator('.resizer.top-left');
  const cornerDecoration = await cornerHandle.evaluate((handle) => {
    const handleStyle = getComputedStyle(handle);
    const decoration = getComputedStyle(handle, '::before');
    return {
      background: handleStyle.backgroundColor,
      inset: { top: handleStyle.top, left: handleStyle.left },
      size: { width: handleStyle.width, height: handleStyle.height },
      top: decoration.borderTopWidth,
      right: decoration.borderRightWidth,
      bottom: decoration.borderBottomWidth,
      left: decoration.borderLeftWidth
    };
  });
  expect(cornerDecoration).toEqual({
    background: 'rgba(15, 23, 42, 0.88)',
    inset: { top: '-5px', left: '-5px' },
    size: { width: '14px', height: '14px' },
    top: '2px',
    right: '0px',
    bottom: '0px',
    left: '2px'
  });

  const sideDecoration = await bookmark.locator('.resizer.left').evaluate((handle) => {
    const handleStyle = getComputedStyle(handle);
    const decoration = getComputedStyle(handle, '::before');
    return {
      background: handleStyle.backgroundColor,
      size: { width: handleStyle.width, height: handleStyle.height },
      mark: { width: decoration.width, background: decoration.backgroundColor }
    };
  });
  expect(sideDecoration).toEqual({
    background: cornerDecoration.background,
    size: { width: '10px', height: '22px' },
    mark: { width: '2px', background: 'rgb(248, 250, 252)' }
  });

  const neighboringCorner = page.locator('.bookmark[data-bookmark-id]').first()
    .locator('.resizer.top-right');
  const neighboringSide = page.locator('.bookmark[data-bookmark-id]').first()
    .locator('.resizer.right');
  const [leftCornerBox, rightCornerBox, leftSideBox, rightSideBox, editBox] = await Promise.all([
    neighboringCorner.boundingBox(),
    cornerHandle.boundingBox(),
    neighboringSide.boundingBox(),
    bookmark.locator('.resizer.left').boundingBox(),
    bookmark.getByRole('button', { name: 'Edit bookmark' }).boundingBox()
  ]);
  expect(Math.abs(leftCornerBox.x + leftCornerBox.width - rightCornerBox.x)).toBeLessThan(1);
  expect(Math.abs(leftSideBox.x + leftSideBox.width - rightSideBox.x)).toBeLessThan(1);
  expect(rightCornerBox.x + rightCornerBox.width).toBeLessThan(editBox.x);

  const firstBookmark = page.locator('.bookmark[data-bookmark-id]').first();
  const firstInitialBox = await visibleBox(firstBookmark);
  const invalidAfterValidHandle = await firstBookmark
    .locator('.resizer.bottom-right')
    .boundingBox();
  const invalidAfterValidStart = {
    x: invalidAfterValidHandle.x + invalidAfterValidHandle.width / 2,
    y: invalidAfterValidHandle.y + invalidAfterValidHandle.height / 2
  };
  await page.mouse.move(invalidAfterValidStart.x, invalidAfterValidStart.y);
  await page.mouse.down();
  await page.mouse.move(
    invalidAfterValidStart.x,
    invalidAfterValidStart.y + cellHeight * .8,
    { steps: 5 }
  );
  await expect(firstBookmark.locator('.resize-indicator')).toHaveText('1 × 2');
  await expect(firstBookmark).not.toHaveClass(/is-invalid/);
  await page.mouse.move(
    invalidAfterValidStart.x + cellWidth * .8,
    invalidAfterValidStart.y + cellHeight * .8,
    { steps: 5 }
  );
  await expect(firstBookmark).toHaveClass(/is-invalid/);
  await page.mouse.up();

  const firstRevertedBox = await visibleBox(firstBookmark);
  expect(Math.abs(firstRevertedBox.width - firstInitialBox.width)).toBeLessThan(2);
  expect(Math.abs(firstRevertedBox.height - firstInitialBox.height)).toBeLessThan(2);

  const blockedHandleBox = await visibleBox(bookmark.locator('.resizer.bottom-left'));
  const blockedStart = {
    x: blockedHandleBox.x + blockedHandleBox.width / 2,
    y: blockedHandleBox.y + blockedHandleBox.height / 2
  };
  await page.mouse.move(blockedStart.x, blockedStart.y);
  await page.mouse.down();
  await page.mouse.move(
    blockedStart.x - cellWidth * .7,
    blockedStart.y + cellHeight * .7,
    { steps: 8 }
  );
  await expect(bookmark).toHaveClass(/is-invalid/);
  await expect(indicator).toHaveText('2 × 2');
  await page.mouse.up();

  await expect(bookmark).not.toHaveClass(/is-invalid/);
  const revertedBox = await visibleBox(bookmark);
  expect(Math.abs(revertedBox.width - initialBox.width)).toBeLessThan(2);
  expect(Math.abs(revertedBox.height - initialBox.height)).toBeLessThan(2);

  const resizeHandleBox = await visibleBox(bookmark.locator('.resizer.bottom-right'));
  const resizeStart = {
    x: resizeHandleBox.x + resizeHandleBox.width / 2,
    y: resizeHandleBox.y + resizeHandleBox.height / 2
  };
  await page.mouse.move(resizeStart.x, resizeStart.y);
  await page.mouse.down();
  await page.mouse.move(
    resizeStart.x + cellWidth * .35,
    resizeStart.y + cellHeight * .35,
    { steps: 5 }
  );
  await page.waitForTimeout(50);

  const continuousBox = await visibleBox(bookmark);
  expect(continuousBox.width).toBeGreaterThan(initialBox.width + cellWidth * .25);
  expect(continuousBox.width).toBeLessThan(initialBox.width + cellWidth * .5);
  await expect(indicator).toHaveText('1 × 1');

  await page.mouse.move(
    resizeStart.x + cellWidth * .8,
    resizeStart.y + cellHeight * .8,
    { steps: 7 }
  );
  await expect(indicator).toHaveText('2 × 2');
  await expect(bookmark).not.toHaveClass(/is-invalid/);
  await page.mouse.up();

  const resizedBox = await visibleBox(bookmark);
  expect(resizedBox.width).toBeGreaterThan(initialBox.width + cellWidth * .9);
  expect(resizedBox.height).toBeGreaterThan(initialBox.height + cellHeight * .9);

  await reloadSavedPage(page);
  await expect(page.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();
  const persistedBox = await visibleBox(page.locator('.bookmark[data-bookmark-id]').nth(1));
  expect(Math.abs(persistedBox.width - resizedBox.width)).toBeLessThan(2);
  expect(Math.abs(persistedBox.height - resizedBox.height)).toBeLessThan(2);
});

test('creates, edits and persists a bookmark after reload', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-bookmark').click();
  await expect(page.locator('#bookmark-modal-form-name')).toBeFocused();
  await page.locator('#bookmark-modal-form-name').fill('OpenAI');
  await page.locator('#bookmark-modal-form-url').fill('openai.com');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByRole('link', { name: /OpenAI/ })).toHaveAttribute('href', 'https://openai.com');
  await reloadSavedPage(page);
  await expect(page.getByRole('link', { name: /OpenAI/ })).toBeVisible();

  await enableEditMode(page);
  const newBookmark = page.locator('#bookmark-container > .bookmark').last();
  await newBookmark.getByRole('button', { name: 'Edit bookmark' }).click();
  await page.locator('#bookmark-modal-form-name').fill('OpenAI Docs');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('link', { name: /OpenAI Docs/ })).toBeVisible();
});

test('expands and collapses compact bookmark creation without losing the draft', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-bookmark').click();
  await expect(page.locator('#bookmark-modal-form-name')).toBeFocused();

  const modal = page.locator('#edit-bookmark-modal');
  const card = modal.locator('.modal-card');
  const tabs = modal.locator('.edit-bookmark-modal-tabs');
  const preview = modal.locator('.edit-bookmark-modal-preview-panel');
  const expand = modal.getByRole('button', { name: '⚙ Advanced options' });

  await expect(modal).toHaveClass(/is-add-compact/);
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(tabs).toHaveCSS('opacity', '0');
  await expect(tabs).toHaveCSS('visibility', 'hidden');
  await expect(tabs).toHaveAttribute('aria-hidden', 'true');
  await expect(preview).toHaveCSS('opacity', '0');
  await expect(preview).toHaveCSS('visibility', 'hidden');
  await expect(preview).toHaveAttribute('aria-hidden', 'true');
  await expect(card).toHaveCSS('width', '420px');
  expect(await card.evaluate(element => getComputedStyle(element).transitionProperty))
    .toContain('width');

  await page.locator('#bookmark-modal-form-name').fill('Animated draft');
  await page.locator('#bookmark-modal-form-url').fill('animated.example');
  await expand.click();

  await expect(modal).not.toHaveClass(/is-add-compact/);
  const collapse = modal.getByRole('button', { name: '▴ Compact view' });
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await expect(tabs).toHaveCSS('opacity', '1');
  await expect(tabs).toHaveCSS('visibility', 'visible');
  await expect(tabs).not.toHaveAttribute('aria-hidden');
  await expect(preview).toHaveCSS('opacity', '1');
  await expect(preview).toHaveCSS('visibility', 'visible');
  await expect(preview).not.toHaveAttribute('aria-hidden');
  await expect.poll(async () => (await visibleBox(card)).width)
    .toBeGreaterThan(670);
  await expect(page.locator('#bookmark-modal-form-name')).toBeFocused();
  await expect(page.locator('#bookmark-modal-form-name')).toHaveValue('Animated draft');
  await expect(page.locator('#bookmark-modal-form-url')).toHaveValue('animated.example');

  await collapse.click();
  await expect(modal).toHaveClass(/is-add-compact/);
  await expect(card).toHaveCSS('width', '420px');
  await expect(page.locator('#bookmark-modal-form-name')).toBeFocused();
  await expect(page.locator('#bookmark-modal-form-name')).toHaveValue('Animated draft');
  await expect(page.locator('#bookmark-modal-form-url')).toHaveValue('animated.example');
});

test('expands compact folder creation and persists its advanced appearance', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();

  const modal = page.locator('#edit-folder-modal');
  const card = modal.locator('.modal-card');
  const tabs = modal.locator('.edit-bookmark-modal-tabs');
  const preview = modal.locator('.edit-bookmark-modal-preview-panel');
  const name = page.locator('#folder-editor-name');
  const add = modal.getByRole('button', { name: 'Add', exact: true });

  await expect(modal.getByRole('heading')).toHaveText('➕ Add new folder');
  await expect(modal).toHaveClass(/is-add-compact/);
  await expect(name).toBeFocused();
  await expect(add).toBeDisabled();
  await expect(card).toHaveCSS('width', '420px');
  await expect(card).toHaveCSS('height', '270px');
  await expect(tabs).toHaveAttribute('aria-hidden', 'true');
  await expect(preview).toHaveAttribute('aria-hidden', 'true');

  await name.fill('Styled folder');
  await expect(add).toBeEnabled();
  await modal.getByRole('button', { name: '⚙ Advanced options' }).click();
  await expect(modal).not.toHaveClass(/is-add-compact/);
  await expect(tabs).not.toHaveAttribute('aria-hidden');
  await expect(preview).not.toHaveAttribute('aria-hidden');

  await modal.getByRole('tab', { name: 'Style' }).click();
  await page.locator('#folder-editor-color').fill('#ef4444');
  await expect(page.locator('.edit-item-modal-preview > .folder-editor-preview-card'))
    .toHaveCSS('--folder-color', '#ef4444');
  await modal.getByRole('button', { name: '▴ Compact view' }).click();
  await expect(modal).toHaveClass(/is-add-compact/);
  await expect(name).toHaveValue('Styled folder');
  await add.click();

  await expect(modal).toBeHidden();
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    const folder = getState().data.folders.find(item => item.name === 'Styled folder');
    return folder?.backgroundColor;
  })).toBe('#ef4444');
});

test('closes an untouched bookmark draft without confirmation', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-bookmark').click();
  await expect(page.locator('#bookmark-modal-form-name')).toBeFocused();

  const editor = page.locator('#edit-bookmark-modal');
  const alert = page.locator('#alert-modal');
  await editor.getByRole('button', { name: 'Cancel' }).click();

  await expect(editor).toBeHidden();
  await expect(alert).toBeHidden();

  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-bookmark').click();
  await expect(page.locator('#bookmark-modal-form-name')).toBeFocused();
  await page.locator('#bookmark-modal-form-name').fill('Unsaved draft');
  await editor.getByRole('button', { name: 'Cancel' }).click();

  await expect(alert).toBeVisible();
  await expect(page.locator('#alert-modal-title')).toHaveText('Discard new bookmark?');
  await alert.getByRole('button', { name: 'Accept' }).click();
  await expect(editor).toBeHidden();
});

test('keeps bookmark editor actions inside the modal on content-heavy tabs', async ({ page }) => {
  await page.setViewportSize({ width: 822, height: 525 });
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-bookmark').click();
  await expect(page.locator('#bookmark-modal-form-name')).toBeFocused();

  const modal = page.locator('#edit-bookmark-modal .modal-card');
  await page.getByRole('button', { name: '⚙ Advanced options' }).click();
  await modal.getByRole('tab', { name: 'Style' }).click();

  const cardBox = await visibleBox(modal);
  const actionsBox = await visibleBox(modal.locator('.modal-actions'));

  expect(actionsBox.y + actionsBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
  expect(actionsBox.x).toBeGreaterThanOrEqual(cardBox.x);
  expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
});

test('creates a workspace and finds bookmarks across workspaces', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Workspace controls' }).hover();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByPlaceholder('Work, leisure…').fill('Work');
  await page.getByRole('button', { name: 'Accept' }).click();  await waitForSaved(page);
  await expect(page.locator('#workspace-select')).toHaveValue(/.+/);

  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-bookmark').click();
  await expect(page.locator('#bookmark-modal-form-name')).toBeFocused();
  await page.locator('#bookmark-modal-form-name').fill('Work dashboard');
  await page.locator('#bookmark-modal-form-url').fill('work.example');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await page.getByRole('navigation', { name: 'Workspace controls' }).hover();
  await page.getByRole('button', { name: 'Search bookmarks' }).click();
  await page.getByPlaceholder('Name or URL').fill('Work dashboard');
  await expect(page.getByRole('option', { name: /Work dashboard/ })).toContainText('Work');
});

test('cycles workspaces with Alt plus arrow keys and animates the grid', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Workspace controls' }).hover();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByPlaceholder('Work, leisure…').fill('Work');
  await page.getByRole('button', { name: 'Accept' }).click();  await waitForSaved(page);

  const workspace = page.locator('#workspace-select');
  const workId = await workspace.inputValue();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(workspace).toHaveValue('');
  await expect(page.locator('.flash-message').last()).toHaveText('Workspace: Main');
  await expect(page.locator('#bookmark-container')).not.toHaveClass(/is-switching-workspace/);

  await page.keyboard.press('Alt+ArrowDown');
  await expect(workspace).toHaveValue(workId);
  await expect(page.locator('.flash-message').last()).toHaveText('Workspace: Work');
  await expect(page.locator('#bookmark-container')).not.toHaveClass(/is-switching-workspace/);
});

test('warns before deleting a workspace and removes its bookmarks', async ({ page }) => {
  const workspaceDock = page.getByRole('navigation', { name: 'Workspace controls' });

  await workspaceDock.hover();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByPlaceholder('Work, leisure…').fill('Temporary');
  await page.getByRole('button', { name: 'Accept' }).click();  await waitForSaved(page);

  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-bookmark').click();
  await expect(page.locator('#bookmark-modal-form-name')).toBeFocused();
  await page.locator('#bookmark-modal-form-name').fill('Temporary bookmark');
  await page.locator('#bookmark-modal-form-url').fill('temporary.example');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await workspaceDock.hover();
  await page.getByRole('button', { name: 'Delete workspace' }).click();
  await expect(page.getByRole('heading', { name: /Delete “Temporary”/ }))
    .toContainText('move them to Main or another workspace first');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('link', { name: /Temporary bookmark/ })).toBeVisible();

  await workspaceDock.hover();
  await page.getByRole('button', { name: 'Delete workspace' }).click();
  await page.getByRole('button', { name: 'Accept' }).click();  await waitForSaved(page);

  await expect(page.locator('#workspace-select')).toHaveValue('');
  await expect(page.getByRole('link', { name: /Temporary bookmark/ })).toHaveCount(0);
});

test('optionally deletes folders when deleting all bookmarks', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Keep until selected');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await waitForSaved(page);

  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  const deleteAll = page.getByRole('button', { name: 'Delete all bookmarks' });

  await deleteAll.click();
  const checkbox = page.getByRole('checkbox', { name: 'Also delete all folders' });
  await expect(page.getByRole('heading', { name: 'Delete all bookmarks?' })).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#settings-modal')).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return {
      bookmarks: getState().data.bookmarks.length,
      folders: getState().data.folders.length
    };
  })).toEqual({ bookmarks: 2, folders: 1 });

  await deleteAll.click();
  await expect(checkbox).not.toBeChecked();
  await page.getByRole('button', { name: 'Accept' }).click();
  await waitForSaved(page);
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return {
      bookmarks: getState().data.bookmarks.length,
      folders: getState().data.folders.length
    };
  })).toEqual({ bookmarks: 0, folders: 1 });

  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await deleteAll.click();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await page.getByRole('button', { name: 'Accept' }).click();
  await waitForSaved(page);
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return {
      bookmarks: getState().data.bookmarks.length,
      folders: getState().data.folders.length
    };
  })).toEqual({ bookmarks: 0, folders: 0 });
  await expect(page.getByText('All bookmarks and folders deleted')).toBeVisible();
});

test('saves a named appearance preset', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeHidden();
  await page.getByRole('textbox', { name: 'Preset name' }).fill('Dark');
  await page.getByRole('button', { name: 'Save preset' }).click();
  await expect(page.getByRole('combobox', { name: 'Saved presets' })).toHaveValue(/.+/);
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Saved presets' })).toContainText('Dark');
});

test('configures the default bookmark through the shared preset editor', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();

  await expect(page.locator('#settings-modal-tab-bookmark .default-bookmark-settings')).toBeVisible();
  await expect(page.locator('.default-bookmark-settings + #settings-bookmark-reset')).toBeVisible();
  await expect(page.locator('#settings-modal-tab-bookmark .bookmark-drag-settings')).toBeVisible();
  await expect(page.locator('#settings-bookmark-form-host')).toHaveCount(0);
  await page.getByRole('button', { name: 'Configure default bookmark' }).click();

  const editor = page.locator('#edit-bookmark-modal');
  await expect(editor.getByRole('heading', { name: 'Default bookmark appearance' })).toBeVisible();
  await expect(editor.getByRole('tab', { name: 'General' })).toHaveCount(0);
  await expect(editor.getByRole('tab', { name: 'Style' })).toHaveAttribute('aria-selected', 'true');
  await expect(editor.locator('.bookmark-preview .bookmark-title')).toHaveText('Default bookmark');
  await expect(editor.locator('.bookmark-preview .bookmark-favicon-image'))
    .toHaveAttribute('src', /assets\/icons\/icon-128\.png$/);

  await editor.getByRole('checkbox', { name: 'No background' }).uncheck();
  await editor.locator('#bookmark-modal-form-backgroundColor').fill('#123456');
  await editor.getByRole('button', { name: 'Apply' }).click();

  await expect(editor).toBeHidden();
  await expect(page.locator('#settings-modal-save')).toBeHidden();
  await waitForSaved(page);

  await page.getByRole('button', { name: 'Configure default bookmark' }).click();
  await expect(editor.locator('#bookmark-modal-form-backgroundColor')).toHaveValue('#123456');
  await editor.getByRole('button', { name: 'Cancel' }).click();
  await page.keyboard.press('Escape');

  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await page.getByRole('button', { name: 'Configure default bookmark' }).click();
  await expect(editor.locator('#bookmark-modal-form-backgroundColor')).toHaveValue('#123456');
});

test('persists the synchronized storage choice', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Sync' }).click();
  await page.getByRole('radio', { name: /Synced/ }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Sync' }).click();
  await expect(page.getByRole('radio', { name: /Synced/ })).toBeChecked();
});

test('shows selected storage and local storage availability when sync is selected', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Sync' }).click();

  const usage = page.locator('[data-storage-usage-active]');
  const localUsage = page.locator('[data-storage-usage-local]');
  const summary = page.locator('#storage-usage-summary');
  const formatToggle = page.locator('#storage-usage-format-toggle');
  const usageDisclosure = page.locator('details.storage-usage');
  await expect(usageDisclosure).not.toHaveAttribute('open', '');
  await expect(usage).toBeHidden();
  await expect(formatToggle).toBeHidden();
  await usageDisclosure.locator('summary').click();
  await expect(usageDisclosure).toHaveAttribute('open', '');
  await expect(usage).toBeVisible();
  const exactLocalUsage = await page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getStorageUsage('local'));
  await expect(usage).toHaveAttribute('data-storage-usage', 'local');
  await expect(localUsage).toBeHidden();
  await expect(page.locator('#storage-usage-mode')).toHaveText('Local');
  await expect(page.locator('#storage-sync-last-updated'))
    .toHaveText('No synchronized NewDeskTab data is stored.');
  await expect(page.locator('#storage-persistence-indicator')).toBeHidden();
  await expect(page.locator('#storage-sync-help')).toBeHidden();
  await expect(formatToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(formatToggle).toHaveText('Show exact bytes');
  await expect(summary).toContainText('of 10 MiB');
  await expect(summary).toContainText('%');
  await expect(page.locator('#storage-usage-available')).toContainText('available');
  await expect(summary).toContainText('KiB of 10 MiB');
  await formatToggle.click();
  await expect(formatToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(formatToggle).toHaveText('Show readable sizes');
  await expect(summary).toContainText(
    `${exactLocalUsage.usedBytes.toLocaleString('en')} B of 10,485,760 B`
  );
  await expect(page.locator('#storage-usage-available')).toContainText(
    `${exactLocalUsage.availableBytes.toLocaleString('en')} B available`
  );
  await formatToggle.click();
  const legend = page.locator('#storage-usage-legend');
  await expect(legend).toContainText('System and metadata');
  await expect(legend).toContainText('Bookmarks');
  await expect(legend).toContainText('Recycle bin data');
  await expect(page.locator('#storage-usage-system')).not.toHaveText('—');
  await expect(page.locator('#storage-usage-bookmarks')).not.toHaveText('—');
  await expect(page.locator('[data-storage-segment="bookmarks"]'))
    .not.toHaveAttribute('style', /width: 0%/);
  const activeImages = usage.locator('[data-storage-image-breakdown]');
  await expect(activeImages).toBeVisible();
  await expect(activeImages).toContainText('Local images');
  await expect(activeImages).toContainText('Theme');
  await expect(activeImages).toContainText('Folders');
  await expect(activeImages.locator('[data-storage-image-total]')).toHaveText('0 B');

  await page.getByRole('radio', { name: /Synced/ }).check();
  await expect(usage).toHaveAttribute('data-storage-usage', 'sync');
  await expect(page.locator('#storage-usage-mode')).toHaveText('Synced');
  await expect(summary).toContainText('of 100 KiB');
  await expect(summary).toContainText('%');
  await expect(usage.locator('#storage-usage-progress')).toHaveAttribute('value', /.+/);
  await expect(legend.getByText('Recycle bin data', { exact: true })).toBeHidden();
  await expect(usage.locator('[data-storage-segment="trash"]')).toBeHidden();
  await expect(page.locator('#storage-usage-trash')).toBeHidden();
  await expect(activeImages).toBeHidden();

  await expect(localUsage).toBeVisible();
  await expect(localUsage).toHaveAttribute('data-storage-usage', 'local');
  await expect(localUsage.locator('#storage-usage-local-mode')).toHaveText('Local');
  await expect(localUsage.locator('#storage-usage-local-summary')).toContainText('of 10 MiB');
  await expect(localUsage.locator('#storage-usage-local-available')).toContainText('available');
  await expect(localUsage.locator('#storage-usage-local-system')).not.toHaveText('—');
  await expect(localUsage.locator('#storage-usage-local-synced')).not.toHaveText('—');
  await expect(localUsage.locator('#storage-usage-local-trash')).not.toHaveText('—');
  await expect(localUsage.locator('#storage-usage-local-progress [data-storage-segment="synced"]'))
    .not.toHaveAttribute('style', /width: 0%/);
  await expect(localUsage.locator('#storage-usage-local-progress [data-storage-segment="trash"]'))
    .not.toHaveAttribute('hidden', '');
  await expect(localUsage.locator('[role="progressbar"]')).toHaveCount(1);
  await expect(localUsage.locator('.storage-usage-legend')).toContainText('System and metadata');
  await expect(localUsage.locator('.storage-usage-legend')).toContainText('Local Sync copy');
  await expect(localUsage.locator('.storage-usage-legend')).toContainText('Recycle bin data');
  await expect(localUsage.locator('[data-storage-image-breakdown]')).toBeVisible();
  await expect(localUsage.locator('[data-storage-image-category="bookmarks"]'))
    .toHaveText('0 B');
  await formatToggle.click();
  await expect(summary).toContainText('of 102,400 B');
  await expect(localUsage.locator('#storage-usage-local-summary'))
    .toContainText('of 10,485,760 B');
  await usageDisclosure.locator('summary').click();
  await expect(usageDisclosure).not.toHaveAttribute('open', '');
  await expect(usage).toBeHidden();
  await expect(formatToggle).toBeHidden();
});

test('localizes sync status and confirms synchronized data deletion', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Sync' }).click();
  await page.getByRole('radio', { name: /Synced/ }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Sync' }).click();

  const deleteSyncData = page.getByRole('button', { name: 'Delete synced data' });
  const syncOption = page.locator('label[for="storage-mode-sync"]');
  const syncHelp = page.getByRole('button', { name: 'Synchronization information' });
  const syncTooltip = page.locator('#storage-sync-notice');
  await expect(page.locator('#storage-persistence-indicator'))
    .toHaveAttribute('data-status', 'idle');
  await expect(page.locator('#storage-persistence-indicator')).toBeVisible();
  await expect(syncHelp).toBeVisible();
  await expect(syncTooltip).toBeHidden();
  await syncOption.hover();
  await expect(syncTooltip).toBeHidden();
  await syncHelp.hover();
  await expect(syncTooltip).toBeVisible();
  await expect(syncTooltip).toContainText('Google Chrome syncs NewDeskTab');
  await expect(syncHelp).toHaveAttribute('aria-expanded', 'true');
  expect(await syncTooltip.evaluate(element => element.parentElement.id)).toBe('settings-modal');
  const tooltipBox = await syncTooltip.boundingBox();
  const viewport = page.viewportSize();
  expect(tooltipBox.x).toBeGreaterThanOrEqual(0);
  expect(tooltipBox.y).toBeGreaterThanOrEqual(0);
  expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(viewport.width);
  expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(viewport.height);
  expect(await syncTooltip.evaluate(element => {
    const style = getComputedStyle(element);
    return { overflowX: style.overflowX, overflowY: style.overflowY };
  })).toEqual({ overflowX: 'visible', overflowY: 'visible' });
  expect(await syncTooltip.evaluate(element => {
    const arrow = getComputedStyle(element, '::after');
    return [arrow.borderTopColor, arrow.borderBottomColor]
      .some(color => color !== 'rgba(0, 0, 0, 0)');
  })).toBe(true);

  await syncOption.hover();
  await expect(syncTooltip).toBeHidden();
  await syncHelp.hover();
  await expect(syncTooltip).toBeVisible();
  await syncHelp.click();
  await deleteSyncData.hover();
  await expect(syncTooltip).toBeVisible();
  await syncHelp.click();
  await expect(syncTooltip).toBeHidden();
  await expect(syncHelp).toHaveAttribute('aria-expanded', 'false');
  await syncOption.hover();
  await syncHelp.hover();
  await expect(syncTooltip).toBeVisible();
  await syncOption.hover();
  await expect(syncTooltip).toBeHidden();
  await expect(deleteSyncData).toBeEnabled();
  await expect(page.locator('#storage-sync-last-updated'))
    .toContainText('Last synchronized update:');

  await deleteSyncData.click();
  await expect(page.getByRole('heading', {
    name: /Delete all synchronized NewDeskTab data/
  })).toBeVisible();
  await expect(page.locator('#alert-modal-title')).toContainText(
    'every other device using this cloud data will switch to Local mode'
  );
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(deleteSyncData).toBeEnabled();

  await deleteSyncData.click();
  await page.getByRole('button', { name: 'Accept' }).click();  await waitForSaved(page);

  await expect(page.getByRole('radio', { name: /This device only/ })).toBeChecked();
  await expect(page.locator('#storage-sync-last-updated'))
    .toHaveText('No synchronized NewDeskTab data is stored.');
  await expect(deleteSyncData).toBeDisabled();
  await expect(page.locator('#storage-persistence-indicator')).toBeHidden();
  await expect(syncHelp).toBeHidden();
  await expect.poll(() => page.evaluate(() => (
    Object.keys(JSON.parse(sessionStorage.getItem('newdesktab-test-sync') || '{}')).length
  ))).toBe(0);

  await page.getByRole('button', { name: 'General' }).click();
  await page.locator('#language-select').selectOption('es');
  await page.getByRole('button', { name: 'Sincronización' }).click();
  await expect(page.locator('#storage-persistence-status'))
    .toHaveText('Los datos están listos.');
  await expect(page.getByText('Data is ready.')).toHaveCount(0);
  await expect(page.locator('#storage-usage-format-toggle'))
    .toHaveText('Ver bytes exactos');
});

test('shows local bookmarks and locks sync when cloud data needs a newer version', async ({ page }) => {
  const schemaVersion = await page.evaluate(async () => (
    (await import('/src/platform/storage/schemaVersion.js')).DATA_SCHEMA_VERSION
  ));
  const futureSyncData = {
    schemaVersion: schemaVersion + 1,
    bookmarks: [{
      id: 'future-bookmark',
      name: 'Future cloud bookmark',
      url: 'https://future.example'
    }],
    folders: [],
    settings: { language: 'en' }
  };
  const localData = {
    newdesktabStorageMode: 'sync',
    schemaVersion,
    bookmarks: [{
      id: 'local-bookmark',
      name: 'Available local bookmark',
      url: 'https://local.example'
    }],
    folders: [],
    settings: { language: 'en' }
  };

  await page.evaluate(({ local, synced }) => {
    sessionStorage.setItem('newdesktab-test-local', JSON.stringify(local));
    sessionStorage.setItem('newdesktab-test-sync', JSON.stringify(synced));
  }, { local: localData, synced: futureSyncData });
  await reloadSavedPage(page);

  await expect(page.getByRole('link', { name: /Available local bookmark/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Future cloud bookmark/ })).toHaveCount(0);
  await expect(page.getByText(/Sync was paused because the cloud data/)).toBeVisible();

  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Sync' }).click();

  await expect(page.getByRole('radio', { name: /This device only/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Synced/ })).toBeDisabled();
  await expect(page.locator('#storage-sync-compatibility-notice')).toContainText(
    'Your synchronized data is safe and has not been modified'
  );
  await expect.poll(() => page.evaluate(() => {
    const synced = JSON.parse(sessionStorage.getItem('newdesktab-test-sync') || '{}');
    return `${synced.schemaVersion}:${synced.bookmarks?.[0]?.id}`;
  })).toBe(`${schemaVersion + 1}:future-bookmark`);
});

test('blocks synchronized storage in Brave and explains why', async ({ page }) => {
  await page.goto('/tests/browser-harness.html?browser=brave');
  await expectAppReady(page);
  await page.evaluate(() => sessionStorage.clear());
  await reloadSavedPage(page);
  await expect(page.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();

  await revealSideDock(page);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Sync' }).click();

  await expect(page.getByRole('radio', { name: /This device only/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Synced/ })).toBeDisabled();
  await expect(page.locator('#storage-sync-help')).toBeHidden();
  await expect(page.locator('#storage-sync-unavailable-reason')).toBeVisible();
  await expect(page.locator('#storage-sync-unavailable-reason'))
    .toContainText('Unavailable in Brave');
  await expect(page.locator('#storage-sync-existing-notice')).toBeHidden();
});

test('duplicates from the bulk toolbar and clears selection when edit mode closes', async ({ page }) => {
  await enableEditMode(page);
  const firstBookmark = page.locator('.bookmark[data-bookmark-id]').first();
  const controls = firstBookmark.getByRole('group', { name: 'Bookmark controls' });
  const editBox = await visibleBox(firstBookmark.getByRole('button', { name: 'Edit bookmark' }));
  const bookmarkBox = await visibleBox(firstBookmark);

  await expect(controls).toBeVisible();
  await expect(controls.getByRole('button')).toHaveCount(1);
  await expect(firstBookmark.getByRole('button', { name: 'Duplicate bookmark' })).toHaveCount(0);
  await expect(firstBookmark.getByRole('button', { name: 'Delete bookmark' })).toHaveCount(0);
  expect(editBox.x).toBeGreaterThan(bookmarkBox.x);
  expect(editBox.y).toBeGreaterThan(bookmarkBox.y);

  await firstBookmark.click();
  await page.getByRole('button', { name: 'Duplicate selection' }).click();
  await expect(page.getByRole('link', { name: /DEVELOPED BY \(copy\)/ })).toBeVisible();

  const duplicatedBookmark = page.locator('.bookmark[data-bookmark-id]').last();
  await duplicatedBookmark.click();
  const bulkActions = page.getByRole('toolbar', { name: 'Selected item actions' });
  const workspaceDock = page.getByRole('navigation', { name: 'Workspace controls' });
  await expect(bulkActions).toBeVisible();
  await expect(page.getByText('1 selected')).toBeVisible();

  await workspaceDock.hover();
  await expect.poll(async () => {
    const bulkBox = await visibleBox(bulkActions);
    const dockBox = await visibleBox(workspaceDock);
    return dockBox.y - (bulkBox.y + bulkBox.height);
  }).toBeGreaterThanOrEqual(0);

  await revealSideDock(page);
  await page.getByRole('button', { name: 'Exit edit mode' }).click();
  await expect(bulkActions).toBeHidden();
  await expect(page.locator('.bookmark.is-selected')).toHaveCount(0);
});

test('drags the bulk toolbar within the grid and restores its default position', async ({ page }) => {
  await createBookmark(page, 'Toolbar drag target', 'https://toolbar-drag.test');
  await enableEditMode(page);
  const bookmark = page.locator('.bookmark[data-bookmark-id]').first();
  const toolbar = page.getByRole('toolbar', { name: 'Selected item actions' });
  const count = page.locator('#bulk-selection-count');
  const grid = page.locator('#bookmark-viewport');

  await bookmark.click();
  await expect(toolbar).toBeVisible();
  const defaultBox = await visibleBox(toolbar);
  const gridBox = await visibleBox(grid);

  let countBox = await visibleBox(count);
  await page.mouse.move(countBox.x + countBox.width / 2, countBox.y + countBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gridBox.x - 100, gridBox.y - 100, { steps: 5 });
  await page.mouse.up();

  let draggedBox = await visibleBox(toolbar);
  expect(draggedBox.x).toBeGreaterThanOrEqual(gridBox.x);
  expect(draggedBox.y).toBeGreaterThanOrEqual(gridBox.y);
  expect(draggedBox.y).toBeLessThan(defaultBox.y);
  await expect(toolbar).not.toHaveClass(/is-dragging/);

  countBox = await visibleBox(count);
  await page.mouse.move(countBox.x + countBox.width / 2, countBox.y + countBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gridBox.x + gridBox.width + 100, gridBox.y + gridBox.height + 100, {
    steps: 5
  });
  await page.mouse.up();

  draggedBox = await visibleBox(toolbar);
  expect(draggedBox.x + draggedBox.width).toBeLessThanOrEqual(gridBox.x + gridBox.width + 1);
  expect(draggedBox.y + draggedBox.height).toBeLessThanOrEqual(gridBox.y + gridBox.height + 1);

  await toolbar.getByRole('button', { name: 'Clear selection' }).click();
  await expect(toolbar).toBeHidden();
  await bookmark.click();
  await expect(toolbar).toBeVisible();

  const restoredBox = await visibleBox(toolbar);
  expect(restoredBox.x).toBeCloseTo(defaultBox.x, 0);
  expect(restoredBox.y).toBeCloseTo(defaultBox.y, 0);
});

test('runs every bulk action on a mixed bookmark and folder selection', async ({ page }) => {
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
    const { getState, setState } = await import('/src/state/appStore.js');
    await setState({
      data: {
        bookmarks: [
          {
            ...DEFAULT_BOOKMARK,
            id: 'mixed-bookmark',
            name: 'Mixed bookmark',
            url: 'https://mixed.test',
            gx: 0,
            gy: 0,
            noBackground: false,
            backgroundColor: '#123456'
          },
          {
            ...DEFAULT_BOOKMARK,
            id: 'folder-child',
            name: 'Folder child',
            url: 'https://child.test',
            folderId: 'mixed-folder',
            gx: 0,
            gy: 0
          }
        ],
        folders: [{
          ...DEFAULT_FOLDER_STYLE,
          id: 'mixed-folder',
          name: 'Mixed folder',
          gx: 1,
          gy: 0,
          w: 1,
          h: 1,
          groupId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          backgroundColor: '#654321',
          showFolder: false,
          showPreviews: false
        }],
        settings: {
          ...getState().data.settings,
          showRecycleBin: false,
          bookmarkGroups: [{ id: 'work', name: 'Work' }],
          bookmarkDefault: {
            ...getState().data.settings.bookmarkDefault,
            noBackground: false,
            backgroundColor: '#abcdef'
          }
        }
      }
    });
  });
  await expect(page.locator('[data-folder-id="mixed-folder"]')).toBeVisible();
  await enableEditMode(page);

  const bookmark = page.locator('[data-bookmark-id="mixed-bookmark"]');
  const folder = page.locator('[data-folder-id="mixed-folder"]');
  await expect(folder.getByRole('button', { name: 'Delete folder' })).toHaveCount(0);
  await bookmark.click();
  await folder.click();

  await expect(bookmark).toHaveClass(/is-selected/);
  await expect(folder).toHaveClass(/is-selected/);
  await expect(page.locator('#folder-modal')).toBeHidden();
  const bulkActions = page.getByRole('toolbar', { name: 'Selected item actions' });
  await expect(bulkActions).toContainText('2 selected');
  await bulkActions.getByRole('button', { name: 'Duplicate selection' }).click();

  await expect(page.locator('.bookmark-folder')).toHaveCount(2);
  await expect(page.getByText('Mixed folder (copy)', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    const copy = getState().data.folders.find(item => item.name === 'Mixed folder (copy)');
    return copy
      ? getState().data.bookmarks.filter(item => item.folderId === copy.id).length
      : 0;
  })).toBe(1);

  await bookmark.click();
  await folder.click();
  await bulkActions.getByRole('button', { name: 'Apply default style' }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    const data = getState().data;
    const bookmark = data.bookmarks.find(item => item.id === 'mixed-bookmark');
    const folder = data.folders.find(item => item.id === 'mixed-folder');
    return `${bookmark.backgroundColor}:${folder.backgroundColor}:${folder.showFolder}`;
  })).toBe('#abcdef:#38bdf8:true');

  await bookmark.click();
  await folder.click();
  await page.locator('#bulk-workspace-select').selectOption('work');
  await expect(page.locator('#alert-modal-title')).toHaveText(
    'Move 2 selected items to workspace “Work”?'
  );
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().data.folders.find(item => item.id === 'mixed-folder')?.groupId;
  })).toBeNull();
  await page.locator('#alert-modal-cancel').click();
  await expect(page.locator('#bulk-workspace-select')).toHaveValue('');
  await expect(bookmark).toHaveClass(/is-selected/);
  await expect(folder).toHaveClass(/is-selected/);

  await page.locator('#bulk-workspace-select').selectOption('work');
  await page.locator('#alert-modal-accept').click();
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    const data = getState().data;
    return [
      data.bookmarks.find(item => item.id === 'mixed-bookmark')?.groupId,
      data.bookmarks.find(item => item.id === 'folder-child')?.groupId,
      data.folders.find(item => item.id === 'mixed-folder')?.groupId
    ].join(':');
  })).toBe('work:work:work');

  await chooseWorkspace(page, 'work');
  await expect(bookmark).toBeVisible();
  await bookmark.click();
  await folder.click();
  await bulkActions.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete 2 selected items?' })).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(bookmark).toHaveCount(0);
  await expect(folder).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().data.trash.length;
  })).toBe(2);
});

test('opens every grid item editor with middle click without opening tabs', async ({ page }) => {
  await createBookmark(page, 'Middle click bookmark', 'middle-click.test');
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Middle click folder');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await waitForSaved(page);

  await openClockCreator(page);
  await page.locator('#clock-widget-save').click();

  await enableEditMode(page);
  await page.mouse.move(page.viewportSize().width - 5, page.viewportSize().height / 2);
  await page.locator('#bookmark-container').focus();
  await expect.poll(async () => (await visibleBox(page.locator('#floating-menu'))).x)
    .toBeLessThan(0);
  const bookmark = page.locator('.bookmark[data-bookmark-id]', { hasText: 'Middle click bookmark' });
  const folder = page.locator('.bookmark-folder', { hasText: 'Middle click folder' });
  const recycleBin = page.locator('.recycle-bin[data-recycle-bin-id]');
  const clock = page.locator('.clock-widget[data-widget-type="clock"]');

  await bookmark.click({ button: 'middle' });
  await expect(page.locator('#edit-bookmark-modal')).toBeVisible();
  await page.locator('#edit-bookmark-modal-cancel').click();

  await folder.click({ button: 'middle' });
  await expect(page.locator('#edit-folder-modal')).toBeVisible();
  await page.locator('#edit-folder-modal-cancel').click();

  await recycleBin.click({ button: 'middle' });
  await expect(page.locator('#edit-recycle-bin-modal')).toBeVisible();
  await page.locator('#edit-recycle-bin-modal-cancel').click();

  await clock.click({ button: 'middle' });
  await expect(page.locator('#clock-widget-modal')).toBeVisible();
  await page.locator('#clock-widget-cancel').click();

  await expect(page.locator('.bookmark.is-selected')).toHaveCount(0);
  await expect.poll(() => page.context().pages().length).toBe(1);
});

test('keeps the bookmark base color editable while its image URL is locked', async ({ page }) => {
  await enableEditMode(page);
  const bookmark = page.locator('#bookmark-container > .bookmark[data-bookmark-id]').nth(1);

  await bookmark.getByRole('button', { name: 'Edit bookmark' }).click();

  const editor = page.locator('#edit-bookmark-modal');
  await editor.getByRole('tab', { name: 'Style' }).click();
  const imageUrl = editor.locator('[data-field="backgroundImage"]');
  const imageColor = editor.locator('[data-field="backgroundColor"]');
  const imageLock = editor.locator('[data-field="bgToggle"]');

  await expect(imageUrl).toHaveJSProperty('readOnly', true);
  await expect(imageColor).toBeEnabled();
  await expect(imageColor).toHaveValue('#eeff00');
  await imageLock.click();
  await expect(imageUrl).toHaveJSProperty('readOnly', false);
  await expect(imageColor).toBeEnabled();
  await imageColor.fill('#dc2626');
  await imageLock.click();
  await expect(imageColor).toBeEnabled();
  await editor.getByRole('button', { name: 'Save' }).click();

  await expect(bookmark).toHaveCSS('--color-bg-bookmark', '#dc2626');
  await bookmark.getByRole('button', { name: 'Edit bookmark' }).click();
  await editor.getByRole('tab', { name: 'Style' }).click();
  await expect(editor.locator('[data-field="backgroundColor"]')).toHaveValue('#dc2626');
  await expect(editor.locator('[data-field="backgroundColor"]')).toBeEnabled();
});

test('names a single bookmark before deletion and counts multiple selections', async ({ page }) => {
  await enableEditMode(page);
  const bookmarks = page.locator('#bookmark-container > .bookmark[data-bookmark-id]');
  const deleteSelection = page.getByRole('button', { name: 'Delete', exact: true });

  await bookmarks.nth(0).click();
  await deleteSelection.click();
  await expect(page.getByRole('heading', { name: 'Delete “DEVELOPED BY”?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await bookmarks.nth(1).click();
  await deleteSelection.click();
  await expect(page.getByRole('heading', { name: 'Delete 2 selected items?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('duplicates several selected bookmarks without overlaps', async ({ page }) => {
  await enableEditMode(page);
  const bookmarks = page.locator('.bookmark[data-bookmark-id]');

  await bookmarks.nth(0).click();
  await bookmarks.nth(1).click();
  await expect(page.getByText('2 selected')).toBeVisible();

  await page.getByRole('button', { name: 'Duplicate selection' }).click();

  await expect(bookmarks).toHaveCount(4);
  await expect(page.getByRole('link', { name: /DEVELOPED BY \(copy\)/ })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Selected item actions' })).toBeHidden();

  const boxes = await bookmarks.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }));
  for (let index = 0; index < boxes.length; index += 1) {
    for (let comparison = index + 1; comparison < boxes.length; comparison += 1) {
      const first = boxes[index];
      const second = boxes[comparison];
      const separated = first.right <= second.left || second.right <= first.left
        || first.bottom <= second.top || second.bottom <= first.top;
      expect(separated).toBe(true);
    }
  }
});

test('creates a folder, accepts a dragged bookmark and persists its contents', async ({ page }) => {
  await setBookmarkDragMode(page, 'relocate');
  await createBookmark(page, 'Reading item', 'reading-item.test');
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Reading');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);

  const folder = page.locator('.bookmark-folder', { hasText: 'Reading' });
  await expect(folder).toBeVisible();
  await expect(folder).toContainText('0 saved');

  await enableEditMode(page);
  await expect(folder.getByRole('group', { name: 'Folder controls' })).toBeVisible();
  await expect(folder.getByRole('button', { name: 'Customize folder' })).toBeVisible();
  await expect(folder.getByRole('button', { name: 'Delete folder' })).toHaveCount(0);
  await expect(folder.locator('.bookmark-action-menu, .bookmark-actions')).toHaveCount(0);
  await expect(folder.locator('.resizer')).toHaveCount(8);
  const bookmark = page.locator('.bookmark[data-bookmark-id]', { hasText: 'Reading item' });
  const bookmarkStart = await visibleBox(bookmark);
  const folderStart = await visibleBox(folder);

  await moveGridItemByCells(page, folder, 0, -1);
  await expect.poll(async () => (await visibleBox(bookmark)).y)
    .toBeCloseTo(folderStart.y, 0);
  await expect.poll(async () => (await visibleBox(folder)).y)
    .toBeCloseTo(bookmarkStart.y, 0);

  const bookmarkBox = await visibleBox(bookmark);
  const folderBox = await visibleBox(folder);
  const folderGridPosition = await folder.evaluate(element => ({
    left: element.offsetLeft,
    top: element.offsetTop
  }));

  await page.mouse.move(
    bookmarkBox.x + bookmarkBox.width / 2,
    bookmarkBox.y + bookmarkBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    folderBox.x + folderBox.width / 2,
    folderBox.y + folderBox.height / 2,
    { steps: 8 }
  );
  await expect(folder).toHaveClass(/is-drop-target/);
  await expect(bookmark).toHaveClass(/is-drop-landing/);
  await expect(folder.locator('.folder-drop-feedback', { hasText: 'Drop to add' })).toBeVisible();
  await expect.poll(async () => {
    const source = await bookmark.boundingBox();
    const target = await folder.boundingBox();
    if (!source || !target) return false;
    const center = {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2
    };
    return center.x > target.x
      && center.x < target.x + target.width
      && center.y > target.y
      && center.y < target.y + target.height
      && source.width < target.width * .8
      && source.height < target.height * .8;
  }).toBe(true);
  await expect.poll(() => folder.evaluate(element => element.offsetLeft))
    .toBe(folderGridPosition.left);
  await expect.poll(() => folder.evaluate(element => element.offsetTop))
    .toBe(folderGridPosition.top);
  await bookmark.evaluate(element => {
    window.folderDropElement = element;
  });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => ({
    connected: window.folderDropElement?.isConnected,
    hiddenBeforeRemoval: window.folderDropElement?.classList.contains('is-drop-committed')
  }))).toEqual({ connected: false, hiddenBeforeRemoval: true });
  await expect(bookmark).toHaveCount(0);
  await expect(page.locator('.bookmark-folder')).toContainText('1 saved');
  await expect.poll(() => folder.evaluate(element => element.offsetLeft))
    .toBe(folderGridPosition.left);
  await expect.poll(() => folder.evaluate(element => element.offsetTop))
    .toBe(folderGridPosition.top);

  const gridBox = await visibleBox(page.locator('#bookmark-container'));
  const folderBeforeResize = await visibleBox(folder);
  const bottomHandle = await visibleBox(folder.locator('.resizer.bottom'));
  const resizeStart = {
    x: bottomHandle.x + bottomHandle.width / 2,
    y: bottomHandle.y + bottomHandle.height / 2
  };
  await page.mouse.move(resizeStart.x, resizeStart.y);
  await page.mouse.down();
  await page.mouse.move(
    resizeStart.x,
    resizeStart.y + gridBox.height / 6 * .8,
    { steps: 8 }
  );
  await expect(folder.locator('.resize-indicator')).toHaveText('1 × 2');
  await page.mouse.up();

  const resizedFolderBox = await visibleBox(folder);
  expect(resizedFolderBox.height)
    .toBeGreaterThan(folderBeforeResize.height + gridBox.height / 6 * .9);

  await revealSideDock(page);
  await page.getByRole('button', { name: 'Exit edit mode' }).click();
  await reloadSavedPage(page);

  const persistedFolder = page.locator('.bookmark-folder', { hasText: 'Reading' });
  await expect(persistedFolder).toContainText('1 saved');
  const persistedFolderBox = await visibleBox(persistedFolder);
  expect(Math.abs(persistedFolderBox.height - resizedFolderBox.height)).toBeLessThan(2);
  await persistedFolder.getByRole('button', { name: /Open Reading/ }).click();
  await expect(page.getByRole('heading', { name: 'Reading' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Reading item/ })).toBeVisible();
  const folderGrid = page.getByRole('list', { name: 'Folder bookmarks' });
  await expect(folderGrid).toBeVisible();
  await expect(folderGrid.getByRole('button')).toHaveCount(0);
  await expect(folderGrid.getByRole('link', { name: /Reading item/ }))
    .toHaveCSS('cursor', 'pointer');

  await enableFolderEditMode(page);
  await page.getByRole('button', { name: /Move Reading item out of the folder/ }).click();
  await expect(page.getByText('0 of 18 spaces used')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('link', { name: /Reading item/ })).toBeVisible();
});

test('customizes a folder from its miniature and persists the appearance', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('PokeMMO');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);

  let folder = page.locator('.bookmark-folder', { hasText: 'PokeMMO' });
  await folder.getByRole('button', { name: /Open PokeMMO/ }).click();

  const folderModal = page.locator('#folder-modal');
  const editor = page.locator('#edit-folder-modal');
  const miniature = page.getByRole('button', { name: 'Customize folder' });
  await expect(miniature.locator('.folder-visual')).toBeVisible();
  await miniature.click();

  await expect(editor).toBeVisible();
  await expect(folderModal).toBeVisible();
  await page.locator('#folder-editor-name').fill('Games');
  await page.getByRole('tab', { name: 'Style' }).click();
  await page.locator('#edit-folder-modal .editor-image-section summary').click();
  const imageInput = page.locator('#folder-editor-image');
  const imageLock = page.getByRole('button', { name: 'Lock or unlock image URL' });
  const imageCopy = page.getByRole('button', { name: 'Copy image URL' });
  const imageClear = page.getByRole('button', { name: 'Clear image URL' });
  await expect(imageLock).toBeHidden();
  await expect(imageCopy).toBeHidden();
  await expect(imageClear).toBeHidden();

  await imageInput.fill('https://images.test/folder.png');
  await page.locator('#folder-editor-color').fill('#ef4444');
  await expect(imageLock).toBeVisible();
  await expect(imageLock).toHaveText('🔓');
  await expect(imageCopy).toBeVisible();
  await expect(imageClear).toBeVisible();
  await imageLock.click();
  await expect(imageInput).toHaveJSProperty('readOnly', true);
  await expect(page.locator('#folder-editor-color')).toBeEnabled();
  await expect(imageLock).toHaveText('🔒');
  await expect(imageCopy).toBeVisible();
  await expect(imageClear).toBeHidden();

  await imageLock.click();
  await expect(imageInput).toHaveJSProperty('readOnly', false);
  await expect(page.locator('#folder-editor-color')).toBeEnabled();
  await expect(imageClear).toBeVisible();
  await imageClear.click();
  await expect(imageInput).toHaveValue('');
  await expect(imageLock).toBeHidden();
  await expect(imageCopy).toBeHidden();
  await expect(imageClear).toBeHidden();

  await imageInput.fill('https://images.test/folder.png');
  await imageLock.click();
  await expect(page.locator('#folder-editor-color')).toBeEnabled();
  await page.getByRole('tab', { name: 'Style' }).click();
  await page.locator('#folder-editor-text-color').fill('#fef3c7');
  await expect(page.locator('.edit-item-modal-preview > .folder-editor-preview-card')).toContainText('Games');
  await page.locator('#edit-folder-modal-save').click();

  await expect(editor).toBeHidden();
  await expect(folderModal).toBeVisible();
  await expect(page.locator('#folder-modal-title')).toHaveText('Games');
  await expect(miniature).toHaveCSS('--folder-color', '#ef4444');
  await page.locator('#folder-modal-close').click();

  folder = page.locator('.bookmark-folder', { hasText: 'Games' });
  await expect(folder).toHaveCSS('--folder-color', '#ef4444');
  await expect(folder).toHaveCSS('--folder-text-color', '#fef3c7');
  await expect(folder).toHaveClass(/has-folder-bg-image/);
  await expect(folder.locator('.folder-svg pattern image'))
    .toHaveAttribute('href', 'https://images.test/folder.png');

  await reloadSavedPage(page);
  folder = page.locator('.bookmark-folder', { hasText: 'Games' });
  await expect(folder).toBeVisible();
  await expect(folder).toHaveCSS('--folder-color', '#ef4444');
  await expect(folder.locator('.folder-svg pattern image'))
    .toHaveAttribute('href', 'https://images.test/folder.png');
  await folder.getByRole('button', { name: /Open Games/ }).click();
  await page.getByRole('button', { name: 'Customize folder' }).click();
  await page.getByRole('tab', { name: 'Style' }).click();
  await expect(page.locator('#folder-editor-image')).toHaveJSProperty('readOnly', true);
  await expect(page.getByRole('button', { name: 'Lock or unlock image URL' }))
    .toHaveText('🔒');
  await expect(page.getByRole('button', { name: 'Clear image URL' })).toBeHidden();

  const noBackground = page.locator('#folder-editor-no-background');
  await expect(noBackground).not.toBeChecked();
  await noBackground.check();
  await expect(page.locator('#folder-editor-color')).toBeDisabled();
  await expect(page.locator('.edit-item-modal-preview > .folder-editor-preview-card .folder-visual'))
    .toHaveClass(/is-folder-transparent/);
  await expect(page.locator('.edit-item-modal-preview > .folder-editor-preview-card .folder-visual'))
    .toHaveClass(/has-folder-bg-image/);
  await page.locator('#edit-folder-modal-save').click();

  await expect(editor).toBeHidden();
  await page.locator('#folder-modal-close').click();
  folder = page.locator('.bookmark-folder', { hasText: 'Games' });
  await expect(folder).toHaveClass(/is-folder-transparent/);
  await expect(folder.locator('.folder-body'))
    .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await reloadSavedPage(page);
  folder = page.locator('.bookmark-folder', { hasText: 'Games' });
  await expect(folder).toHaveClass(/is-folder-transparent/);
});

test('scales folder previews and applies one centered tray style', async ({ page }) => {
  await revealSideDock(page);
  for (const name of ['Small previews', 'Large previews', 'Cover previews']) {
    await page.locator('#add-toggle').click();
    await page.locator('#add-folder').click();
    await page.getByPlaceholder('Tools, inspiration…').fill(name);
    await page.getByRole('button', { name: 'Add', exact: true }).click();    await waitForSaved(page);
  }

  await page.evaluate(() => new Promise(resolve => {
    chrome.storage.local.get(null, stored => {
      const layout = {
        'Small previews': { gx: 0, gy: 0, w: 1, h: 1 },
        'Large previews': { gx: 1, gy: 0, w: 4, h: 3 },
        'Cover previews': {
          gx: 5, gy: 0, w: 2, h: 2,
          backgroundImageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Cpath fill="%230f766e" d="M0 0h8v8H0z"/%3E%3C/svg%3E'
        }
      };
      const folders = stored.folders.map(folder => ({
        ...folder,
        ...layout[folder.name]
      }));
      const previewCounts = {
        'Small previews': 4,
        'Large previews': 5,
        'Cover previews': 5
      };
      const bookmarks = folders.flatMap(folder => (
        Array.from({ length: previewCounts[folder.name] }, (_, index) => ({
          id: `${folder.id}-bookmark-${index}`,
          name: `${folder.name} ${index + 1}`,
          url: `https://${folder.id}-${index}.internal`,
          folderId: folder.id,
          groupId: null,
          gx: index,
          gy: 0,
          w: 1,
          h: 1
        }))
      ));
      chrome.storage.local.set({ folders, bookmarks }, resolve);
    });
  }));
  await reloadSavedPage(page);

  const smallIcon = page.locator('.bookmark-folder', { hasText: 'Small previews' })
    .locator('.bookmark-favicon').first();
  const largeIcon = page.locator('.bookmark-folder', { hasText: 'Large previews' })
    .locator('.bookmark-favicon').first();
  const [smallBox, largeBox] = await Promise.all([
    smallIcon.boundingBox(),
    largeIcon.boundingBox()
  ]);
  expect(largeBox.width).toBeGreaterThan(smallBox.width * 2);

  const small = page.locator('.bookmark-folder', { hasText: 'Small previews' });
  await expect(small.locator('.bookmark-favicon')).toHaveCount(4);
  await expect(small.locator('.folder-preview-more')).toHaveCount(0);

  const plain = page.locator('.bookmark-folder', { hasText: 'Large previews' });
  await expect(plain.locator('.bookmark-favicon')).toHaveCount(3);
  const plainRemainder = plain.locator('.folder-preview-more');
  await expect(plainRemainder).toHaveText('+2');
  await expect(plainRemainder).toHaveCSS('place-items', 'center');
  const remainderTypography = await plainRemainder.evaluate(element => ({
    fontSize: parseFloat(getComputedStyle(element).fontSize),
    width: element.getBoundingClientRect().width
  }));
  expect(remainderTypography.fontSize).toBeLessThan(remainderTypography.width * .6);
  const plainItemBoxes = await plain.locator('.folder-previews > *').evaluateAll(elements => (
    elements.map(element => element.getBoundingClientRect().toJSON())
  ));
  expect(plainItemBoxes).toHaveLength(4);
  expect(Math.abs(plainItemBoxes[3].width - plainItemBoxes[0].width)).toBeLessThanOrEqual(1);
  expect(Math.abs(plainItemBoxes[3].height - plainItemBoxes[0].height)).toBeLessThanOrEqual(1);
  expect(Math.max(...plainItemBoxes.map(item => item.top))
    - Math.min(...plainItemBoxes.map(item => item.top))).toBeLessThanOrEqual(1);

  const cover = page.locator('.bookmark-folder', { hasText: 'Cover previews' });
  await expect(cover.locator('.bookmark-favicon')).toHaveCount(3);
  await expect(cover.locator('.folder-preview-more')).toHaveText('+2');
  const trayStyle = locator => locator.locator('.folder-previews').evaluate(element => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      display: style.display,
      gap: style.gap,
      padding: style.padding
    };
  });
  const { backgroundColor: plainBackground, ...plainLayout } = await trayStyle(plain);
  const { backgroundColor: coverBackground, ...coverLayout } = await trayStyle(cover);
  expect(plainLayout).toEqual(coverLayout);
  expect(plainBackground).toBe('rgba(2, 6, 23, 0.48)');
  expect(coverBackground).toBe('rgba(2, 6, 23, 0.32)');
  const trayBox = await visibleBox(cover.locator('.folder-previews'));
  const itemBoxes = await cover.locator('.folder-previews > *').evaluateAll(elements => (
    elements.map(element => element.getBoundingClientRect().toJSON())
  ));
  expect(itemBoxes).toHaveLength(4);
  expect(Math.max(...itemBoxes.map(item => item.top))
    - Math.min(...itemBoxes.map(item => item.top))).toBeLessThanOrEqual(1);
  for (const item of itemBoxes) {
    expect(item.left).toBeGreaterThanOrEqual(trayBox.x);
    expect(item.right).toBeLessThanOrEqual(trayBox.x + trayBox.width);
    expect(item.top).toBeGreaterThanOrEqual(trayBox.y);
    expect(item.bottom).toBeLessThanOrEqual(trayBox.y + trayBox.height);
  }

  await page.setViewportSize({ width: 900, height: 810 });
  await expect(small.locator('.bookmark-favicon:visible')).toHaveCount(1);
  await expect(small.locator('.folder-preview-compact-more')).toHaveText('+3');
  await expect(small.locator('.folder-preview-compact-more')).toBeVisible();
});

test('renders a 6 by 3 folder grid and smoothly persists relocation', async ({ page }) => {
  await setBookmarkDragMode(page, 'relocate');
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Visual grid');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);

  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const folder = stored.folders.find(item => item.name === 'Visual grid');
    Object.assign(stored.bookmarks[0], { folderId: folder.id, gx: 0, gy: 0 });
    Object.assign(stored.bookmarks[1], { folderId: folder.id, gx: 1, gy: 0 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);

  await page.locator('.bookmark-folder', { hasText: 'Visual grid' })
    .getByRole('button', { name: /Open Visual grid/ })
    .click();
  const grid = page.getByRole('list', { name: 'Folder bookmarks' });
  const first = grid.locator('[data-bookmark-id]').nth(0);
  const second = grid.locator('[data-bookmark-id]').nth(1);

  await expect(grid.locator('[data-bookmark-id]')).toHaveCount(2);
  expect(await grid.evaluate(element => (
    getComputedStyle(element).gridTemplateColumns.split(' ').length
  ))).toBe(6);
  expect(await grid.evaluate(element => (
    getComputedStyle(element).gridTemplateRows.split(' ').length
  ))).toBe(3);

  const firstCellAlignment = await first.evaluate(element => {
    const gridElement = element.parentElement;
    const gridStyles = getComputedStyle(gridElement);
    const cellWidth = Number.parseFloat(
      gridStyles.gridTemplateColumns.split(' ')[0]
    );
    return {
      cardWidth: Number.parseFloat(getComputedStyle(element).width),
      cellWidth,
    };
  });
  await expect(first).toHaveCSS('justify-self', 'stretch');
  await expect(first).toHaveCSS('align-self', 'stretch');
  await expect(grid.getByRole('button')).toHaveCount(0);
  await expect(first.getByRole('link')).toHaveCSS('cursor', 'pointer');
  await expect(page.locator('#folder-modal-edit-toggle')).toHaveText('Edit');
  expect(Math.abs(
    firstCellAlignment.cardWidth - firstCellAlignment.cellWidth
  )).toBeLessThan(1);

  await page.keyboard.press('KeyE');
  await expect(page.locator('#folder-modal-edit-toggle')).toHaveText('Finish editing');
  await expect(page.locator('#folder-modal-edit-toggle')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByText('Edit mode enabled')).toBeVisible();
  await expect(grid.getByRole('button')).toHaveCount(6);
  await expect(first.getByRole('link')).toHaveCSS('cursor', 'grab');

  const [editableFirstBox, editableSecondBox] = await Promise.all([
    first.boundingBox(),
    second.boundingBox()
  ]);
  await page.mouse.move(
    editableFirstBox.x + editableFirstBox.width / 2,
    editableFirstBox.y + editableFirstBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    editableSecondBox.x + editableSecondBox.width / 2,
    editableSecondBox.y + editableSecondBox.height / 2,
    { steps: 8 }
  );
  await expect(first).toHaveClass(/is-folder-grid-dragging/);
  await expect(second).toHaveClass(/is-folder-grid-displaced/);
  expect(await first.evaluate(element => (
    Number.parseFloat(element.style.getPropertyValue('--folder-shift-x'))
  ))).toBeGreaterThan(0);
  await expect(first).toHaveCSS(
    'transition-timing-function',
    /cubic-bezier\(0\.22, 1, 0\.36, 1\)/
  );
  await page.mouse.up();

  await expect.poll(() => first.evaluate(element => element.style.gridColumn)).toBe('2');
  await expect.poll(() => second.evaluate(element => element.style.gridColumn)).toBe('1');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#folder-modal-edit-toggle')).toHaveText('Edit');
  await expect(page.getByText('Edit mode disabled')).toBeVisible();
  await expect(grid.getByRole('button')).toHaveCount(0);
  await expect(first.getByRole('link')).toHaveCSS('cursor', 'pointer');
  await page.getByRole('button', { name: 'Close' }).click();
  await reloadSavedPage(page);
  await page.locator('.bookmark-folder', { hasText: 'Visual grid' })
    .getByRole('button', { name: /Open Visual grid/ })
    .click();
  const persisted = page.getByRole('list', { name: 'Folder bookmarks' })
    .locator('[data-bookmark-id]');
  await expect(persisted.nth(0)).toHaveCSS('grid-column-start', '2');
  await expect(persisted.nth(1)).toHaveCSS('grid-column-start', '1');
  await expect(page.getByRole('list', { name: 'Folder bookmarks' })
    .getByRole('button')).toHaveCount(0);
});

test('moves a bookmark back to the workspace when dragged outside its folder', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Drag out');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await waitForSaved(page);

  const bookmarkId = await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const folder = stored.folders.find(item => item.name === 'Drag out');
    const bookmark = stored.bookmarks[0];
    Object.assign(bookmark, { folderId: folder.id, gx: 0, gy: 0 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
    return bookmark.id;
  });
  await reloadSavedPage(page);

  await page.locator('.bookmark-folder', { hasText: 'Drag out' })
    .getByRole('button', { name: /Open Drag out/ })
    .click();
  await enableFolderEditMode(page);

  const grid = page.getByRole('list', { name: 'Folder bookmarks' });
  const item = grid.locator(`[data-bookmark-id="${bookmarkId}"]`);
  const [itemBox, gridBox, modalBox] = await Promise.all([
    visibleBox(item),
    visibleBox(grid),
    visibleBox(page.locator('#folder-modal .modal-folder'))
  ]);
  await page.mouse.move(
    itemBox.x + itemBox.width / 2,
    itemBox.y + itemBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    gridBox.x + gridBox.width * 2.5 / 6,
    gridBox.y + gridBox.height / 6,
    { steps: 8 }
  );

  const shiftedX = await item.evaluate(element => (
    element.style.getPropertyValue('--folder-shift-x')
  ));
  expect(Number.parseFloat(shiftedX)).toBeGreaterThan(0);

  await page.mouse.move(
    modalBox.x + modalBox.width / 2,
    modalBox.y + 8,
    { steps: 8 }
  );
  await expect(item).not.toHaveClass(/is-folder-grid-exiting/);
  await expect.poll(() => item.evaluate(element => (
    element.style.getPropertyValue('--folder-shift-x')
  ))).toBe(shiftedX);

  await page.mouse.move(
    modalBox.x + modalBox.width / 2,
    Math.max(5, modalBox.y - 24),
    { steps: 12 }
  );

  await expect(item).toHaveClass(/is-folder-grid-exiting/);
  await expect(item.locator('.folder-item-remove')).toHaveCSS(
    'background-color',
    'rgb(2, 132, 199)'
  );
  await expect.poll(() => item.evaluate(element => (
    element.style.getPropertyValue('--folder-shift-x')
  ))).toBe(shiftedX);

  await page.mouse.move(
    modalBox.x + modalBox.width / 2,
    modalBox.y + 8,
    { steps: 8 }
  );
  await expect(item).not.toHaveClass(/is-folder-grid-exiting/);
  await expect.poll(() => item.evaluate(element => (
    element.style.getPropertyValue('--folder-shift-x')
  ))).toBe(shiftedX);
  await page.mouse.up();

  await expect(item).toHaveCSS('grid-column-start', '3');
  await expect.poll(() => page.evaluate(id => {
    const stored = JSON.parse(sessionStorage.getItem('newdesktab-test-local'));
    return stored.bookmarks.find(bookmark => bookmark.id === id)?.gx;
  }, bookmarkId)).toBe(2);

  const movedItemBox = await visibleBox(item);
  await page.mouse.move(
    movedItemBox.x + movedItemBox.width / 2,
    movedItemBox.y + movedItemBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    movedItemBox.x + movedItemBox.width / 2,
    Math.max(5, modalBox.y - 24),
    { steps: 12 }
  );
  await expect(item).toHaveClass(/is-folder-grid-exiting/);
  await page.mouse.up();

  await expect(grid.locator('[data-bookmark-id]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(id => {
    const stored = JSON.parse(sessionStorage.getItem('newdesktab-test-local'));
    return stored.bookmarks.find(bookmark => bookmark.id === id)?.folderId ?? null;
  }, bookmarkId)).toBeNull();
  await expect(page.getByText('Bookmark moved back to the grid')).toBeVisible();

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator(
    `#bookmark-container > .bookmark[data-bookmark-id="${bookmarkId}"]`
  )).toBeVisible();
});

test('honors None and Sequence inside a folder', async ({ page }) => {
  await setBookmarkDragMode(page, 'none');
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Drag modes');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);

  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const folder = stored.folders.find(item => item.name === 'Drag modes');
    Object.assign(stored.bookmarks[0], { folderId: folder.id, gx: 0, gy: 0 });
    Object.assign(stored.bookmarks[1], { folderId: folder.id, gx: 1, gy: 0 });
    stored.bookmarks.push({
      ...structuredClone(stored.bookmarks[0]),
      id: 'folder-sequence-third',
      name: 'Third',
      gx: 2,
      gy: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);

  const openFolder = async () => {
    await page.locator('.bookmark-folder', { hasText: 'Drag modes' })
      .getByRole('button', { name: /Open Drag modes/ })
      .click();
  };
  await openFolder();
  await enableFolderEditMode(page);
  let grid = page.getByRole('list', { name: 'Folder bookmarks' });
  let items = grid.locator('[data-bookmark-id]');
  let [firstBox, secondBox] = await Promise.all([
    items.nth(0).boundingBox(),
    items.nth(1).boundingBox()
  ]);

  await page.mouse.move(
    firstBox.x + firstBox.width / 2,
    firstBox.y + firstBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    secondBox.x + secondBox.width / 2,
    secondBox.y + secondBox.height / 2,
    { steps: 8 }
  );
  await expect(items.nth(0)).toHaveClass(/is-folder-grid-invalid/);
  await expect(items.nth(0)).toHaveCSS('opacity', '1');
  await expect(items.nth(0)).toHaveCSS('background-color', 'rgba(69, 10, 10, 0.96)');
  await expect(grid.locator('.is-folder-grid-displaced')).toHaveCount(0);
  expect(await items.nth(0).evaluate(element => (
    element.style.getPropertyValue('--folder-shift-x')
  ))).not.toBe('0px');
  const invalidShift = await items.nth(0).evaluate(element => Number.parseFloat(
    element.style.getPropertyValue('--folder-shift-x')
  ));
  const folderCellWidth = await grid.evaluate(element => element.clientWidth / 6);
  expect(invalidShift).toBeCloseTo(folderCellWidth, 1);
  await page.mouse.up();
  await expect(items.nth(0)).toHaveCSS('grid-column-start', '1');
  await expect(items.nth(1)).toHaveCSS('grid-column-start', '2');
  await expect.poll(() => items.nth(0).evaluate(element => (
    element.style.getPropertyValue('--folder-shift-x')
  ))).toBe('');

  await page.getByRole('button', { name: 'Close' }).click();
  await setBookmarkDragMode(page, 'cascade');
  await openFolder();
  await enableFolderEditMode(page);
  grid = page.getByRole('list', { name: 'Folder bookmarks' });
  items = grid.locator('[data-bookmark-id]');
  const thirdBox = await visibleBox(items.nth(2));
  firstBox = await visibleBox(items.nth(0));

  await page.mouse.move(
    firstBox.x + firstBox.width / 2,
    firstBox.y + firstBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    thirdBox.x + thirdBox.width / 2,
    thirdBox.y + thirdBox.height / 2,
    { steps: 12 }
  );
  await expect(grid.locator('.is-folder-grid-displaced')).toHaveCount(2);
  await page.mouse.up();

  await expect(items.nth(0)).toHaveCSS('grid-column-start', '3');
  await expect(items.nth(1)).toHaveCSS('grid-column-start', '1');
  await expect(items.nth(2)).toHaveCSS('grid-column-start', '2');
});

test('returns to the open folder after escaping, cancelling or saving bookmark edits', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Edit return');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);

  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const folder = stored.folders.find(item => item.name === 'Edit return');
    Object.assign(stored.bookmarks[0], { folderId: folder.id, gx: 0, gy: 0 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);

  await page.locator('.bookmark-folder', { hasText: 'Edit return' })
    .getByRole('button', { name: /Open Edit return/ })
    .click();
  const folderModal = page.locator('#folder-modal');
  const editor = page.locator('#edit-bookmark-modal');

  await enableFolderEditMode(page);
  let edit = folderModal.getByRole('button', { name: 'Edit DEVELOPED BY' });
  await edit.click();
  await expect(folderModal).toBeVisible();
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  await expect(folderModal).toBeVisible();
  await expect(edit).toBeFocused();

  await edit.click();
  await page.locator('#bookmark-modal-form-name').fill('Discarded folder edit');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(folderModal).toBeVisible();
  await expect(folderModal).toContainText('DEVELOPED BY');

  edit = folderModal.getByRole('button', { name: 'Edit DEVELOPED BY' });
  await edit.click();
  await page.locator('#bookmark-modal-form-name').fill('Folder edited');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(folderModal).toBeVisible();
  await expect(folderModal).toContainText('Folder edited');
});

test('deletes a bookmark permanently from an open folder after confirmation', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Delete inside');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);

  await page.evaluate(() => {
    const storageKey = 'newdesktab-test-local';
    const stored = JSON.parse(sessionStorage.getItem(storageKey));
    const folder = stored.folders.find(item => item.name === 'Delete inside');
    Object.assign(stored.bookmarks[0], { folderId: folder.id, gx: 0, gy: 0 });
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await reloadSavedPage(page);

  const openFolder = async () => {
    await page.locator('.bookmark-folder', { hasText: 'Delete inside' })
      .getByRole('button', { name: /Open Delete inside/ })
      .click();
  };
  await openFolder();
  const grid = page.getByRole('list', { name: 'Folder bookmarks' });
  await expect(grid.locator('[data-bookmark-id]')).toHaveCount(1);
  await enableFolderEditMode(page);
  await page.getByRole('button', { name: 'Delete DEVELOPED BY' }).click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await expect(page.locator('#alert-modal-title'))
    .toHaveText('Delete “DEVELOPED BY”?');
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(grid.locator('[data-bookmark-id]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Close' }).click();
  await reloadSavedPage(page);
  await openFolder();
  await expect(page.getByRole('list', { name: 'Folder bookmarks' })
    .locator('[data-bookmark-id]')).toHaveCount(0);
});

test('renames an open folder by double-clicking its title', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('PokeMMO');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);

  await page.locator('.bookmark-folder', { hasText: 'PokeMMO' })
    .getByRole('button', { name: /Open PokeMMO/ })
    .click();
  const title = page.locator('#folder-modal-title');
  await expect(title).not.toHaveAttribute('role');
  await expect(title).not.toHaveAttribute('tabindex');
  await title.dblclick();
  await expect(title).toHaveAttribute('contenteditable', 'true');
  await expect(title).toBeFocused();
  const cancelRename = page.getByRole('button', { name: 'Cancel folder rename' });
  await expect(cancelRename).toBeVisible();
  await title.fill('');
  await cancelRename.click();
  await expect(title).toHaveText('PokeMMO');
  await expect(title).not.toHaveAttribute('contenteditable');
  await expect(cancelRename).toBeHidden();

  await title.dblclick();
  await title.fill('Accepted rename');
  await page.getByRole('button', { name: 'Save folder name' }).click();
  await expect(title).toHaveText('Accepted rename');
  await expect(title).not.toHaveAttribute('contenteditable');

  await title.dblclick();
  const requestedName = `Pokémon tools ${'x'.repeat(60)}`;
  const expectedName = requestedName.slice(0, 60);
  await title.fill(requestedName);
  await expect(title).toHaveText(expectedName);
  await title.press('Enter');

  await expect(page.locator('#folder-modal')).toBeVisible();
  await expect(title).not.toHaveAttribute('contenteditable');
  await expect(title).not.toBeFocused();
  await expect(title).toHaveText(expectedName);
});

test('edits a folder directly and deletes it through bulk selection', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-folder').click();
  await page.getByPlaceholder('Tools, inspiration…').fill('Temporary');
  await page.getByRole('button', { name: 'Add', exact: true }).click();  await waitForSaved(page);

  await enableEditMode(page);
  let folder = page.locator('.bookmark-folder', { hasText: 'Temporary' });
  await folder.getByRole('button', { name: 'Customize folder' }).click();
  await page.locator('#folder-editor-name').fill('Renamed');
  await page.locator('#edit-folder-modal-save').click();

  folder = page.locator('.bookmark-folder', { hasText: 'Renamed' });
  await expect(folder).toBeVisible();
  await folder.click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Accept' }).click();  await waitForSaved(page);
  await expect(folder).toHaveCount(0);
});
