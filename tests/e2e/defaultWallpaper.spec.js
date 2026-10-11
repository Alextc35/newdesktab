import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

async function start(page, theme, colorScheme) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(async theme => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
    const { getState } = await import('/src/state/appStore.js');
    await new Promise(resolve => chrome.storage.local.set({
      settings: { ...getState().data.settings, interfaceTheme: theme },
      bookmarks: [{ ...DEFAULT_BOOKMARK, id: 'default-bookmark', name: 'Default bookmark', gx: 0, gy: 0 }],
      folders: [{ ...DEFAULT_FOLDER_STYLE, id: 'default-folder', name: 'Default folder',
        gx: 1, gy: 0, w: 1, h: 1, showCount: true }]
    }, resolve));
  }, theme);
  await page.reload();
  await expectAppReady(page);
}

async function openSettings(page, tab) {
  await page.evaluate(() => document.getElementById('settings').click());
  await page.locator(`[data-tab="settings-modal-tab-${tab}"]`).click();
}

async function seek(page, time) {
  await page.locator('.manual-demo-progress').evaluate((input, time) => {
    input.value = String(time);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, time);
}

for (const [theme, colorScheme] of [['dark', 'light'], ['light', 'dark'], ['system', 'dark'], ['system', 'light']]) {
  test(`${theme}/${colorScheme}: default wallpaper stays consistent across the desktop, settings, manual and guide`, async ({ page }, testInfo) => {
    await start(page, theme, colorScheme);
    const light = theme === 'light' || (theme === 'system' && colorScheme === 'light');
    const background = await page.locator('body').evaluate(body => getComputedStyle(body).backgroundImage);
    expect(background).toContain('radial-gradient');
    expect(background).toContain(light ? 'rgb(247, 249, 252)' : 'rgb(13, 13, 13)');
    await expect(page.locator('[data-bookmark-id="default-bookmark"] .bookmark-title'))
      .toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(page.locator('[data-folder-id="default-folder"] .folder-title'))
      .toHaveCSS('color', 'rgb(248, 250, 252)');

    await openSettings(page, 'theme');
    await expect(page.locator('.bg-preview')).toHaveCSS('background-image', background);
    await page.locator('.bg-preview').screenshot({ path: testInfo.outputPath('settings-default.png') });
    await page.locator('#settings-modal-cancel').click();

    await openSettings(page, 'info');
    await page.locator('#settings-open-manual').click();
    await page.locator('.manual-index [data-manual-topic="movement"]').click();
    await seek(page, 0);
    const scene = page.locator('.manual-demo-scene');
    await expect(scene).toHaveCSS('background-image', background);
    await expect(scene.locator('.manual-demo-brand')).toHaveCSS('opacity', '1');
    await expect(scene.locator('.manual-demo-toolbar')).toHaveCSS('color', light ? 'rgb(23, 43, 64)' : 'rgb(241, 245, 249)');
    await page.locator('.manual-demo-viewport').screenshot({ path: testInfo.outputPath('manual-default.png') });
    await page.locator('#manual-close').click();

    await page.locator('#settings-open-guide').click();
    const guide = page.locator('.onboarding-demo');
    await expect(guide).toHaveCSS('background-image', background);
    await expect(guide.locator('.onboarding-demo-label').first())
      .toHaveCSS('color', light ? 'rgb(0, 0, 0)' : 'rgb(241, 245, 249)');
    for (const title of await guide.locator('.bookmark-title').all()) {
      await expect(title).toHaveCSS('color', light ? 'rgb(0, 0, 0)' : 'rgb(241, 245, 249)');
    }
    await guide.screenshot({ path: testInfo.outputPath('guide-default.png') });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('#onboarding-next').click();
    await expect.poll(() => guide.evaluate(root => root.getAnimations({ subtree: true })
      .some(animation => animation.id === 'onboarding-edit-bookmark'))).toBe(true);
    await guide.evaluate(root => {
      for (const animation of root.getAnimations({ subtree: true })) {
        if (!animation.id.startsWith('onboarding-edit-')) continue;
        animation.pause();
        animation.currentTime = animation.effect.getTiming().duration * .25;
      }
    });
    const grid = guide.locator('.onboarding-demo-edit-grid');
    await expect(grid).toHaveCSS('opacity', '1');
    await expect(grid).toHaveCSS('background-image', light ? /rgba\(36, 36, 40, 0.2\)/ : /rgba\(203, 213, 225, 0.13\)/);
    const cells = await grid.evaluate(element => ({
      width: parseFloat(element.style.width), height: parseFloat(element.style.height),
      cellWidth: parseFloat(element.style.getPropertyValue('--cell-w')),
      cellHeight: parseFloat(element.style.getPropertyValue('--cell-h'))
    }));
    expect(cells.width).toBeCloseTo(cells.cellWidth * 4);
    expect(cells.height).toBeCloseTo(cells.cellHeight * 3);
    await guide.screenshot({ path: testInfo.outputPath('guide-edit.png') });
    await expect(page.locator('html')).toHaveAttribute('data-interface-theme', theme);
  });
}

test('appearance demonstration changes its own wallpaper without changing the active interface theme', async ({ page }) => {
  await start(page, 'light', 'dark');
  const background = await page.locator('body').evaluate(body => getComputedStyle(body).backgroundImage);
  await openSettings(page, 'info');
  await page.locator('#settings-open-manual').click();
  await page.locator('.manual-index [data-manual-topic="interface"]').click();
  const scene = page.locator('.manual-demo-scene');
  await seek(page, 3500);
  await expect(scene).toHaveCSS('background-image', /rgb\(13, 13, 13\)/);
  await seek(page, 7500);
  await expect(scene).toHaveCSS('background-image', background);
  await seek(page, 3500);
  await expect(scene).toHaveCSS('background-image', /rgb\(13, 13, 13\)/);
  await expect(page.locator('html')).toHaveAttribute('data-interface-theme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-image', background);
});

test('changing appearance leaves grid items intact and their text colors remain editable', async ({ page }) => {
  await start(page, 'dark', 'dark');
  const items = () => page.evaluate(async () => {
    const { data } = (await import('/src/state/appStore.js')).getState();
    return { bookmarks: data.bookmarks, folders: data.folders, recycleBin: data.recycleBin, widgets: data.widgets };
  });
  const original = await items();
  await openSettings(page, 'general');
  await page.locator('input[name="interface-theme"][value="light"]').check();
  await expect(page.locator('#alert-modal')).toBeHidden();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  expect(await items()).toEqual(original);
  const title = page.locator('[data-bookmark-id="default-bookmark"] .bookmark-title');
  await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.keyboard.press('KeyE');
  await page.locator('[data-bookmark-id="default-bookmark"]').getByRole('button', { name: 'Edit bookmark' }).click();
  const editor = page.locator('#edit-bookmark-modal');
  await editor.getByRole('tab', { name: 'Style', exact: true }).click();
  await editor.locator('[data-field="textColor"]').fill('#ff00ff');
  await page.locator('#edit-bookmark-modal-save').click();
  await expect(editor).toBeHidden();
  await expect(title).toHaveCSS('color', 'rgb(255, 0, 255)');
  const edited = await items();
  await openSettings(page, 'general');
  await page.locator('input[name="interface-theme"][value="dark"]').check();
  await expect(page.locator('#alert-modal')).toBeHidden();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  expect(await items()).toEqual(edited);
  await expect(title).toHaveCSS('color', 'rgb(255, 0, 255)');
});
