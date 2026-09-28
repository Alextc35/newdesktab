import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

async function openSettings(page) {
  await expectAppReady(page);
  await page.mouse.move(5, page.viewportSize().height / 2);
  await page.locator('#settings').click();
  await expect(page.locator('#settings-modal')).toBeVisible();
}

async function start(page) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await expect(page.locator('#workspace-select')).toHaveValue('');
  await expect(page.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();
}

const preference = (page, value) => page.locator(`input[name="interface-theme"][value="${value}"]`);
const card = page => page.locator('#settings-modal > .modal-card');
const light = 'rgb(252, 252, 252)';
const dark = 'rgb(17, 17, 17)';

test('light folder grids and previews keep labels readable without changing saved colors', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await start(page);
  await page.evaluate(async () => {
    const { createBookmarkFolder } = await import('/src/js/features/folders/folderActions.js');
    createBookmarkFolder('Reading', { columns: 12, rows: 6 });
  });
  await page.locator('.bookmark-folder .folder-open').click();
  const grid = page.locator('#folder-modal-items');
  await expect(grid).toHaveCSS('background-color', 'rgb(247, 247, 248)');
  await expect(page.locator('#folder-modal-empty')).toHaveCSS('color', 'rgb(100, 100, 111)');
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/js/domain/bookmarks/bookmarkDefaults.js');
    const { getState, setState } = await import('/src/js/state/appStore.js');
    const folderId = getState().data.folders[0].id;
    const examples = [
      { name: 'White', textColor: '#ffffff' },
      { name: 'Purple', textColor: '#5531a8' },
      { name: 'Filled', noBackground: false, backgroundColor: '#20384f' },
      { name: 'Cover', backgroundFavicon: false, backgroundImageUrl: 'https://images.test/cover.png' }
    ];
    await setState({ data: { bookmarks: examples.map((example, index) => ({
      ...DEFAULT_BOOKMARK, ...example, id: example.name, url: 'https://example.internal',
      gx: index, gy: 0, folderId
    })) } });
  });
  const white = grid.locator('[data-bookmark-id="White"] .bookmark-title');
  const purple = grid.locator('[data-bookmark-id="Purple"] .bookmark-title');
  const filled = grid.locator('[data-bookmark-id="Filled"] .bookmark-title');
  const cover = grid.locator('[data-bookmark-id="Cover"] .bookmark-title');
  await expect(white).toHaveCSS('color', 'rgb(36, 36, 40)');
  await expect(purple).toHaveCSS('color', 'rgb(85, 49, 168)');
  await expect(filled).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(cover).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(grid).toHaveCSS('background-color', 'rgba(2, 6, 23, 0.32)');
  await expect(white).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('#folder-modal-edit-toggle').click();
  await grid.getByRole('button', { name: 'Edit White', exact: true }).click();
  const preview = page.locator('#edit-bookmark-modal .bookmark-preview');
  await expect(preview).toHaveCSS('background-color', 'rgb(248, 248, 249)');
  await expect(preview.locator('.bookmark-title')).toHaveCSS('color', 'rgb(36, 36, 40)');
  await page.keyboard.press('Escape');
  await page.locator('#folder-modal-customize').click();
  await expect(page.locator('#folder-editor-preview')).toHaveCSS('background-color', 'rgb(248, 248, 249)');
  await expect(page.locator('#folder-editor-preview .folder-title')).toHaveCSS('color', 'rgb(36, 36, 40)');
  await page.keyboard.press('Escape');
  await grid.locator('[data-bookmark-id="White"] .folder-item-remove').click();
  await page.locator('#folder-modal-close').click();
  await expect(page.locator('#bookmark-container [data-bookmark-id="White"] .bookmark-title'))
    .toHaveCSS('color', 'rgb(255, 255, 255)');
  expect(await page.evaluate(async () => {
    const { getState } = await import('/src/js/state/appStore.js');
    return getState().data.bookmarks.map(item => item.textColor);
  })).toEqual(['#ffffff', '#5531a8', '#ffffff', '#ffffff']);
});

test('system follows device colors, explicit modes persist, and cancel restores the preview', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await start(page);
  await openSettings(page);
  await expect(preference(page, 'system')).toBeChecked();
  await expect(card(page)).toHaveCSS('background-color', dark);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(card(page)).toHaveCSS('background-color', light);
  await preference(page, 'dark').check();
  await expect(card(page)).toHaveCSS('background-color', dark);
  await page.locator('#settings-modal-save').click();
    await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await openSettings(page);
  await expect(preference(page, 'dark')).toBeChecked();
  await expect(card(page)).toHaveCSS('background-color', dark);
  await preference(page, 'light').check();
  await expect(card(page)).toHaveCSS('background-color', light);
  await page.locator('#settings-modal-cancel').click();
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await openSettings(page);
  await expect(preference(page, 'dark')).toBeChecked();
  await expect(card(page)).toHaveCSS('background-color', dark);
  await preference(page, 'system').check();
  await page.locator('#settings-modal-save').click();
    await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await openSettings(page);
  await expect(preference(page, 'system')).toBeChecked();
  await expect(card(page)).toHaveCSS('background-color', light);
});

for (const [locale, language] of [['es-ES', 'es'], ['es-MX', 'es-419'], ['pt-BR', 'pt-BR'], ['fr-FR', 'en']]) {
  test(`automatic language uses ${locale} with a supported fallback`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    try {
      await start(page);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await openSettings(page);
      await page.locator('[data-tab="settings-modal-tab-lang"]').click();
      await expect(page.locator('#language-select')).toHaveValue('system');
      // A live preview also supplies a valid BCP 47 locale for storage statistics.
      await page.locator('[data-tab="settings-modal-tab-sync"]').click();
      await expect(page.locator('[data-storage-usage-active]')).not.toContainText('NaN');
    } finally {
      await context.close();
    }
  });
}

test('language preview can be cancelled, saved, and reset to the device default', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'es-ES', colorScheme: 'light' });
  const page = await context.newPage();
  try {
    await start(page);
    await openSettings(page);
    await page.locator('[data-tab="settings-modal-tab-lang"]').click();
    await page.locator('#language-select').selectOption('pt_BR');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await page.locator('#settings-modal-cancel').click();
    await page.locator('#alert-modal-accept').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await openSettings(page);
    await preference(page, 'dark').check();
    await page.locator('[data-tab="settings-modal-tab-lang"]').click();
    await page.locator('#language-select').selectOption('en');
    await page.locator('#settings-modal-save').click();
    await expect(page.locator('#settings-modal')).toBeHidden();
    await page.reload();
    await openSettings(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(preference(page, 'dark')).toBeChecked();
    await page.locator('#reset-settings-btn-general').click();
    await page.locator('#alert-modal-accept').click();
    await expect(page.locator('#settings-modal')).toBeHidden();
    await expect(card(page)).toHaveCSS('background-color', light);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await openSettings(page);
    await expect(preference(page, 'system')).toBeChecked();
  } finally {
    await context.close();
  }
});

test('deletes every local data area without changing synchronized data', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/js/domain/bookmarks/bookmarkDefaults.js');
    const { DEFAULT_FOLDER_STYLE } = await import('/src/js/domain/folders/folderDefaults.js');
    const { changeStorageMode, getState, setState } = await import('/src/js/state/appStore.js');

    const settings = structuredClone(getState().data.settings);
    settings.interfaceTheme = 'dark';
    settings.bookmarkPresets = [{
      id: 'saved-style',
      name: 'Saved style',
      style: structuredClone(settings.bookmarkDefault)
    }];
    await setState({
      data: {
        bookmarks: [{
          ...DEFAULT_BOOKMARK,
          id: 'delete-me',
          name: 'Delete me',
          url: 'https://delete.example',
          gx: 0,
          gy: 0
        }],
        folders: [{
          ...DEFAULT_FOLDER_STYLE,
          id: 'delete-folder',
          name: 'Delete folder',
          gx: 1,
          gy: 0,
          w: 2,
          h: 2,
          groupId: null
        }],
        widgets: [{
          id: 'delete-widget',
          type: 'clock',
          version: 1,
          gx: 3,
          gy: 0,
          w: 2,
          h: 1,
          groupId: null,
          config: { hourCycle: '24', showSeconds: true },
          createdAt: 1,
          updatedAt: 1
        }],
        settings
      }
    });
    await changeStorageMode('sync', getState().data);
    await new Promise(resolve => chrome.storage.local.set({
      'newdesktabLocalImage:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9': {
        dataUrl: 'data:image/webp;base64,b3duZWQ=',
        name: 'owned.webp'
      },
      newdesktabLocalImageSelections: {
        theme: 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9'
      },
      newdesktabLocalTrash: [{
        id: 'delete-trash-entry',
        type: 'bookmark',
        deletedAt: Date.now(),
        bookmark: {
          ...DEFAULT_BOOKMARK,
          id: 'deleted-bookmark',
          name: 'Deleted bookmark'
        }
      }]
    }, resolve));
  });

  await expect(page.locator('.bookmark[data-bookmark-id]')).toHaveCount(1);
  await expect(page.locator('.bookmark-folder')).toHaveCount(1);
  await expect(page.locator('[data-widget-id="delete-widget"]')).toHaveCount(1);
  const syncedBeforeDelete = await page.evaluate(() => (
    JSON.parse(sessionStorage.getItem('newdesktab-test-sync') || '{}')
  ));
  await openSettings(page);
  const erase = page.getByRole('button', { name: 'Delete all local data' });
  await expect(erase).toHaveClass(/btn-danger/);

  await erase.click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await expect(page.locator('#alert-modal-title')).toContainText(
    'Delete all local NewDeskTab data from this device?'
  );
  await page.locator('#alert-modal-cancel').click();
  await expect(page.locator('#settings-modal')).toBeVisible();
  await expect(page.locator('.bookmark[data-bookmark-id]')).toHaveCount(1);

  await erase.click();
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(page.locator('.bookmark[data-bookmark-id]')).toHaveCount(0);
  await expect(page.locator('.bookmark-folder')).toHaveCount(0);
  await expect(page.locator('[data-widget-id]')).toHaveCount(0);

  await expect.poll(() => page.evaluate(async () => {
    const { DEFAULT_SETTINGS } = await import('/src/js/domain/settings/settingsDefaults.js');
    const local = JSON.parse(sessionStorage.getItem('newdesktab-test-local') || '{}');
    const sync = JSON.parse(sessionStorage.getItem('newdesktab-test-sync') || '{}');
    return {
      mode: local.newdesktabStorageMode,
      bookmarks: local.bookmarks,
      folders: local.folders,
      widgets: local.widgets,
      trash: local.newdesktabLocalTrash,
      settingsAreDefault: JSON.stringify(local.settings) === JSON.stringify(DEFAULT_SETTINGS),
      sync,
      localImageKeys: Object.keys(local).filter(key => key.startsWith('newdesktabLocalImage:')),
      hasImageSelections: Object.hasOwn(local, 'newdesktabLocalImageSelections')
    };
  })).toEqual({
    mode: 'local',
    bookmarks: [],
    folders: [],
    widgets: [],
    trash: undefined,
    settingsAreDefault: true,
    sync: syncedBeforeDelete,
    localImageKeys: [],
    hasImageSelections: false
  });

  await page.reload();
  await expect(page.locator('.bookmark[data-bookmark-id]')).toHaveCount(0);
  await expect(page.locator('.bookmark-folder')).toHaveCount(0);
});
