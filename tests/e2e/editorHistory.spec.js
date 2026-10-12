import { expect, test } from '@playwright/test';
import { expectAppReady, expectAppSaved } from './helpers/appReady.js';

const undo = page => page.keyboard.press('Control+z');
const redo = page => page.keyboard.press('Control+Shift+z');
const data = page => page.evaluate(async () => structuredClone((await import('/src/state/appStore.js')).getState().data));

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(async () => {
    const { addBookmark } = await import('/src/features/bookmarks/bookmarkActions.js');
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const groupId = (await import('/src/features/workspaces/workspaceSelectors.js')).getActiveWorkspaceId((await import('/src/state/appStore.js')).getState().data);
    addBookmark({ ...DEFAULT_BOOKMARK, id: 'history-bookmark', name: 'Draft bookmark', url: 'https://history.internal', gx: 3, gy: 0, groupId });
  });
  await expectAppSaved(page);
  await page.evaluate(async () => {
    const { createBookmarkFolder } = await import('/src/features/folders/folderActions.js');
    createBookmarkFolder('Draft folder', { columns: 16, rows: 12 });
  });
  await expectAppSaved(page);
});

async function openEditor(page, type) {
  await page.evaluate(async type => {
    if (type === 'bookmark') (await import('/src/features/bookmarks/bookmarkModal.js')).openEditBookmark('history-bookmark');
    else if (type === 'folder') {
      const { getState } = await import('/src/state/appStore.js');
      const id = getState().data.folders.find(folder => folder.name === 'Draft folder').id;
      (await import('/src/features/folders/folderEditorModal.js')).openFolderEditor(id);
    }
    else (await import('/src/features/recycle-bin/recycleBinEditorModal.js')).openRecycleBinEditor();
  }, type);
  const modal = page.locator(type === 'bookmark' ? '#edit-bookmark-modal' : type === 'folder' ? '#edit-folder-modal' : '#edit-recycle-bin-modal');
  await expect(modal).toBeVisible();
  await modal.getByRole('tab', { name: 'Style', exact: true }).click();
  return modal;
}

for (const type of ['bookmark', 'folder', 'recycleBin']) {
  test(`${type}: undo and redo draft looks and toggles without changing saved history`, async ({ page }) => {
    const before = await data(page);
    const modal = await openEditor(page, type);
    const undoButton = modal.locator('[data-editor-history="undo"]');
    const redoButton = modal.locator('[data-editor-history="redo"]');
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();
    const save = modal.locator('.modal-actions .btn-primary');
    const toggle = modal.locator(type === 'bookmark' ? '[data-field="noBackground"]'
      : type === 'folder' ? '#folder-editor-no-outer-background' : '#recycle-bin-editor-no-background');
    await modal.locator('[data-appearance-look="midnight"]').click();
    await toggle.check();
    await undo(page);
    await expect(page.locator('.flash-info').last()).toHaveText('Change undone');
    await expect(toggle).not.toBeChecked();
    await expect(modal.locator('[data-appearance-look="midnight"]')).toHaveAttribute('aria-pressed', 'true');
    await undoButton.click();
    await expect(save).toBeDisabled();
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeEnabled();
    expect(await data(page)).toEqual(before);
    await redoButton.click();
    await expect(page.locator('.flash-info').last()).toHaveText('Change redone');
    await expect(save).toBeEnabled();
    await redo(page);
    await expect(toggle).toBeChecked();
    await expect(redoButton).toBeDisabled();
    expect(await data(page)).toEqual(before);
    await save.click();
    await expect(modal).toBeHidden();
    await expectAppSaved(page);
    const saved = await data(page);
    const value = type === 'bookmark' ? saved.bookmarks.find(item => item.id === 'history-bookmark')
      : type === 'folder' ? saved.folders.find(item => item.name === 'Draft folder') : saved.recycleBin;
    expect(value[type === 'folder' ? 'noOuterBackground' : 'noBackground']).toBe(true);
    await openEditor(page, type);
    await undo(page);
    await expect(save).toBeDisabled();
    expect(await data(page)).toEqual(saved);
  });
}

test('color and automatic text contrast restore as one change and a new edit clears redo', async ({ page }) => {
  const modal = await openEditor(page, 'bookmark');
  await modal.locator('[data-appearance-look="card"]').click();
  const background = modal.locator('[data-field="backgroundColor"]');
  const text = modal.locator('[data-field="textColor"]');
  await background.fill('#ffffff');
  await expect(text).toHaveValue('#000000');
  await undo(page);
  await expect(background).toHaveValue('#111827');
  await expect(text).toHaveValue('#ffffff');
  await redo(page);
  await expect(background).toHaveValue('#ffffff');
  await expect(text).toHaveValue('#000000');
  await undo(page);
  await modal.locator('[data-appearance-look="paper"]').click();
  await redo(page);
  await expect(background).toHaveValue('#f1f0ec');
  await expect(text).toHaveValue('#292524');
});

test('an open color picker follows draft undo and redo', async ({ page }) => {
  const modal = await openEditor(page, 'bookmark');
  await modal.locator('[data-appearance-look="card"]').click();
  await modal.locator('[data-field="backgroundColor"]').click();
  const picker = modal.locator('.app-color-picker:not([hidden])');
  await picker.locator('[data-color="#ef4444"]').click();
  await picker.locator('[data-color="#3b82f6"]').click();
  await undo(page);
  await expect(modal.locator('[data-field="backgroundColor"]')).toHaveValue('#ef4444');
  await expect(picker.locator('.app-color-picker-hex')).toHaveValue('#EF4444');
  await redo(page);
  await expect(picker.locator('.app-color-picker-hex')).toHaveValue('#3B82F6');
});

test('text keeps native undo and redo while the saved workspace stays unchanged', async ({ page }) => {
  const before = await data(page);
  const modal = await openEditor(page, 'bookmark');
  await modal.getByRole('tab', { name: 'General', exact: true }).click();
  const name = modal.locator('[data-field="name"]');
  await name.focus();
  await name.press('Control+a');
  await name.pressSequentially('Changed name');
  await undo(page);
  await expect(name).not.toHaveValue('Changed name');
  await expect(page.locator('.flash-info').last()).toHaveText('Change undone');
  await expect(modal.locator('[data-editor-history="redo"]')).toBeEnabled();
  await redo(page);
  await expect(name).toHaveValue('Changed name');
  await expect(page.locator('.flash-info').last()).toHaveText('Change redone');
  await undo(page);
  const undoneName = await name.inputValue();
  await modal.locator('[data-editor-history="redo"]').click();
  await expect(name).toHaveValue('Changed name');
  await name.focus();
  await undo(page);
  await expect(name).toHaveValue(undoneName);
  await redo(page);
  await expect(name).toHaveValue('Changed name');
  expect(await data(page)).toEqual(before);
});

test('local image upload undo and redo preserves its file and URL fallback', async ({ page }) => {
  const before = await data(page);
  const modal = await openEditor(page, 'bookmark');
  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff0033';
    context.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await modal.locator('.editor-image-section summary').click();
  await modal.locator('[data-field="bgUploadInput"]').setInputFiles({ name: 'draft-history.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const local = modal.locator('[data-field="backgroundImageLocal"]');
  await expect(local).toHaveValue('draft-history.png');
  await modal.locator('.editor-image-section summary').focus();
  await undo(page);
  await expect(modal.locator('.bookmark-preview .bookmark')).not.toHaveClass(/has-bg-image/);
  await redo(page);
  await expect(local).toHaveValue('draft-history.png');
  await expect(modal.locator('.bookmark-preview .bookmark')).toHaveClass(/has-bg-image/);
  expect(await data(page)).toEqual(before);
});

test('closing an unchanged editor restores global undo and redo', async ({ page }) => {
  const before = await data(page);
  const modal = await openEditor(page, 'bookmark');
  await modal.locator('#edit-bookmark-modal-cancel').click();
  await expect(modal).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/shared/ui/modalManager.js')).hasOpenModal({ includeSuspended: true }))).toBe(false);
  await expect(page.locator('#history-undo')).toBeEnabled();
  await page.locator('#history-undo').focus();
  await undo(page);
  await expect.poll(async () => (await data(page)).folders.length).toBe(before.folders.length - 1);
  await expect(page.locator('.flash-info').last()).toHaveText('Change undone');
  await expectAppSaved(page);
  await redo(page);
  await expect.poll(async () => (await data(page)).folders.length).toBe(before.folders.length);
  await expect(page.locator('.flash-info').last()).toHaveText('Change redone');
});

test('confirmations and suspended editors cannot undo the workspace or the underlying draft', async ({ page }) => {
  const before = await data(page);
  const modal = await openEditor(page, 'bookmark');
  await modal.locator('[data-appearance-look="paper"]').click();
  await modal.locator('#edit-bookmark-modal-cancel').click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await undo(page);
  expect(await data(page)).toEqual(before);
  await page.locator('#alert-modal-cancel').click();
  await expect(modal.locator('[data-appearance-look="paper"]')).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(modal).toBeHidden();
  await undo(page);
  expect(await data(page)).toEqual(before);
  await page.setViewportSize({ width: 720, height: 800 });
  await expect(modal).toBeVisible();
  await modal.locator('[data-tab-button="style"]').focus();
  await undo(page);
  await expect(modal.locator('#edit-bookmark-modal-save')).toBeDisabled();
});

test('default bookmark styles get their own history over an unchanged settings draft', async ({ page }) => {
  const before = await data(page);
  await page.keyboard.press('KeyS');
  await page.locator('[data-tab="settings-modal-tab-bookmark"]').click();
  await page.locator('#settings-bookmark-configure').click();
  const modal = page.locator('#edit-bookmark-modal');
  await modal.getByRole('tab', { name: 'Style', exact: true }).click();
  await modal.locator('[data-appearance-look="paper"]').click();
  await undo(page);
  await expect(modal.locator('#edit-bookmark-modal-save')).toBeDisabled();
  await redo(page);
  await expect(modal.locator('#edit-bookmark-modal-save')).toBeEnabled();
  expect(await data(page)).toEqual(before);
});

test('clock configuration undo and redo works from selects and checkboxes', async ({ page }) => {
  const before = await data(page);
  await page.evaluate(async () => (await import('/src/widgets/builtin/clock/clockSettings.js')).openCreateClock());
  const cycle = page.locator('#clock-widget-hour-cycle');
  const seconds = page.locator('#clock-widget-show-seconds');
  await cycle.selectOption('12');
  await seconds.check();
  await undo(page);
  await expect(seconds).not.toBeChecked();
  await page.locator('#clock-widget-modal [data-editor-history="undo"]').click();
  await expect(cycle).toHaveValue('24');
  await page.locator('#clock-widget-modal [data-editor-history="redo"]').click();
  await expect(cycle).toHaveValue('12');
  await redo(page);
  await expect(seconds).toBeChecked();
  expect(await data(page)).toEqual(before);
});

test('editor buttons undo and redo the complete text draft', async ({ page }) => {
  const modal = await openEditor(page, 'bookmark');
  await modal.getByRole('tab', { name: 'General', exact: true }).click();
  const name = modal.locator('[data-field="name"]');
  await name.fill('A different name');
  await modal.locator('[data-editor-history="undo"]').click();
  await expect(name).toHaveValue('Draft bookmark');
  await expect(page.locator('.flash-info').last()).toHaveText('Change undone');
  await modal.locator('[data-editor-history="redo"]').click();
  await expect(name).toHaveValue('A different name');
  await expect(page.locator('.flash-info').last()).toHaveText('Change redone');
});

test('recycle-bin retention follows its local history buttons', async ({ page }) => {
  const modal = await openEditor(page, 'recycleBin');
  await modal.getByRole('tab', { name: 'General', exact: true }).click();
  const retention = modal.locator('#recycle-bin-editor-retention');
  const original = await retention.inputValue();
  const alternative = await retention.locator('option').evaluateAll((options, original) => options.find(option => option.value !== original).value, original);
  await retention.selectOption(alternative);
  await modal.locator('[data-editor-history="undo"]').click();
  await expect(retention).toHaveValue(original);
  await modal.locator('[data-editor-history="redo"]').click();
  await expect(retention).toHaveValue(alternative);
});

test('history controls follow live language changes and fit narrow editor headers', async ({ page }) => {
  const modal = await openEditor(page, 'bookmark');
  for (const [language, undoName, redoName] of [
    ['en', 'Undo', 'Redo'], ['es', 'Deshacer', 'Rehacer'],
    ['es_419', 'Deshacer', 'Rehacer'], ['pt_BR', 'Desfazer', 'Refazer']
  ]) {
    await page.evaluate(async language => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language }), language);
    await expect(modal.locator('[data-editor-history="undo"]')).toHaveAccessibleName(undoName);
    await expect(modal.locator('[data-editor-history="redo"]')).toHaveAccessibleName(redoName);
    await expect(modal.locator('[data-editor-history="undo"]')).toHaveAttribute('title', `${undoName} (Ctrl/Cmd + Z)`);
  }
  for (const width of [601, 720, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const title = await modal.locator('.edit-bookmark-modal-header h2').boundingBox();
    const controls = await modal.locator('.editor-history-controls').boundingBox();
    const card = await modal.locator('.modal-card').boundingBox();
    expect(title.x + title.width).toBeLessThan(controls.x);
    expect(controls.x + controls.width).toBeLessThan(card.x + card.width);
  }
  await page.setViewportSize({ width: 1000, height: 850 });
  await page.evaluate(async () => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language: 'es' }));
  await modal.locator('[data-appearance-look="paper"]').click();
  await modal.locator('[data-editor-history="undo"]').click();
  await expect.poll(() => page.locator('.flash-info').last().evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(.95);
  for (const theme of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.screenshot({ path: `node_modules/.cache/editor-history-preview-${theme}.png` });
  }
});
