import { expect, test } from './helpers/test.js';
import { expectAppReady } from './helpers/appReady.js';

const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1SQAAAABJRU5ErkJggg==',
  'base64'
);

async function waitForSaved(page) {
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().ui.persistence.status;
  })).toMatch(/^(idle|saved)$/);
}

async function openWorkspaceSettings(page, workspaceId) {
  const toolbar = page.getByRole('navigation', { name: 'Workspace controls' });
  await toolbar.hover();
  const activeWorkspaceId = await page.locator('#workspace-select').inputValue();
  if (activeWorkspaceId === (workspaceId || '')) {
    await page.locator('#workspace-settings-current').click();
  } else {
    await page.locator('#workspace-toggle').click();
    const selector = workspaceId
      ? `#workspace-options [data-workspace-settings-id="${workspaceId}"]`
      : '#workspace-options [data-workspace-settings-id=""]';
    await page.locator(selector).click();
  }
  await expect(page.locator('#workspace-settings-modal')).toBeVisible();
}

async function selectWorkspace(page, workspaceId) {
  const toolbar = page.getByRole('navigation', { name: 'Workspace controls' });
  await toolbar.hover();
  await page.locator('#workspace-toggle').click();
  const selector = workspaceId
    ? `#workspace-options [data-workspace-id="${workspaceId}"]`
    : '#workspace-options [data-workspace-id=""]';
  await page.locator(selector).click();
}

async function createWorkspaceWithContents(page) {
  const workspaceId = await page.evaluate(async () => {
    const { createWorkspace } = await import('/src/features/workspaces/workspaceActions.js');
    const { createBookmarkFolder } = await import('/src/features/folders/folderActions.js');
    const { addBookmark } = await import('/src/features/bookmarks/bookmarkActions.js');
    const workspace = createWorkspace('Minimalist');
    const folder = createBookmarkFolder('Reading', { columns: 12, rows: 6 });
    addBookmark({ name: 'Outside', url: 'https://outside.test', groupId: workspace.id, gx: 2, gy: 0 });
    addBookmark({ name: 'Inside', url: 'https://inside.test', groupId: workspace.id, folderId: folder.id });
    return workspace.id;
  });
  await waitForSaved(page);
  return workspaceId;
}

async function localImageKeys(page) {
  return page.evaluate(() => new Promise(resolve => chrome.storage.local.get(null, items => {
    resolve(Object.keys(items).filter(key => key.startsWith('newdesktabLocalImage:')));
  })));
}

test.beforeEach(async ({ page }) => {
  await page.route('https://images.test/**', route => route.fulfill({
    status: 200, contentType: 'image/png', body: imageBytes
  }));
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expectAppReady(page);
});

test('edits Main and custom workspace names and wallpapers independently', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Workspace controls' }).hover();
  await page.locator('#workspace-toggle').click();
  await expect(page.locator('#workspace-options [aria-current="true"]')
    .locator('..').locator('.workspace-option-settings')).toHaveCount(0);
  await expect(page.locator('#workspace-settings-current')).toBeVisible();
  await page.locator('#workspace-toggle').click();
  await page.locator('#workspace-settings-current').click();
  await expect(page.locator('#workspace-settings-modal')).toBeVisible();
  await page.locator('#workspace-settings-cancel').click();

  await openWorkspaceSettings(page, null);
  await expect(page.locator('#workspace-settings-delete')).toBeHidden();
  await page.locator('#workspace-settings-use-global-theme').uncheck();
  await page.locator('#workspace-settings-name').fill('Home');
  await page.locator('#workspace-settings-wallpaper-url').fill('https://images.test/home.jpg');
  await page.locator('#workspace-settings-media-add').click();
  await expect(page.locator('#workspace-wallpaper-preview-message')).toBeHidden();
  await page.locator('#workspace-settings-save').click();
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await waitForSaved(page);
  await expect(page.locator('#workspace-current-name')).toHaveText('Home');
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /images\.test\/home\.jpg/);

  const toolbar = page.getByRole('navigation', { name: 'Workspace controls' });
  await toolbar.hover();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.locator('#alert-modal-input').fill('Work');
  await page.locator('#alert-modal-accept').click();
  await waitForSaved(page);
  const workspaceId = await page.locator('#workspace-select').inputValue();

  await openWorkspaceSettings(page, workspaceId);
  await expect(page.locator('#workspace-settings-delete')).toHaveText('Delete workspace');
  await page.locator('#workspace-settings-name').fill('Research');
  await page.locator('#workspace-settings-use-global-theme').uncheck();
  await page.locator('#workspace-settings-wallpaper-url').fill('https://images.test/research-fallback.jpg');
  await page.locator('#workspace-settings-media-add').click();
  await page.locator('#workspace-settings-file').setInputFiles({
    name: 'research.png', mimeType: 'image/png', buffer: imageBytes
  });
  await expect(page.locator('#workspace-settings-media-list .theme-wallpaper-row')).toHaveCount(2);
  const previewTrigger = page.locator('#workspace-settings-media-list .theme-wallpaper-preview-trigger').first();
  await previewTrigger.hover();
  const previewLayers = await page.evaluate(() => ({
    preview: Number(getComputedStyle(document.querySelector('body > .theme-wallpaper-peek')).zIndex),
    modal: Number(getComputedStyle(document.querySelector('#workspace-settings-modal')).zIndex),
    previewTop: document.querySelector('body > .theme-wallpaper-peek').getBoundingClientRect().top,
    triggerBottom: document.querySelector('#workspace-settings-media-list .theme-wallpaper-preview-trigger')
      .getBoundingClientRect().bottom
  }));
  expect(previewLayers.preview).toBeGreaterThan(previewLayers.modal);
  expect(previewLayers.previewTop).toBeGreaterThanOrEqual(previewLayers.triggerBottom);
  await page.mouse.move(0, 0);
  await page.locator('#workspace-settings-media-list .theme-wallpaper-row').first()
    .locator('.theme-wallpaper-row-action').nth(1).click();
  await page.locator('#workspace-settings-media-interval').selectOption('300');
  await page.locator('#workspace-settings-save').click();
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await waitForSaved(page);
  await expect(page.locator('#workspace-current-name')).toHaveText('Research');
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /data:image\//);

  const workspaceState = await page.evaluate(async workspaceIdValue => {
    const { getState } = await import('/src/state/appStore.js');
    const { withoutDeviceImages } = await import('/src/platform/storage/deviceImageSelections.js');
    const data = getState().data;
    return {
      main: data.settings.mainWorkspace,
      custom: data.settings.bookmarkGroups.find(item => item.id === workspaceIdValue),
      shared: withoutDeviceImages(data)
    };
  }, workspaceId);
  expect(workspaceState.main.name).toBe('Home');
  expect(workspaceState.main.backgroundMedia[0].backgroundImageUrl)
    .toBe('https://images.test/home.jpg');
  expect(workspaceState.custom.name).toBe('Research');
  expect(workspaceState.custom.backgroundRotationSeconds).toBe(300);
  expect(workspaceState.custom.backgroundMedia[0].backgroundImageSource).toBe('local');
  expect(workspaceState.custom.backgroundMedia[0].backgroundImageUrl).toBeNull();
  expect(workspaceState.custom.backgroundMedia[1].backgroundImageUrl)
    .toBe('https://images.test/research-fallback.jpg');
  expect(workspaceState.shared.settings.bookmarkGroups[0].backgroundMedia[0])
    .not.toHaveProperty('backgroundImageLocal');
  expect(workspaceState.shared.settings.bookmarkGroups[0].backgroundMedia[1].backgroundImageUrl)
    .toBe('https://images.test/research-fallback.jpg');

  await selectWorkspace(page, null);
  await expect(page.locator('#workspace-current-name')).toHaveText('Home');
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /images\.test\/home\.jpg/);
  await selectWorkspace(page, workspaceId);
  await expect(page.locator('#workspace-current-name')).toHaveText('Research');
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /data:image\//);

  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('#workspace-current-name')).toHaveText('Research');
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /data:image\//);
});

test('supports a solid workspace color and returning to the global theme', async ({ page }) => {
  const toolbar = page.getByRole('navigation', { name: 'Workspace controls' });
  await toolbar.hover();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.locator('#alert-modal-input').fill('Color test');
  await page.locator('#alert-modal-accept').click();
  await waitForSaved(page);
  const workspaceId = await page.locator('#workspace-select').inputValue();

  await openWorkspaceSettings(page, workspaceId);
  await expect(page.locator('#workspace-settings-wallpaper-controls')).toBeHidden();
  await page.locator('#workspace-settings-use-global-theme').uncheck();
  await page.locator('#workspace-settings-solid-background').check();
  await page.locator('#workspace-wallpaper-preview').click();
  const picker = page.locator('#workspace-settings-solid-color-color-picker');
  await expect(picker).toBeVisible();
  await expect(page.locator('#workspace-wallpaper-preview-message')).toBeHidden();
  await picker.locator('.app-color-picker-hex').fill('#D90004');
  await expect(page.locator('#workspace-wallpaper-preview'))
    .toHaveCSS('background-color', 'rgb(217, 0, 4)');
  await expect(page.locator('#workspace-wallpaper-preview')).toHaveCSS('background-image', 'none');
  await picker.locator('.app-color-picker-hex').fill('#336699');
  await expect(page.locator('#workspace-wallpaper-preview'))
    .toHaveCSS('background-color', 'rgb(51, 102, 153)');
  await picker.locator('.app-color-picker-hex').press('Enter');
  await page.locator('#workspace-wallpaper-preview').click();
  await expect(picker).toBeHidden();
  await expect(page.locator('#workspace-wallpaper-preview-message')).toBeVisible();
  await page.locator('#workspace-wallpaper-preview').click();
  await expect(picker).toBeVisible();
  await picker.locator('.app-color-picker-close').click();
  await page.locator('#workspace-settings-save').click();
  await waitForSaved(page);
  await expect(page.locator('html')).toHaveCSS('--color-bg-body', '#336699');

  const custom = await page.evaluate(async id => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().data.settings.bookmarkGroups.find(item => item.id === id);
  }, workspaceId);
  expect(custom).toMatchObject({ themeEnabled: true, backgroundSolid: true, backgroundColor: '#336699' });

  await openWorkspaceSettings(page, workspaceId);
  await page.locator('#workspace-settings-use-global-theme').check();
  await expect(page.locator('#workspace-settings-theme-controls')).toBeHidden();
  await page.locator('#workspace-settings-save').click();
  await waitForSaved(page);
  await expect(page.locator('html')).not.toHaveCSS('--color-bg-body', '#336699');
  const globalMode = await page.evaluate(async id => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().data.settings.bookmarkGroups.find(item => item.id === id).themeEnabled;
  }, workspaceId);
  expect(globalMode).toBe(false);
});

test('uses the default preview when the global theme has no active background', async ({ page }) => {
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const data = getState().data;
    await setState({ data: { ...data, settings: { ...data.settings, theme: {
      ...data.settings.theme,
      backgroundDefault: true,
      backgroundSolid: false,
      backgroundMedia: [{ id: 'saved-but-inactive', type: 'image',
        backgroundImageUrl: 'https://images.test/inactive.jpg', backgroundImageLocal: null,
        backgroundImageSource: 'url' }]
    } } } });
  });
  await openWorkspaceSettings(page, null);
  await expect(page.locator('#workspace-settings-use-global-theme')).toBeChecked();
  await expect(page.locator('#workspace-wallpaper-preview-image')).toBeHidden();
  await expect(page.locator('#workspace-wallpaper-preview')).toHaveClass(/is-default-bg/);
  const defaultPreview = await page.locator('#workspace-wallpaper-preview').evaluate(element => ({
    wordmark: getComputedStyle(element, '::after').content,
    background: getComputedStyle(element).backgroundImage
  }));
  expect(defaultPreview.wordmark).toBe('"New DeskTab"');
  expect(defaultPreview.background).toContain('radial-gradient');
});

test('reorders workspaces with up and down buttons and saves automatically', async ({ page }) => {
  const created = await page.evaluate(async () => {
    const { createWorkspace } = await import('/src/features/workspaces/workspaceActions.js');
    return ['Alpha', 'Beta', 'Gamma'].map(name => createWorkspace(name).id);
  });
  await waitForSaved(page);
  const toolbar = page.getByRole('navigation', { name: 'Workspace controls' });
  await toolbar.hover();
  await page.locator('#workspace-toggle').click();
  const alphaUp = page.locator(`#workspace-options [data-workspace-order-id="${created[0]}"][data-workspace-order-offset="-1"]`);
  const gammaDown = page.locator(`#workspace-options [data-workspace-order-id="${created[2]}"][data-workspace-order-offset="1"]`);
  await expect(alphaUp).toBeDisabled();
  await expect(gammaDown).toBeDisabled();
  await page.locator(`#workspace-options [data-workspace-order-id="${created[1]}"][data-workspace-order-offset="1"]`).click();
  await waitForSaved(page);
  await page.locator(`#workspace-options [data-workspace-order-id="${created[2]}"][data-workspace-order-offset="-1"]`).click();
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().data.settings.bookmarkGroups.map(workspace => workspace.name);
  })).toEqual(['Gamma', 'Alpha', 'Beta']);
  await waitForSaved(page);
  await expect(page.locator('#workspace-current-name')).toHaveText('Gamma');
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('#workspace-current-name')).toHaveText('Gamma');
  const savedOrder = await page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().data.settings.bookmarkGroups.map(workspace => workspace.name);
  });
  expect(savedOrder).toEqual(['Gamma', 'Alpha', 'Beta']);
});

test('sizes the workspace dropdown to its rows when scrolling is unnecessary', async ({ page }) => {
  await page.setViewportSize({ width: 376, height: 219 });
  await page.evaluate(async () => {
    const { createWorkspace } = await import('/src/features/workspaces/workspaceActions.js');
    createWorkspace('Alpha');
    createWorkspace('Beta');
  });
  await waitForSaved(page);
  await page.locator('#workspace-toolbar').hover();
  await page.locator('#workspace-toggle').click();
  const menu = page.locator('#workspace-options');
  await expect(menu).toHaveCSS('overflow-y', 'hidden');
  await expect.poll(() => menu.evaluate(element => getComputedStyle(element).overflowY))
    .toBe('auto');
  await expect.poll(() => menu.evaluate(element => element.clientHeight)).toBeGreaterThan(0);
  const size = await menu.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    top: element.getBoundingClientRect().top
  }));
  expect(size.scrollHeight).toBeLessThanOrEqual(size.clientHeight);
  expect(size.top).toBeGreaterThanOrEqual(0);
});

test('enables workspace scrolling only after the expanding animation finishes', async ({ page }) => {
  await page.setViewportSize({ width: 376, height: 219 });
  await page.evaluate(async () => {
    const { createWorkspace } = await import('/src/features/workspaces/workspaceActions.js');
    for (let index = 0; index < 8; index += 1) createWorkspace(`Workspace ${index + 1}`);
  });
  await waitForSaved(page);
  await page.locator('#workspace-toolbar').hover();
  await page.locator('#workspace-toggle').click();
  const menu = page.locator('#workspace-options');
  await expect(menu).toHaveCSS('overflow-y', 'hidden');
  await expect.poll(() => menu.evaluate(element => getComputedStyle(element).overflowY))
    .toBe('auto');
  const size = await menu.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(size.scrollHeight).toBeGreaterThan(size.clientHeight);
});

test('blocks workspace editing in list view while keeping workspace navigation available', async ({ page }) => {
  const ids = await page.evaluate(async () => {
    const { createWorkspace } = await import('/src/features/workspaces/workspaceActions.js');
    return ['Alpha', 'Beta', 'Gamma'].map(name => createWorkspace(name).id);
  });
  await waitForSaved(page);
  const workspaces = () => page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getState().data.settings.bookmarkGroups);
  const original = await workspaces();
  await page.setViewportSize({ width: 600, height: 720 });
  await expect(page.locator('#bookmark-container')).toHaveClass(/is-list-view/);

  const expectBlocked = async () => {
    await expect(page.locator('.flash-error').last())
      .toHaveText('Widen the window to use this feature.');
    await expect(page.locator('.modal.is-open')).toHaveCount(0);
    expect(await workspaces()).toEqual(original);
    await page.locator('#flash-container').evaluate(element => element.replaceChildren());
  };
  for (const id of ['workspace-settings-current', 'workspace-add', 'workspace-delete']) {
    await page.locator('#workspace-toolbar').hover();
    await page.locator(`#${id}`).click();
    await expectBlocked();
  }

  await page.locator('#workspace-toggle').click();
  await page.locator(`[data-workspace-settings-id="${ids[0]}"]`).click();
  await expectBlocked();
  await page.locator('#workspace-toggle').click();
  await page.locator(`[data-workspace-order-id="${ids[1]}"][data-workspace-order-offset="1"]`).click();
  await expectBlocked();
  await page.keyboard.press('Escape');

  await selectWorkspace(page, ids[0]);
  await expect(page.locator('#workspace-select')).toHaveValue(ids[0]);
  await expect(page.locator('#workspace-current-name')).toHaveText('Alpha');
  expect(await workspaces()).toEqual(original);
});

test('suspends workspace settings in list view and restores the unfinished draft and cursor', async ({ page }) => {
  await openWorkspaceSettings(page, null);
  const name = page.locator('#workspace-settings-name');
  await name.fill('Unfinished workspace');
  await name.focus();
  await name.evaluate(input => input.setSelectionRange(2, 8));
  const original = await page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getState().data);

  await page.setViewportSize({ width: 601, height: 720 });
  await expect(page.locator('#workspace-settings-modal')).toBeVisible();
  await page.setViewportSize({ width: 600, height: 720 });
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await expect(page.locator('.flash-info'))
    .toHaveText('Panel hidden. Widen the window to continue.');
  await page.evaluate(async () => (
    await import('/src/features/workspaces/workspaceSettingsModal.js')
  ).openWorkspaceSettings(null));
  await expect(page.locator('.flash-error').last())
    .toHaveText('Widen the window to use this feature.');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getState().data)).toEqual(original);

  await page.setViewportSize({ width: 601, height: 720 });
  await expect(name).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Unfinished workspace');
  expect(await name.evaluate(input => [input.selectionStart, input.selectionEnd])).toEqual([2, 8]);
  await page.locator('#workspace-settings-save').click();
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await waitForSaved(page);
  await expect(page.locator('#workspace-current-name')).toHaveText('Unfinished workspace');
});

test('suspends workspace creation and deletion prompts until the window is widened', async ({ page }) => {
  await page.locator('#workspace-toolbar').hover();
  await page.locator('#workspace-add').click();
  await page.locator('#alert-modal-input').fill('Pending workspace');
  await page.setViewportSize({ width: 600, height: 720 });
  await expect(page.locator('#alert-modal')).toBeHidden();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  const workspaceNames = () => page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getState().data.settings.bookmarkGroups.map(workspace => workspace.name));
  expect(await workspaceNames()).toEqual([]);
  await page.setViewportSize({ width: 601, height: 720 });
  await expect(page.locator('#alert-modal-input')).toHaveValue('Pending workspace');
  await page.locator('#alert-modal-accept').click();
  await waitForSaved(page);
  expect(await workspaceNames()).toEqual(['Pending workspace']);

  await page.locator('#workspace-toolbar').hover();
  await page.locator('#workspace-delete').click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await page.setViewportSize({ width: 600, height: 720 });
  await expect(page.locator('#alert-modal')).toBeHidden();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  expect(await workspaceNames()).toEqual(['Pending workspace']);
  await page.setViewportSize({ width: 601, height: 720 });
  await expect(page.locator('#alert-modal')).toBeVisible();
  await page.locator('#alert-modal-accept').click();
  await waitForSaved(page);
  expect(await workspaceNames()).toEqual([]);
});

test('deletes a custom workspace from its settings after confirming its saved name and contents', async ({ page }) => {
  const workspaceId = await createWorkspaceWithContents(page);
  const before = await page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getState().data);
  const previousImages = await localImageKeys(page);
  await openWorkspaceSettings(page, workspaceId);
  await page.locator('#workspace-settings-name').fill('Unfinished name');
  await page.locator('#workspace-settings-use-global-theme').uncheck();
  await page.locator('#workspace-settings-file').setInputFiles({
    name: 'unfinished.png', mimeType: 'image/png', buffer: imageBytes
  });
  await expect(page.locator('#workspace-settings-media-list .theme-wallpaper-row')).toHaveCount(1);
  await expect.poll(() => localImageKeys(page)).toHaveLength(previousImages.length + 1);

  await page.locator('#workspace-settings-delete').click();
  await expect(page.locator('#alert-modal-title')).toHaveText(
    'Delete “Minimalist”, its 1 folders and 2 bookmarks? To keep them, move them to Main or another workspace first.'
  );
  await page.locator('#alert-modal-cancel').click();
  await expect(page.locator('#workspace-settings-name')).toHaveValue('Unfinished name');
  await expect(page.locator('#workspace-settings-media-list')).toContainText('unfinished.png');
  await expect(page.locator('#workspace-settings-save')).toBeEnabled();
  expect(await page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getState().data)).toEqual(before);
  expect(await localImageKeys(page)).toHaveLength(previousImages.length + 1);

  await page.locator('#workspace-settings-delete').click();
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await expect(page.locator('#alert-modal')).toBeHidden();
  await waitForSaved(page);
  const after = await page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getState().data);
  expect(after.settings.bookmarkGroups).toEqual(before.settings.bookmarkGroups.filter(item => item.id !== workspaceId));
  expect(after.settings.activeBookmarkGroupId).toBeNull();
  expect(after.settings.mainWorkspace).toEqual(before.settings.mainWorkspace);
  expect(after.bookmarks).toEqual(before.bookmarks.filter(item => item.groupId !== workspaceId));
  expect(after.folders).toEqual(before.folders.filter(item => item.groupId !== workspaceId));
  expect(after.trash).toHaveLength(before.trash.length + 2);
  await expect(page.locator('#workspace-current-name')).toHaveText('Main');
  expect(await localImageKeys(page)).toEqual(previousImages);
  await page.reload();
  await expectAppReady(page);
  await openWorkspaceSettings(page, null);
  await expect(page.locator('#workspace-settings-delete')).toBeHidden();
});

for (const retry of ['global', 'delete']) {
  test(`keeps the workspace settings draft on failed deletion and closes after a ${retry} retry`, async ({ page }) => {
    const workspaceId = await createWorkspaceWithContents(page);
    await openWorkspaceSettings(page, workspaceId);
    await page.locator('#workspace-settings-name').fill('Unfinished name');
    await page.locator('#workspace-settings-delete').click();
    await page.evaluate(() => {
      const original = chrome.storage.local.set;
      chrome.storage.local.set = (items, callback) => {
        if (!items.bookmarks) return original(items, callback);
        chrome.storage.local.set = original;
        chrome.runtime.lastError = { message: 'Simulated full storage' };
        callback?.();
        chrome.runtime.lastError = null;
      };
    });
    await page.locator('#alert-modal-accept').click();
    await expect(page.locator('#persistence-feedback')).toBeVisible();
    await expect(page.locator('#workspace-settings-modal')).toBeVisible();
    await expect(page.locator('#workspace-settings-name')).toHaveValue('Unfinished name');
    await expect(page.locator('#workspace-settings-save')).toBeDisabled();
    await expect(page.locator('#workspace-settings-delete')).toBeEnabled();
    await expect(page.locator('.flash-success')).toHaveCount(0);
    const pendingTrash = await page.evaluate(async () => (
      await import('/src/state/appStore.js')
    ).getState().data.trash);

    await page.locator(retry === 'global' ? '#persistence-retry' : '#workspace-settings-delete').click();
    await expect(page.locator('#workspace-settings-modal')).toBeHidden();
    await expect(page.locator('#persistence-feedback')).toBeHidden();
    await page.reload();
    await expectAppReady(page);
    const saved = await page.evaluate(async () => (
      await import('/src/state/appStore.js')
    ).getState().data);
    expect(saved.trash.map(({ id, type }) => ({ id, type })))
      .toEqual(pendingTrash.map(({ id, type }) => ({ id, type })));
    expect(saved.trash.find(entry => entry.type === 'folder').bookmarks[0].name).toBe('Inside');
    expect(saved.trash.find(entry => entry.type === 'bookmark').bookmark.name).toBe('Outside');
    expect(saved.settings.bookmarkGroups.some(item => item.id === workspaceId)).toBe(false);
    expect(saved.settings.activeBookmarkGroupId).toBeNull();
  });
}

test('suspends workspace deletion from its settings without losing the draft or applying the confirmation', async ({ page }) => {
  const workspaceId = await createWorkspaceWithContents(page);
  await openWorkspaceSettings(page, workspaceId);
  await page.locator('#workspace-settings-name').fill('Unfinished name');
  await page.locator('#workspace-settings-delete').click();
  const before = await page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getState().data);
  await page.setViewportSize({ width: 600, height: 720 });
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await expect(page.locator('#alert-modal')).toBeHidden();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(async () => (
    await import('/src/state/appStore.js')
  ).getState().data)).toEqual(before);
  await page.setViewportSize({ width: 601, height: 720 });
  await expect(page.locator('#alert-modal')).toBeVisible();
  await page.locator('#alert-modal-cancel').click();
  await expect(page.locator('#workspace-settings-name')).toHaveValue('Unfinished name');
  await expect(page.locator('#workspace-settings-save')).toBeEnabled();
});
