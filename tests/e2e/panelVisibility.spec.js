import { expect, test } from './helpers/test.js';
import { expectAppReady, expectAppSaved } from './helpers/appReady.js';

async function openSettings(page) {
  await page.keyboard.press('KeyS');
  await expect(page.locator('#settings-modal')).toBeVisible();
}

async function saveSettings(page) {
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expectAppSaved(page);
}

async function expectPanels(page, { launcher, workspace }) {
  for (const [selector, visible] of [
    ['#floating-menu', launcher], ['#workspace-toolbar', workspace]
  ]) {
    const panel = page.locator(selector);
    await expect(panel).toHaveJSProperty('hidden', !visible);
    if (visible) await expect(panel).toBeVisible();
    else {
      await expect(panel).toBeHidden();
      await expect(panel).toHaveCSS('display', 'none');
    }
  }
}

async function savedPreferences(page) {
  return page.evaluate(async () => {
    const { getSettings } = await import('/src/state/appStore.js');
    const { showLauncher, showWorkspaceToolbar, keyboardShortcuts } = getSettings();
    return { showLauncher, showWorkspaceToolbar, keyboardShortcuts };
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.locator('#bookmark-container').focus();
});

for (const [input, visibility] of [
  ['settings-show-launcher', { launcher: false, workspace: true }],
  ['settings-show-workspace-toolbar', { launcher: true, workspace: false }]
]) {
  test(`${input} hides only its panel and survives reload`, async ({ page }) => {
    await expectPanels(page, { launcher: true, workspace: true });
    await openSettings(page);
    await expect(page.locator('#settings-show-launcher')).toBeChecked();
    await expect(page.locator('#settings-show-workspace-toolbar')).toBeChecked();
    await page.locator(`#${input}`).uncheck();
    await expectPanels(page, { launcher: true, workspace: true });
    await saveSettings(page);
    await expectPanels(page, visibility);

    await page.reload();
    await expectAppReady(page);
    await expectPanels(page, visibility);
    await openSettings(page);
    await expect(page.locator('#settings-show-launcher')).toBeChecked({ checked: visibility.launcher });
    await expect(page.locator('#settings-show-workspace-toolbar')).toBeChecked({ checked: visibility.workspace });
  });
}

test('discarding panel visibility changes keeps both panels and saved preferences intact', async ({ page }) => {
  const before = await savedPreferences(page);
  await openSettings(page);
  await page.locator('#settings-show-launcher').uncheck();
  await page.locator('#settings-show-workspace-toolbar').uncheck();
  await expectPanels(page, { launcher: true, workspace: true });
  await page.locator('#settings-modal-cancel').click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await expectPanels(page, { launcher: true, workspace: true });
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expectPanels(page, { launcher: true, workspace: true });
  expect(await savedPreferences(page)).toEqual(before);
  await openSettings(page);
  await expect(page.locator('#settings-show-launcher')).toBeChecked();
  await expect(page.locator('#settings-show-workspace-toolbar')).toBeChecked();
});

test('hidden panels retain creation, workspace navigation and settings shortcuts for recovery', async ({ page }) => {
  const ids = await page.evaluate(async () => {
    const { createWorkspace } = await import('/src/features/workspaces/workspaceActions.js');
    return ['Alpha', 'Beta'].map(name => createWorkspace(name).id);
  });
  await expectAppSaved(page);
  await openSettings(page);
  await page.locator('#settings-show-launcher').uncheck();
  await page.locator('#settings-show-workspace-toolbar').uncheck();
  await saveSettings(page);
  await expectPanels(page, { launcher: false, workspace: false });
  await page.reload();
  await expectAppReady(page);
  await expectPanels(page, { launcher: false, workspace: false });

  for (const [key, modal] of [
    ['KeyB', '#edit-bookmark-modal'], ['KeyF', '#edit-folder-modal']
  ]) {
    await page.keyboard.press(key);
    await expect(page.locator(modal)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(modal)).toBeHidden();
    await expect(page.locator('#bookmark-container')).toBeFocused();
    await expectPanels(page, { launcher: false, workspace: false });
  }

  await page.keyboard.press('Control+ArrowUp');
  await expect(page.locator('#workspace-select')).toHaveValue(ids[0]);
  await expect(page.locator('#bookmark-container')).not.toHaveClass(/is-switching-workspace/);
  await page.keyboard.press('Control+KeyS');
  await expect(page.locator('#workspace-settings-modal')).toBeVisible();
  await expect(page.locator('#workspace-settings-name')).toHaveValue('Alpha');
  await page.keyboard.press('Escape');
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await expectPanels(page, { launcher: false, workspace: false });

  await openSettings(page);
  await expect(page.locator('#settings-show-launcher')).not.toBeChecked();
  await expect(page.locator('#settings-show-workspace-toolbar')).not.toBeChecked();
  await page.locator('#settings-show-launcher').check();
  await page.locator('#settings-show-workspace-toolbar').check();
  await saveSettings(page);
  await expectPanels(page, { launcher: true, workspace: true });
});

test('requires an assigned settings shortcut before hiding the launcher', async ({ page }) => {
  const before = await savedPreferences(page);
  await openSettings(page);
  await page.locator('[data-tab="settings-modal-tab-shortcuts"]').click();
  await page.locator('[data-shortcut-action="openSettings"]').click({ button: 'right' });
  await page.locator('[data-tab="settings-modal-tab-general"]').click();
  await page.locator('#settings-show-launcher').uncheck();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('.flash-error').last()).toBeVisible();
  await expect(page.locator('#settings-modal')).toBeVisible();
  await expectPanels(page, { launcher: true, workspace: true });
  expect(await savedPreferences(page)).toEqual(before);

  await page.locator('#settings-show-launcher').check();
  await saveSettings(page);
  await expectPanels(page, { launcher: true, workspace: true });
  expect((await savedPreferences(page)).keyboardShortcuts.openSettings).toBeNull();
});

test('resetting settings restores both hidden panels', async ({ page }) => {
  await openSettings(page);
  await page.locator('#settings-show-launcher').uncheck();
  await page.locator('#settings-show-workspace-toolbar').uncheck();
  await saveSettings(page);
  await expectPanels(page, { launcher: false, workspace: false });
  await openSettings(page);
  await page.locator('#reset-settings-btn-general').click();
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expectAppSaved(page);
  await expectPanels(page, { launcher: true, workspace: true });
  await page.reload();
  await expectAppReady(page);
  await expectPanels(page, { launcher: true, workspace: true });
});
