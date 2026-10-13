import { expect, test } from './helpers/test.js';
import { expectAppReady } from './helpers/appReady.js';

const preference = page => page.evaluate(() => new Promise(resolve => {
  chrome.storage.local.get('newdesktabDailyTips', result => resolve(result.newdesktabDailyTips?.enabled !== false));
}));
async function openHelp(page) {
  await page.keyboard.press('KeyS');
  await page.locator('[data-tab="settings-modal-tab-help"]').click();
  await expect(page.locator('#settings-daily-tips')).toBeEnabled();
}
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html?tips=1');
  await expectAppReady(page);
  await openHelp(page);
});

test('daily tips stay pending until Save and Cancel discards the change', async ({ page }) => {
  const toggle = page.locator('#settings-daily-tips');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(page.locator('#settings-modal-save')).toBeVisible();
  await expect(page.locator('#settings-modal-save')).toBeEnabled();
  expect(await preference(page)).toBe(true);
  await page.locator('#settings-modal-cancel').click();
  await page.locator('#alert-modal-accept').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  expect(await preference(page)).toBe(true);
  await openHelp(page);
  await expect(toggle).toBeChecked();
  await expect(page.locator('#settings-modal-save')).toBeHidden();
  await toggle.uncheck();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  expect(await preference(page)).toBe(false);
  await page.reload();
  await expectAppReady(page);
  await openHelp(page);
  await expect(toggle).not.toBeChecked();
});

test('a failed daily-tip write retains the draft and a second Save succeeds', async ({ page }) => {
  await page.locator('#settings-daily-tips').uncheck();
  await page.evaluate(() => {
    const original = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      if (items.newdesktabDailyTips) {
        chrome.storage.local.set = original;
        chrome.runtime.lastError = { message: 'Simulated daily tip write failure' };
        callback?.();
        chrome.runtime.lastError = null;
      } else original(items, callback);
    };
  });
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal-save')).toBeEnabled();
  await expect(page.locator('#settings-modal')).toBeVisible();
  await expect(page.locator('#settings-daily-tips')).not.toBeChecked();
  expect(await preference(page)).toBe(true);
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  expect(await preference(page)).toBe(false);
});

test('changing the preference back removes Save and does not write application settings', async ({ page }) => {
  await page.evaluate(() => {
    window.settingsWrites = 0;
    const original = chrome.storage.local.set;
    chrome.storage.local.set = (items, callback) => {
      if (items.settings) window.settingsWrites++;
      original(items, callback);
    };
  });
  const toggle = page.locator('#settings-daily-tips');
  await toggle.uncheck();
  await toggle.check();
  await expect(page.locator('#settings-modal-save')).toBeHidden();
  await toggle.uncheck();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  expect(await preference(page)).toBe(false);
  expect(await page.evaluate(() => window.settingsWrites)).toBe(0);
});
