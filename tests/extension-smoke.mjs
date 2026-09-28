import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const executablePath = process.env.NEWDESKTAB_BROWSER_PATH;
const extensionPath = process.env.NEWDESKTAB_EXTENSION_PATH
  ? resolve(process.env.NEWDESKTAB_EXTENSION_PATH)
  : fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(extensionPath, 'manifest.json'), 'utf8'));
const context = await chromium.launchPersistentContext('', {
  ...(executablePath ? { executablePath } : { channel: 'chromium' }),
  headless: true,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-first-run'
  ]
});

try {
  // Use a fresh profile and keep the smoke check independent of image providers.
  await context.route(/^https?:/, route => route.abort());
  const page = await context.newPage();
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('chrome://newtab/');
  await page.waitForLoadState('domcontentloaded');

  assert.match(page.url(), /^chrome-extension:\/\/.+\/newtab\.html$/);
  assert.equal(new URL(page.url()).pathname, `/${manifest.chrome_url_overrides.newtab}`);
  await page.locator('#workspace-toolbar').waitFor({ state: 'visible' });
  await page.locator('#bookmark-container[tabindex="-1"]').waitFor({ state: 'visible' });
  try {
    assert.equal(await page.locator('#bookmark-container .bookmark').count(), 0);
  } catch (error) {
    throw new Error([
      error.message,
      `Page errors: ${errors.join(' | ') || 'none'}`,
      `Console errors: ${consoleErrors.join(' | ') || 'none'}`
    ].join('\n'), { cause: error });
  }
  await page.evaluate(async () => {
    const { addBookmark } = await import('./js/features/bookmarks/bookmarkActions.js');
    addBookmark({ name: 'Release smoke', url: 'https://smoke.internal', gx: 5, gy: 0 });
  });
  await page.waitForFunction(async () => {
    const { getState } = await import('./js/state/appStore.js');
    return getState().ui.persistence.status === 'saved';
  });
  await page.reload();
  await page.getByRole('link', { name: /Release smoke/ }).waitFor({ state: 'visible' });

  await page.keyboard.press('Control+KeyE');
  await page.waitForFunction(async () => (await import('./js/state/appStore.js')).getState().ui.isEditing);
  await page.keyboard.press('Control+KeyE');
  await page.waitForFunction(async () => !(await import('./js/state/appStore.js')).getState().ui.isEditing);

  await page.keyboard.press('Control+KeyB');
  await page.locator('#edit-bookmark-modal').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('#edit-bookmark-modal').waitFor({ state: 'hidden' });
  await page.keyboard.press('Control+KeyF');
  await page.locator('#edit-folder-modal').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('#edit-folder-modal').waitFor({ state: 'hidden' });
  await page.keyboard.press('Control+KeyS');
  await page.locator('#settings-modal').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');

  assert.deepEqual(errors, []);
  console.log(`Extension smoke passed: ${manifest.version}, new tab, save, reload and shortcuts.`);
} finally {
  await context.close();
}
