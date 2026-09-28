import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

async function expectReady(page) {
  await expectAppReady(page);
  await expect(page.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();
}

async function start(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectReady(page);
}

async function isEditing(page) {
  return page.evaluate(async () => (
    await import('/src/js/state/appStore.js')
  ).getState().ui.isEditing);
}

test('default shortcuts replace the old keys and expose accessible hints', async ({ page }) => {
  await start(page);

  await expect(page.locator('#edit-toggle-mode')).toHaveAttribute('aria-keyshortcuts', 'Control+E');
  await expect(page.locator('#add-bookmark')).toHaveAttribute('aria-keyshortcuts', 'Control+B');
  await expect(page.locator('#add-folder')).toHaveAttribute('aria-keyshortcuts', 'Control+F');
  await expect(page.locator('#settings')).toHaveAttribute('aria-keyshortcuts', 'Control+S');

  await page.keyboard.press('Space');
  expect(await isEditing(page)).toBe(false);
  await page.keyboard.press('Enter');
  await expect(page.locator('#edit-bookmark-modal')).toBeHidden();

  await page.keyboard.press('Control+KeyE');
  expect(await isEditing(page)).toBe(true);
  await page.keyboard.press('Control+KeyE');
  expect(await isEditing(page)).toBe(false);

  await page.keyboard.press('Control+KeyB');
  await expect(page.locator('#edit-bookmark-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#edit-bookmark-modal')).toBeHidden();

  await page.keyboard.press('Control+KeyF');
  await expect(page.locator('#edit-folder-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#edit-folder-modal')).toBeHidden();

  await page.keyboard.press('Control+KeyS');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await page.keyboard.press('Control+KeyS');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await page.locator('[data-tab="settings-modal-tab-shortcuts"]').click();
  await expect(page.locator('.shortcut-setting-row')).toHaveCount(4);
  await expect(page.locator('[data-shortcut-action="toggleEditing"] kbd')).toHaveText(['Ctrl', 'E']);
});

test('custom shortcuts reject conflicts and survive a Sync round trip', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Control+KeyS');
  await page.locator('[data-tab="settings-modal-tab-shortcuts"]').click();

  const editShortcut = page.locator('[data-shortcut-action="toggleEditing"]');
  await editShortcut.click();
  await page.keyboard.press('Control+KeyB');
  await expect(page.locator('#shortcut-capture-status'))
    .toHaveText('Ctrl + B is already used by Create bookmark.');
  await expect(editShortcut).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Control+Shift+KeyE');
  await expect(page.locator('#shortcut-capture-status'))
    .toHaveText('Shortcut changed to Ctrl + Shift + E.');
  await expect(editShortcut.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'E']);

  await page.locator('[data-tab="settings-modal-tab-sync"]').click();
  await page.locator('#storage-mode-sync').check();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectReady(page);

  const persisted = await page.evaluate(async () => {
    const store = await import('/src/js/state/appStore.js');
    return {
      mode: store.getStorageMode(),
      shortcuts: store.getState().data.settings.keyboardShortcuts
    };
  });
  expect(persisted).toEqual({
    mode: 'sync',
    shortcuts: {
      toggleEditing: 'Ctrl+Shift+E',
      addBookmark: 'Ctrl+B',
      addFolder: 'Ctrl+F',
      openSettings: 'Ctrl+S'
    }
  });

  await page.keyboard.press('Control+KeyE');
  expect(await isEditing(page)).toBe(false);
  await page.keyboard.press('Control+Shift+KeyE');
  expect(await isEditing(page)).toBe(true);
  await page.keyboard.press('Control+Shift+KeyE');
  expect(await isEditing(page)).toBe(false);

  await page.keyboard.press('Control+KeyS');
  await page.locator('[data-tab="settings-modal-tab-shortcuts"]').click();
  await expect(editShortcut.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'E']);
  await page.locator('#shortcut-reset-defaults').click();
  await expect(editShortcut.locator('kbd')).toHaveText(['Ctrl', 'E']);
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectReady(page);
  await page.keyboard.press('Control+KeyE');
  expect(await isEditing(page)).toBe(true);
});
