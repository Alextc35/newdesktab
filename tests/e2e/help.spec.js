import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

async function start(page, { tips = false, fresh = false } = {}) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto(`/tests/browser-harness.html?${tips ? 'tips=1&' : ''}${fresh ? 'fresh=1' : ''}`);
  await expectAppReady(page);
}

async function information(page) {
  await page.evaluate(() => document.getElementById('settings').click());
  await page.locator('[data-tab="settings-modal-tab-info"]').click();
}

const storedTips = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-local')).newdesktabDailyTips);
const timing = page => page.locator('.daily-tip-progress-fill').evaluate(element => {
  const animation = element.getAnimations().find(item => item.id === 'daily-tip-countdown');
  return { time: animation?.currentTime, state: animation?.playState,
    scale: new DOMMatrix(getComputedStyle(element).transform).a };
});

test('Information opens a searchable manual and all sections have instructions', async ({ page }) => {
  await start(page);
  await information(page);
  await page.locator('#settings-open-manual').click();
  const manual = page.locator('#manual-modal');
  await expect(manual).toBeVisible();
  await expect(page.locator('#manual-search')).toBeFocused();
  await expect(manual.locator('.manual-topic')).toHaveCount(24);
  await page.evaluate(() => document.documentElement.dataset.interfaceTheme = 'dark');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/manual-index-dark.png' });
  await page.locator('#manual-search').fill('Tab arrows');
  await manual.locator('[data-manual-topic="keyboard"]').click();
  await expect(manual.locator('.manual-article')).toHaveAttribute('data-topic', 'keyboard');
  await expect(manual.locator('.manual-steps li')).toHaveCount(3);
  await expect(page.locator('#manual-back')).toBeFocused();
  await page.locator('#manual-back').click();
  await expect(page.locator('#manual-search')).toHaveValue('Tab arrows');
  await page.locator('#manual-search').fill('xxxxxxxxxxxx');
  await expect(manual.locator('.manual-empty')).toBeVisible();
  await page.locator('#manual-search').fill('');
  for (const id of await manual.locator('.manual-index .manual-topic').evaluateAll(items => items.map(item => item.dataset.manualTopic))) {
    await manual.locator(`.manual-index [data-manual-topic="${id}"]`).click();
    await expect(manual.locator('.manual-article')).toHaveAttribute('data-topic', id);
    await expect(manual.locator('.manual-steps li')).toHaveCount(3);
    await expect(manual.locator('.manual-note p')).not.toBeEmpty();
    await page.locator('#manual-back').click();
  }
  await page.keyboard.press('Escape');
  await expect(manual).toBeHidden();
  await expect(page.locator('#settings-modal-tab-info')).toBeVisible();
});

test('Information suggests useful answers as you type and keeps the query when returning', async ({ page }) => {
  await start(page);
  await information(page);
  const input = page.locator('#settings-manual-search');
  const results = page.locator('.settings-help-results');
  await expect(results.locator('button')).toHaveCount(3);
  await input.fill('how can I recover a deleted bookmark');
  await expect(results.locator('button').first()).toHaveAttribute('data-manual-topic', 'trash');
  await expect(results.locator('button span').first()).not.toBeEmpty();
  await page.evaluate(() => document.documentElement.dataset.interfaceTheme = 'dark');
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/help-search-dark.png' });
  await input.press('ArrowDown');
  await expect(results.locator('button').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.manual-article')).toHaveAttribute('data-topic', 'trash');
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('how can I recover a deleted bookmark');
  await input.fill('astronaut volcano submarine');
  await expect(results.locator('button')).toHaveCount(0);
  await input.press('Enter');
  await expect(page.locator('#manual-modal')).toBeHidden();
  await input.press('Escape');
  await expect(input).toHaveValue('');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await expect(results.locator('button')).toHaveCount(3);
});

test('help suggestions resolve natural questions in all available languages', async ({ page }) => {
  await start(page);
  await information(page);
  const input = page.locator('#settings-manual-search');
  for (const [language, query] of [['es', 'quiero navegar sin raton'], ['es_419', 'quiero navegar sin raton'],
    ['pt_BR', 'quero navegar sem mouse'], ['en', 'navigate without a mouse']]) {
    await page.evaluate(async language => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language }), language);
    await input.fill(query);
    await expect(page.locator('.settings-help-result').first()).toHaveAttribute('data-manual-topic', 'keyboard');
    await input.press('Enter');
    await expect(page.locator('.manual-article')).toHaveAttribute('data-topic', 'keyboard');
    await page.locator('#manual-back').click();
    await page.locator('#manual-search').fill(query);
    await expect(page.locator('.manual-index [data-manual-topic]').first()).toHaveAttribute('data-manual-topic', 'keyboard');
    await page.keyboard.press('Escape');
  }
  await input.fill('how do I change the size of a tile');
  await input.press('Enter');
  await expect(page.locator('.manual-article')).toHaveAttribute('data-topic', 'resizing');
  await page.setViewportSize({ width: 390, height: 600 });
  await expect(page.locator('#manual-modal')).toBeVisible();
  await page.locator('#manual-back').click();
  await page.locator('#manual-search').fill('how do I change the size of a tile');
  const overflow = await page.locator('.manual-body').evaluate(element => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(false);
});

test('welcome links open the right section and return to the same guide step', async ({ page }) => {
  await start(page, { fresh: true });
  await page.locator('#onboarding-next').click();
  const link = page.locator('#onboarding-description [data-manual-topic="resizing"]');
  await expect(link).toHaveCSS('text-decoration-line', 'underline');
  await expect(link).toHaveCSS('display', 'inline');
  await link.click();
  await expect(page.locator('.manual-article')).toHaveAttribute('data-topic', 'resizing');
  await expect(page.locator('#onboarding-modal')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('#onboarding-modal')).toHaveAttribute('data-step', 'edit');
  await expect(page.locator('#onboarding-modal')).not.toHaveAttribute('inert');
  const count = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data.bookmarks.length);
  expect(count).toBe(0);
});

test('manual translates live, fits small windows and keeps scrolling inside its panel', async ({ page }) => {
  await start(page);
  await information(page);
  await page.locator('.settings-help-result[data-manual-topic="keyboard"]').click();
  for (const [language, title] of [['es', 'Navegar con el teclado'], ['es_419', 'Navegar con el teclado'], ['pt_BR', 'Navegar com o teclado'], ['en', 'Navigate with the keyboard']]) {
    await page.evaluate(async language => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language }), language);
    await expect(page.locator('.manual-article-title')).toHaveText(title);
  }
  await page.evaluate(() => document.documentElement.dataset.interfaceTheme = 'light');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/manual-article-light.png' });
  await page.setViewportSize({ width: 390, height: 600 });
  await expect(page.locator('#manual-modal')).toBeVisible();
  await expect(page.locator('#flash-container')).not.toHaveText(/Panel hidden/);
  const layout = await page.locator('.manual-card').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const body = element.querySelector('.manual-body');
    return { left: rect.left, right: rect.right, bottom: rect.bottom,
      scrollWidth: body.scrollWidth, width: body.clientWidth, canScroll: body.scrollHeight > body.clientHeight };
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(390);
  expect(layout.bottom).toBeLessThanOrEqual(600);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.canScroll).toBe(true);
  await page.locator('.manual-body').evaluate(element => element.scrollTop = element.scrollHeight);
  await expect(page.locator('#manual-close')).toBeInViewport();
  await page.screenshot({ path: 'test-results/manual-mobile.png' });
});

test('daily tip appears once per day and opens its own manual section', async ({ page }) => {
  await start(page, { tips: true });
  const card = page.locator('#daily-tip');
  await expect(card).toBeVisible();
  const overflow = await card.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY }));
  expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.height);
  expect(overflow.overflowY).toBe('hidden');
  expect((await storedTips(page)).lastTopic).toBe('bookmarks');
  await page.locator('#daily-tip-read').click();
  await expect(card).toBeHidden();
  await expect(page.locator('.manual-article')).toHaveAttribute('data-topic', 'bookmarks');
  await page.reload();
  await expectAppReady(page);
  await page.waitForTimeout(1700);
  await expect(card).toBeHidden();
  await page.evaluate(() => {
    const data = JSON.parse(sessionStorage.getItem('newdesktab-test-local'));
    data.newdesktabDailyTips.day = '2000-01-01';
    sessionStorage.setItem('newdesktab-test-local', JSON.stringify(data));
  });
  await page.reload();
  await expectAppReady(page);
  await expect(card).toBeVisible();
  expect((await storedTips(page)).lastTopic).toBe('quick-save');
});

test('countdown pauses for hover, focus and dialogs, then departs with an empty bar', async ({ page }) => {
  await start(page, { tips: true });
  const card = page.locator('#daily-tip');
  await expect(card).toBeVisible();
  await expect.poll(async () => (await timing(page)).state).toBe('running');
  expect(await page.locator('.daily-tip-progress-fill').evaluate(element => element.getAnimations()[0].effect.getTiming().duration)).toBe(20_000);
  await card.hover();
  await expect.poll(async () => (await timing(page)).state).toBe('paused');
  const hovered = await timing(page);
  await page.waitForTimeout(200);
  expect((await timing(page)).time).toBeCloseTo(hovered.time, 1);
  await page.mouse.move(0, 0);
  await page.locator('#daily-tip-read').focus();
  await expect.poll(async () => (await timing(page)).state).toBe('paused');
  await page.evaluate(() => document.activeElement.blur());
  await information(page);
  await expect(card).toBeHidden();
  await expect.poll(async () => (await timing(page)).state).toBe('paused');
  await page.locator('#settings-modal-cancel').click();
  await expect(card).toBeVisible();
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await timing(page)).state).toBe('running');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/daily-tip-dark.png' });
  await card.evaluate(element => {
    const animation = element.querySelector('.daily-tip-progress-fill').getAnimations()[0];
    animation.finish();
  });
  await expect.poll(() => card.evaluate(element => element.getAnimations().some(animation => animation.id === 'daily-tip-exit'))).toBe(true);
  await card.evaluate(element => {
    const animation = element.getAnimations().find(item => item.id === 'daily-tip-exit');
    animation.pause();
    animation.currentTime = 180;
  });
  expect((await timing(page)).scale).toBeCloseTo(0, 4);
  const departing = await card.evaluate(element => ({
    x: new DOMMatrix(getComputedStyle(element).transform).m41,
    opacity: Number(getComputedStyle(element).opacity),
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight
  }));
  expect(departing.x).toBeGreaterThan(0);
  expect(departing.opacity).toBeGreaterThan(0);
  expect(departing.opacity).toBeLessThan(1);
  expect(departing.pageWidth).toBe(1280);
  expect(departing.pageHeight).toBe(800);
  await card.evaluate(element => element.getAnimations().find(item => item.id === 'daily-tip-exit').finish());
  await expect(card).toBeHidden();
});

test('tips wait for the welcome and can be disabled permanently from Information', async ({ page }) => {
  await start(page, { tips: true, fresh: true });
  await expect(page.locator('#onboarding-modal')).toBeVisible();
  await page.waitForTimeout(1600);
  expect(await storedTips(page)).toBeUndefined();
  await page.locator('#onboarding-skip').click();
  await expect(page.locator('#daily-tip')).toBeVisible();
  await information(page);
  await page.locator('#settings-daily-tips').uncheck();
  await expect.poll(async () => (await storedTips(page)).enabled).toBe(false);
  await page.locator('#settings-modal-cancel').click();
  await expect(page.locator('#daily-tip')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await page.waitForTimeout(1700);
  await expect(page.locator('#daily-tip')).toBeHidden();
  await information(page);
  await expect(page.locator('#settings-daily-tips')).not.toBeChecked();
});
