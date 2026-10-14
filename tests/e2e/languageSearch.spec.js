import { readFileSync } from 'node:fs';
import { expect, test } from './helpers/test.js';
import { expectAppReady } from './helpers/appReady.js';
import { LANGUAGE_CATALOG } from '../../src/domain/settings/languageCatalog.js';

async function open(page) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.mouse.move(5, page.viewportSize().height / 2);
  await page.locator('#settings').click();
}

const trigger = page => page.locator('.settings-language .custom-select-trigger');
const search = page => page.locator('#language-select-menu input');

test('finds languages by country, accents and native name, with a fixed search header', async ({ page }) => {
  await open(page);
  await page.locator('#language-select').selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await trigger(page).click();
  await expect(search(page)).toBeFocused();
  await expect(search(page)).toHaveAttribute('placeholder', 'Buscar idioma o país');
  await expect(page.locator('#language-select-listbox [role="option"]')).toHaveCount(53);
  await page.locator('#language-select-menu').evaluate(async popup => {
    await Promise.all(popup.getAnimations().map(animation => animation.finished));
  });
  const headerBefore = await search(page).boundingBox();
  await page.locator('#language-select-listbox').evaluate(list => { list.scrollTop = list.scrollHeight; });
  expect((await search(page).boundingBox()).y).toBe(headerBefore.y);
  await search(page).fill('Alemania');
  await expect(page.locator('#language-select-listbox [role="option"]:visible')).toHaveText('Deutsch✓');
  await page.screenshot({ path: 'test-results/language-search-country.png', animations: 'disabled' });
  await search(page).fill('japones');
  await expect(page.locator('#language-select-listbox [role="option"]:visible')).toHaveText('日本語✓');
  await search(page).fill('日本');
  await search(page).press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(trigger(page)).toHaveText('日本語');
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await expect(search(page)).toHaveValue('');
  await search(page).fill('zzzzzz');
  await expect(page.locator('#language-select-menu [role="status"]')).toBeVisible();
  await search(page).press('Enter');
  await expect(page.locator('#language-select')).toHaveValue('ja');
  await search(page).press('Escape');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await expect(trigger(page)).toBeFocused();
});

test('every language loads its interface, native label and manual without network services', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  for (const language of LANGUAGE_CATALOG) {
    const dictionary = JSON.parse(readFileSync(`src/lang/${language.code}.json`, 'utf8'));
    await page.locator('#language-select').selectOption(language.code);
    await expect(page.locator('html')).toHaveAttribute('lang', language.code.replaceAll('_', '-'));
    await expect(page.locator('html')).toHaveAttribute('dir', language.direction ?? 'ltr');
    await expect(trigger(page)).toHaveText(language.name);
    await expect(page.locator('#settings-modal-tab-general > h2')).toHaveText(dictionary.settingsModal.general.title);
    expect(await page.evaluate(async () => {
      const { t } = await import('/src/platform/i18n/i18n.js');
      return t('manual.title');
    })).not.toBe('manual.title');
  }
  expect(errors).toEqual([]);
});

test('localized keyboard queries find help in all 52 languages including Chinese and Thai', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  for (const language of LANGUAGE_CATALOG) {
    const manualCode = language.code === 'es_419' ? 'es' : language.code;
    const dictionary = JSON.parse(readFileSync(`src/lang/manual/${manualCode}.json`, 'utf8'));
    await page.locator('[data-tab="settings-modal-tab-general"]').click();
    await page.locator('#language-select').selectOption(language.code);
    await expect(page.locator('html')).toHaveAttribute('lang', language.code.replaceAll('_', '-'));
    await page.locator('[data-tab="settings-modal-tab-help"]').click();
    await page.locator('.settings-help-search input').fill(dictionary.demo.labels.keyboardQuery);
    await expect(page.locator('.settings-help-results [data-manual-topic="keyboard"]')).toBeVisible();
  }
});

for (const theme of ['dark', 'light']) {
  test(`searchable language menu fits a small window in ${theme} mode and saves the choice`, async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 660 });
    await page.emulateMedia({ colorScheme: theme });
    await open(page);
    await page.locator('#language-select').selectOption('es');
    await trigger(page).click();
    await expect(search(page)).toBeVisible();
    const bounds = await page.locator('#language-select-menu').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(892);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(652);
    await page.screenshot({ path: `test-results/language-menu-${theme}.png`, animations: 'disabled' });
    await search(page).fill('France');
    await search(page).press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await page.locator('#settings-modal-save').click();
    await expect(page.locator('#settings-modal')).toBeHidden();
    await page.reload();
    await expectAppReady(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
}
