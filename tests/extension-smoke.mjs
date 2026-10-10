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
    const { addBookmark } = await import('./features/bookmarks/bookmarkActions.js');
    addBookmark({ name: 'Release smoke', url: 'https://smoke.internal', gx: 5, gy: 0 });
  });
  await page.waitForFunction(async () => {
    const { getState } = await import('./state/appStore.js');
    return getState().ui.persistence.status === 'saved';
  });
  await page.reload();
  await page.getByRole('link', { name: /Release smoke/ }).waitFor({ state: 'visible' });

  await page.keyboard.press('KeyE');
  await page.waitForFunction(async () => (await import('./state/appStore.js')).getState().ui.isEditing);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(async () => !(await import('./state/appStore.js')).getState().ui.isEditing);

  await page.keyboard.press('KeyB');
  await page.locator('#edit-bookmark-modal').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('#edit-bookmark-modal').waitFor({ state: 'hidden' });
  await page.keyboard.press('KeyF');
  await page.locator('#edit-folder-modal').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('#edit-folder-modal').waitFor({ state: 'hidden' });
  await page.keyboard.press('KeyW');
  await page.locator('#widget-catalog-modal').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('#widget-catalog-modal').waitFor({ state: 'hidden' });
  await page.keyboard.press('KeyS');
  await page.locator('#settings-modal').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');

  // A popup is its own extension page. It must hydrate the same persisted
  // state and be able to save without the New Tab page being in focus.
  assert.equal(manifest.action.default_popup, 'src/popup.html');
  assert.ok(manifest.permissions.includes('activeTab'));
  const popup = await context.newPage();
  popup.on('pageerror', error => errors.push(`Popup: ${error.message}`));
  await popup.goto(new URL(`/${manifest.action.default_popup}`, page.url()).href);
  await popup.locator('#quick-save-workspace option').first().waitFor({ state: 'attached' });
  await popup.waitForFunction(() => document.getElementById('quick-save-tab-title').textContent !== '…');
  assert.deepEqual(await popup.locator('#quick-save-form input, #quick-save-form select, #quick-save-submit')
    .evaluateAll(controls => controls.map(control => control.disabled)), [true, true, true, true]);
  const popupResult = await popup.evaluate(async () => {
    const { saveQuickBookmark } = await import('./features/quick-save/quickSaveActions.js');
    const sourceTab = await chrome.tabs.create({ url: 'about:blank', active: false });
    const result = await saveQuickBookmark({ name: 'Popup smoke', url: 'https://popup.test' });
    const tabStillOpen = await chrome.tabs.get(sourceTab.id).then(() => true, () => false);
    return { ...result, tabStillOpen };
  });
  assert.equal(popupResult.reason, null);
  assert.equal(popupResult.tabStillOpen, true);
  await page.getByRole('link', { name: /Popup smoke/ }).waitFor({ state: 'visible' });
  await popup.close();

  // Exercise ZIP generation and restoration under the real Manifest V3 CSP.
  const backupDownload = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { saveLocalVideo } = await import('./platform/images/localVideos.js');
    const { getState, setState, requirePersistence } = await import('./state/appStore.js');
    const local = await saveLocalVideo(new File(['extension video fixture'], 'smoke.webm', { type: 'video/webm' }));
    const data = getState().data;
    await setState({ data: { settings: { ...data.settings, theme: {
      ...data.settings.theme, backgroundDefault: true,
      backgroundMedia: [{ id: 'smoke-video', type: 'video', local, source: 'local' }]
    } } } });
    await requirePersistence();
    await (await import('./features/settings/backupActions.js')).exportBackup();
  });
  const downloaded = await backupDownload;
  assert.match(downloaded.suggestedFilename(), /\.zip$/);
  const zipBytes = readFileSync(await downloaded.path());
  assert.equal(zipBytes.readUInt32LE(0), 0x04034b50);
  const restored = await page.evaluate(async bytes => {
    const { clearAllLocalData } = await import('./state/appStore.js');
    await clearAllLocalData();
    return (await import('./features/settings/backupActions.js')).importBackup(
      new File([new Uint8Array(bytes)], 'smoke.zip', { type: 'application/zip' }));
  }, [...zipBytes]);
  assert.equal(restored, true);
  await page.reload();
  await page.getByRole('link', { name: /Popup smoke/ }).waitFor({ state: 'visible' });
  assert.deepEqual(await page.evaluate(async () => {
    const { getState } = await import('./state/appStore.js');
    const { resolveLocalVideo, getLocalVideoName } = await import('./platform/images/localVideos.js');
    const local = getState().data.settings.theme.backgroundMedia[0].local;
    return { name: getLocalVideoName(local), text: await (await fetch(resolveLocalVideo(local))).text() };
  }), { name: 'smoke.webm', text: 'extension video fixture' });

  assert.deepEqual(errors, []);
  console.log(`Extension smoke passed: ${manifest.version}, new tab, popup save, reload, shortcuts and ZIP video backup.`);
} finally {
  await context.close();
}
