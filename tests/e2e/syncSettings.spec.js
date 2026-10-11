import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

async function start(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(() => document.getElementById('settings').click());
}

const mode = page => page.evaluate(async () => (await import('/src/state/appStore.js')).getStorageMode());
const syncTab = page => page.locator('[data-tab="settings-modal-tab-sync"]').click();

test('canceling the localized Sync confirmation keeps Local active', async ({ page }) => {
  await start(page);
  for (const [language, text] of [['en', 'Switch from Local to Synced?'], ['es', '¿Cambiar de Local a Sincronizado?'],
    ['es_419', '¿Cambiar de Local a Sincronizado?'], ['pt_BR', 'Mudar de Local para Sincronizado?']]) {
    await page.locator('[data-tab="settings-modal-tab-general"]').click();
    await page.locator('#language-select').selectOption(language);
    await syncTab(page);
    await page.locator('#storage-mode-sync').click();
    await expect(page.locator('#alert-modal-title')).toContainText(text);
    expect(await mode(page)).toBe('local');
    await page.keyboard.press('Escape');
    await expect(page.locator('#storage-mode-local')).toBeChecked();
  }
});

test('accepting Sync applies immediately and preserves unrelated unsaved edits', async ({ page }) => {
  await start(page);
  await page.locator('#settings-show-recycle-bin').uncheck();
  await syncTab(page);
  await page.locator('#storage-mode-sync').click();
  await page.locator('#alert-modal-accept').click();
  await expect.poll(() => mode(page)).toBe('sync');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await expect(page.locator('#settings-modal-save')).toBeEnabled();
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data.settings.showRecycleBin)).toBe(true);
  await page.locator('[data-tab="settings-modal-tab-general"]').click();
  await expect(page.locator('#settings-show-recycle-bin')).not.toBeChecked();
  await page.locator('#settings-modal-cancel').click();
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  expect(await mode(page)).toBe('sync');
  await page.reload();
  await expectAppReady(page);
  expect(await mode(page)).toBe('sync');
});

test('existing synchronized settings become the current settings draft immediately', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    const { data } = getState();
    chrome.storage.sync.set({ ...data, bookmarks: [], settings: { ...data.settings, language: 'es', showRecycleBin: false } });
  });
  await syncTab(page);
  await page.locator('#storage-mode-sync').click();
  await page.locator('#alert-modal-accept').click();
  await expect.poll(() => mode(page)).toBe('sync');
  await expect(page.locator('#settings-modal-save')).toBeHidden();
  await expect(page.locator('#storage-mode-sync')).toBeChecked();
  await page.locator('[data-tab="settings-modal-tab-general"]').click();
  await expect(page.locator('#language-select')).toHaveValue('es');
  await expect(page.locator('#settings-show-recycle-bin')).not.toBeChecked();
  await page.locator('#settings-modal-cancel').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(page.locator('#alert-modal')).toBeHidden();
  const data = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
  expect(data.settings.language).toBe('es');
  expect(data.bookmarks).toHaveLength(0);
});

test('failed Sync writes keep the Local choice and the settings dialog usable', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    chrome.storage.sync.set = (_items, callback) => {
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      callback();
      chrome.runtime.lastError = null;
    };
  });
  await syncTab(page);
  await page.locator('#storage-mode-sync').click();
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('.flash-error').last()).toHaveText('Could not change storage mode');
  expect(await mode(page)).toBe('local');
  await expect(page.locator('#storage-mode-local')).toBeChecked();
  await expect(page.locator('#settings-modal-cancel')).toBeEnabled();
});
