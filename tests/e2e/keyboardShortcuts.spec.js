import { expect, test } from './helpers/test.js';
import { expectAppReady, expectAppSaved } from './helpers/appReady.js';

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
    await import('/src/state/appStore.js')
  ).getState().ui.isEditing);
}

async function updateShortcuts(page, changes) {
  await page.evaluate(async next => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { data } = getState();
    void setState({ data: { settings: { ...data.settings,
      keyboardShortcuts: { ...data.settings.keyboardShortcuts, ...next }
    } } });
  }, changes);
  await expectAppSaved(page);
}

async function shortcutPrevented(page, shortcut, target = 'body') {
  return page.locator(target).evaluate((element, keys) => {
    const event = new KeyboardEvent('keydown', { ...keys, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, shortcut);
}

test('edit launcher swaps SVG assets and accessible labels with its mode', async ({ page }) => {
  await start(page);
  const button = page.locator('#edit-toggle-mode');
  const icon = button.locator('.edit-toggle-icon');
  await expect(button).toHaveAttribute('aria-label', 'Enter edit mode');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await icon.evaluate(element => getComputedStyle(element).maskImage))
    .toContain('/src/assets/icons/edit-mode.svg');

  await page.mouse.move(5, page.viewportSize().height / 2);
  await button.click();
  await expect(button).toHaveAttribute('aria-label', 'Exit edit mode');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await icon.evaluate(element => getComputedStyle(element).maskImage))
    .toContain('/src/assets/icons/exit-edit-mode.svg');

  await page.keyboard.press('KeyE');
  await expect(button).toHaveAttribute('aria-label', 'Enter edit mode');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('single-key defaults open their actions and expose accessible hints', async ({ page }) => {
  await start(page);

  await expect(page.locator('#edit-toggle-mode')).toHaveAttribute('aria-keyshortcuts', 'E');
  await expect(page.locator('#add-bookmark')).toHaveAttribute('aria-keyshortcuts', 'B');
  await expect(page.locator('#add-folder')).toHaveAttribute('aria-keyshortcuts', 'F');
  await expect(page.locator('#add-widgets')).toHaveAttribute('aria-keyshortcuts', 'W');
  await expect(page.locator('#settings')).toHaveAttribute('aria-keyshortcuts', 'S');

  await page.keyboard.press('Space');
  expect(await isEditing(page)).toBe(false);
  await page.keyboard.press('Enter');
  await expect(page.locator('#edit-bookmark-modal')).toBeHidden();

  await page.keyboard.press('KeyE');
  expect(await isEditing(page)).toBe(true);
  await page.keyboard.press('KeyE');
  expect(await isEditing(page)).toBe(false);

  await page.keyboard.press('KeyB');
  await expect(page.locator('#edit-bookmark-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#edit-bookmark-modal')).toBeHidden();

  await page.keyboard.press('KeyF');
  await expect(page.locator('#edit-folder-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#edit-folder-modal')).toBeHidden();

  await page.keyboard.press('KeyW');
  await expect(page.locator('#widget-catalog-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#widget-catalog-modal')).toBeHidden();

  await page.keyboard.press('KeyS');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await page.keyboard.press('KeyS');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await page.locator('[data-tab="settings-modal-tab-shortcuts"]').click();
  await expect(page.locator('.shortcut-setting-row')).toHaveCount(5);
  await expect(page.locator('[data-shortcut-action="toggleEditing"] kbd')).toHaveText(['E']);
  await expect(page.locator('[data-shortcut-action="openWidgets"] kbd')).toHaveText(['W']);
});

for (const [key, modalId, nextKey, nextModalId] of [
  ['KeyB', 'edit-bookmark-modal', 'KeyF', 'edit-folder-modal'],
  ['KeyF', 'edit-folder-modal', 'KeyB', 'edit-bookmark-modal']
]) {
  test(`${key} cancellation returns to the grid from either the grid or add launcher`, async ({ page }) => {
    await start(page);
    const grid = page.locator('#bookmark-container');
    const toggle = page.locator('#add-toggle');
    for (const opener of [grid, toggle]) {
      await opener.focus();
      await page.keyboard.press(key);
      await expect(page.locator(`#${modalId}`)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(`#${modalId}`)).toBeHidden();
      await expect(grid).toBeFocused();
      await expect(toggle).not.toBeFocused();

      await page.keyboard.press('Tab');
      await expect(grid.locator('.recycle-bin')).toHaveClass(/is-keyboard-active/);
      await page.keyboard.press('ArrowDown');
      await expect(grid.locator('[data-bookmark-id="test-developed-by"]'))
        .toHaveClass(/is-keyboard-active/);
      await page.keyboard.press('ArrowRight');
      await expect(grid.locator('[data-bookmark-id="test-banana"]'))
        .toHaveClass(/is-keyboard-active/);
      await page.keyboard.press('Tab');
      await expect(grid.locator('.is-keyboard-active')).toHaveCount(0);

      await page.keyboard.press('KeyE');
      expect(await isEditing(page)).toBe(true);
      await page.keyboard.press('KeyE');
      expect(await isEditing(page)).toBe(false);
      await page.keyboard.press(nextKey);
      await expect(page.locator(`#${nextModalId}`)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(`#${nextModalId}`)).toBeHidden();
      await expect(grid).toBeFocused();
    }
  });
}

test('native add-menu clicks and keyboard activation restore the visible launcher', async ({ page }) => {
  await start(page);
  const toggle = page.locator('#add-toggle');
  for (const [actionId, modalId, arrowCount] of [
    ['add-bookmark', 'edit-bookmark-modal', 1],
    ['add-folder', 'edit-folder-modal', 2]
  ]) {
    for (const activation of ['click', 'Enter', 'Space']) {
      if (activation === 'click') {
        await page.mouse.move(5, page.viewportSize().height / 2);
        await toggle.click();
        await page.locator(`#${actionId}`).click();
      } else {
        await toggle.focus();
        for (let step = 0; step < arrowCount; step += 1) {
          await page.keyboard.press('ArrowDown');
        }
        await expect(page.locator(`#${actionId}`)).toBeFocused();
        await page.keyboard.press(activation);
      }
      await expect(page.locator(`#${modalId}`)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(`#${modalId}`)).toBeHidden();
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
  }
});

test('Control plus settings opens the current workspace while the plain shortcut keeps general settings', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => (
    await import('/src/features/workspaces/workspaceActions.js')
  ).createWorkspace('Current workspace'));
  await expect(page.locator('#workspace-current-name')).toHaveText('Current workspace');
  await expect(page.locator('#workspace-settings-current')).toHaveAttribute('aria-keyshortcuts', 'Control+S');

  await page.keyboard.press('KeyS');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  expect(await shortcutPrevented(page, { key: 's', code: 'KeyS', ctrlKey: true }, '#settings-modal'))
    .toBe(false);
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-modal')).toBeHidden();

  await page.keyboard.press('Control+KeyS');
  await expect(page.locator('#workspace-settings-modal')).toBeVisible();
  await expect(page.locator('#workspace-settings-name')).toHaveValue('Current workspace');
  await expect(page.locator('#settings-modal')).toBeHidden();
  expect(await shortcutPrevented(page, { key: 's', code: 'KeyS', ctrlKey: true }, '#workspace-settings-name'))
    .toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();

  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'workspace-shortcut-input';
    document.body.append(input);
    input.focus();
  });
  expect(await shortcutPrevented(page, { key: 's', code: 'KeyS', ctrlKey: true }, '#workspace-shortcut-input'))
    .toBe(false);
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
});

for (const [settingKeys, generalHint, workspaceKeys, workspaceHint] of [
  ['KeyG', 'G', 'Control+KeyG', 'Control+G'],
  ['Alt+Shift+KeyG', 'Alt+Shift+G', 'Control+Alt+Shift+KeyG', 'Control+Alt+Shift+G']
]) {
  test(`workspace settings follow the customized ${generalHint} settings shortcut`, async ({ page }) => {
    await start(page);
    await page.keyboard.press('KeyS');
    await page.locator('[data-tab="settings-modal-tab-shortcuts"]').click();
    await page.locator('[data-shortcut-action="openSettings"]').click();
    await page.keyboard.press(settingKeys);
    await page.locator('#settings-modal-save').click();
    await expect(page.locator('#settings-modal')).toBeHidden();
    await expect(page.locator('#settings')).toHaveAttribute('aria-keyshortcuts', generalHint);
    await expect(page.locator('#workspace-settings-current')).toHaveAttribute('aria-keyshortcuts', workspaceHint);
    expect(await shortcutPrevented(page, { key: 's', code: 'KeyS', ctrlKey: true })).toBe(false);
    await page.keyboard.press(workspaceKeys);
    await expect(page.locator('#workspace-settings-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#workspace-settings-modal')).toBeHidden();
    await page.keyboard.press(settingKeys);
    await expect(page.locator('#settings-modal')).toBeVisible();
    await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  });
}

test('workspace settings shortcuts respect explicit bindings, Control bindings and unassigned settings', async ({ page }) => {
  await start(page);
  const workspaceControl = page.locator('#workspace-settings-current');
  await updateShortcuts(page, { openSettings: 'G', openWidgets: 'Ctrl+G' });
  await expect(workspaceControl).not.toHaveAttribute('aria-keyshortcuts');
  await page.keyboard.press('Control+KeyG');
  await expect(page.locator('#widget-catalog-modal')).toBeVisible();
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#widget-catalog-modal')).toBeHidden();

  await updateShortcuts(page, { openSettings: 'Ctrl+G', openWidgets: 'W' });
  await expect(workspaceControl).not.toHaveAttribute('aria-keyshortcuts');
  await page.keyboard.press('Control+KeyG');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-modal')).toBeHidden();

  await updateShortcuts(page, { openSettings: 'L' });
  await expect(workspaceControl).not.toHaveAttribute('aria-keyshortcuts');
  expect(await shortcutPrevented(page, { key: 'l', code: 'KeyL', ctrlKey: true })).toBe(false);
  await updateShortcuts(page, { openSettings: null });
  await expect(workspaceControl).not.toHaveAttribute('aria-keyshortcuts');
  expect(await shortcutPrevented(page, { key: 's', code: 'KeyS', ctrlKey: true })).toBe(false);
  expect(await shortcutPrevented(page, { key: 's', code: 'KeyS' })).toBe(false);
  expect(await shortcutPrevented(page, { key: 'Enter', code: 'Enter' })).toBe(false);
  await expect(page.locator('.modal.is-open')).toHaveCount(0);
});

test('workspace settings shortcuts show the usual warning in list view', async ({ page }) => {
  await start(page);
  await page.setViewportSize({ width: 600, height: 720 });
  await page.keyboard.press('Control+KeyS');
  await expect(page.locator('.flash-error').last()).toHaveText('Widen the window to use this feature.');
  await expect(page.locator('#workspace-settings-modal')).toBeHidden();
  await expect(page.locator('.modal.is-open')).toHaveCount(0);
});

test('custom shortcuts reject conflicts and survive a Sync round trip', async ({ page }) => {
  await start(page);
  await page.keyboard.press('KeyS');
  await page.locator('[data-tab="settings-modal-tab-shortcuts"]').click();

  const editShortcut = page.locator('[data-shortcut-action="toggleEditing"]');
  await editShortcut.click();
  await page.keyboard.press('KeyB');
  await expect(page.locator('.flash-error').last())
    .toHaveText('This key is already assigned to another action.');
  await expect(editShortcut).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Control+Shift+KeyE');
  await expect(page.locator('.flash-success').last()).toHaveText('Shortcut updated.');
  await expect(editShortcut.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'E']);

  await page.locator('[data-tab="settings-modal-tab-sync"]').click();
  await page.locator('#storage-mode-sync').click();
  await page.locator('#alert-modal-accept').click();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectReady(page);

  const persisted = await page.evaluate(async () => {
    const store = await import('/src/state/appStore.js');
    return {
      mode: store.getStorageMode(),
      shortcuts: store.getState().data.settings.keyboardShortcuts
    };
  });
  expect(persisted).toEqual({
    mode: 'sync',
    shortcuts: {
      toggleEditing: 'Ctrl+Shift+E',
      addBookmark: 'B',
      addFolder: 'F',
      openWidgets: 'W',
      openSettings: 'S'
    }
  });

  await page.keyboard.press('KeyE');
  expect(await isEditing(page)).toBe(false);
  await page.keyboard.press('Control+Shift+KeyE');
  expect(await isEditing(page)).toBe(true);
  await page.keyboard.press('Control+Shift+KeyE');
  expect(await isEditing(page)).toBe(false);

  await page.keyboard.press('KeyS');
  await page.locator('[data-tab="settings-modal-tab-shortcuts"]').click();
  await expect(editShortcut.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'E']);
  await page.locator('#shortcut-reset-defaults').click();
  await page.locator('#alert-modal-accept').click();
  await expect(editShortcut.locator('kbd')).toHaveText(['E']);
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectReady(page);
  await page.keyboard.press('KeyE');
  expect(await isEditing(page)).toBe(true);
});

test('single keys are editable while sensitive combinations and typing stay protected', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'shortcut-test-input';
    document.body.append(input);
  });
  await page.keyboard.press('KeyS');
  await page.locator('[data-tab="settings-modal-tab-shortcuts"]').click();
  const widgetsShortcut = page.locator('[data-shortcut-action="openWidgets"]');
  await widgetsShortcut.click();
  await widgetsShortcut.evaluate(button => button.dispatchEvent(new KeyboardEvent('keydown', {
    code: 'KeyW', key: 'w', ctrlKey: true, bubbles: true, cancelable: true
  })));
  await expect(page.locator('.flash-error').last())
    .toHaveText('This shortcut is reserved by the browser or operating system. Choose another combination.');
  await expect(widgetsShortcut).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyG');
  await expect(widgetsShortcut.locator('kbd')).toHaveText(['G']);
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.keyboard.press('KeyG');
  await expect(page.locator('#widget-catalog-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#widget-catalog-modal')).toBeHidden();
  await expect(page.locator('#shortcut-test-input')).not.toHaveAttribute('inert', '');
  await page.locator('#shortcut-test-input').focus();
  await page.keyboard.press('KeyG');
  await expect(page.locator('#shortcut-test-input')).toHaveValue('g');
  await expect(page.locator('#widget-catalog-modal')).toBeHidden();
});

test('right-click unassigns a shortcut and keeps it unassigned after reload', async ({ page }) => {
  await start(page);
  await page.keyboard.press('KeyS');
  await page.locator('[data-tab="settings-modal-tab-shortcuts"]').click();
  const widgetsShortcut = page.locator('[data-shortcut-action="openWidgets"]');
  await widgetsShortcut.click({ button: 'right' });
  await expect(widgetsShortcut).toHaveText('Unassigned');
  await expect(page.locator('.flash-info').last()).toHaveText('Shortcut unassigned.');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(page.locator('#add-widgets')).not.toHaveAttribute('aria-keyshortcuts');
  await page.keyboard.press('KeyW');
  await expect(page.locator('#widget-catalog-modal')).toBeHidden();
  await page.reload();
  await expectReady(page);
  await page.keyboard.press('KeyS');
  await page.locator('[data-tab="settings-modal-tab-shortcuts"]').click();
  await expect(widgetsShortcut).toHaveText('Unassigned');
});
