import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

async function start(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(() => document.getElementById('settings').click());
  await page.locator('[data-tab="settings-modal-tab-help"]').click();
  await page.locator('#settings-open-manual').click();
}

async function openTopic(page, topic) {
  if (await page.locator('.manual-reader').isVisible()) await page.locator('#manual-back').click();
  await page.locator(`.manual-index [data-manual-topic="${topic}"]`).click();
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-topic', topic);
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-ready', 'true');
}

async function seek(page, time) {
  await page.locator('.manual-demo-progress').evaluate((element, time) => {
    element.value = String(time);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, time);
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-time', String(time));
}

const tileSize = page => page.locator('.manual-demo [data-demo-item="Gmail"]').evaluate(element => ({
  width: parseFloat(getComputedStyle(element).width), height: parseFloat(getComputedStyle(element).height)
}));

test('every section has a seekable demonstration and leaves real data untouched', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  const topics = await page.locator('.manual-index .manual-topic').evaluateAll(nodes => nodes.map(node => node.dataset.manualTopic));
  const before = await page.evaluate(() => sessionStorage.getItem('newdesktab-test-local'));
  for (const topic of topics) {
    await openTopic(page, topic);
    await expect(page.locator('.manual-demo-step-buttons button')).toHaveCount(3);
    await expect(page.locator('.manual-demo-scene')).toHaveAttribute('inert', '');
    for (const step of [1, 2, 3]) {
      await page.locator('.manual-demo-step-buttons button').nth(step - 1).click();
      await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-step', String(step));
      await expect(page.locator('.manual-demo-caption')).not.toBeEmpty();
      await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-playing', 'false');
    }
    await seek(page, 6300);
    await page.locator('.manual-demo').screenshot({ path: `test-results/manual-demo-${topic}.png` });
    await seek(page, 12000);
    await page.locator('.manual-demo').screenshot({ path: `test-results/manual-demo-${topic}-final.png` });
    const clipped = await page.locator('.manual-demo-scene').evaluate(scene => {
      const bounds = scene.getBoundingClientRect();
      return [...scene.querySelectorAll('.manual-demo-panel')]
        .filter(panel => Number(getComputedStyle(panel).opacity) > .9)
        .flatMap(panel => [panel, ...panel.querySelectorAll('.manual-demo-action')])
        .some(node => { const box = node.getBoundingClientRect(); return box.bottom > bounds.bottom + 1 || box.right > bounds.right + 1; });
    });
    expect(clipped, topic).toBe(false);
    expect(await page.evaluate(() => sessionStorage.getItem('newdesktab-test-local'))).toBe(before);
    await page.locator('#manual-back').click();
    expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.id.startsWith('manual-demo-')).length)).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('playback pauses, resumes, stops at the result and pauses when its dialog closes', async ({ page }) => {
  await start(page);
  await openTopic(page, 'movement');
  await expect.poll(async () => Number(await page.locator('.manual-demo').getAttribute('data-demo-time'))).toBeGreaterThan(100);
  await page.locator('.manual-demo-play').click();
  const paused = await page.locator('.manual-demo').getAttribute('data-demo-time');
  await page.waitForTimeout(180);
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-time', paused);
  await page.locator('.manual-demo-play').click();
  await expect.poll(async () => Number(await page.locator('.manual-demo').getAttribute('data-demo-time'))).toBeGreaterThan(Number(paused));
  await seek(page, 11900);
  await page.locator('.manual-demo-play').click();
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-time', '12000');
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-playing', 'false');
  await page.waitForTimeout(180);
  await expect(page.locator('.manual-demo-progress')).toHaveValue('12000');
  await page.locator('.manual-demo-replay').click();
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-playing', 'true');
  await page.keyboard.press('Escape');
  const closed = await page.locator('.manual-demo').getAttribute('data-demo-time');
  await page.waitForTimeout(180);
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-time', closed);
});

test('resize modes share a continuous diagonal and snap both dimensions at 50 percent', async ({ page }) => {
  await start(page);
  await openTopic(page, 'resizing');
  await seek(page, 0);
  await expect(page.locator('.manual-demo-item')).toHaveCount(2);
  await expect(page.locator('.manual-demo-trash')).toBeVisible();
  await expect(page.locator('.manual-demo [data-demo-item="Gmail"]')).toBeVisible();
  await seek(page, 5690);
  expect(await tileSize(page)).toEqual({ width: 98, height: 62 });
  const cursorBefore = await page.locator('.manual-demo-pointer').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).e);
  await seek(page, 5710);
  expect(await tileSize(page)).toEqual({ width: 210, height: 136 });
  const cursorAfter = await page.locator('.manual-demo-pointer').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).e);
  expect(cursorAfter - cursorBefore).toBeCloseTo(112 * 20 / 3000, 1);
  await page.locator('.manual-demo-variant select').selectOption('smooth');
  await expect(page.locator('.manual-demo-item')).toHaveCount(2);
  await seek(page, 5700);
  expect(await tileSize(page)).toEqual({ width: 154, height: 99 });
  await seek(page, 7200);
  const result = await tileSize(page);
  await seek(page, 12000);
  expect(await tileSize(page)).toEqual(result);
  expect(result).toEqual({ width: 210, height: 136 });
  await page.locator('.manual-demo').screenshot({ path: 'test-results/manual-demo-resizing-result.png' });
  await openTopic(page, 'drag-modes');
  for (const mode of ['none', 'relocate', 'cascade']) {
    await page.locator('.manual-demo-variant select').selectOption(mode);
    await seek(page, 12000);
    const bounds = await page.locator('.manual-demo [data-demo-item="Gmail"]').evaluate(element => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return [matrix.e, matrix.f];
    });
    expect(bounds).toEqual(mode === 'none' ? [0, 74] : [224, 0]);
  }
});

test('cursor clicks follow translated buttons and style presets affect new examples only', async ({ page }) => {
  await start(page);
  for (const language of ['en', 'es', 'pt_BR']) {
    await page.evaluate(async language => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language }), language);
    await openTopic(page, 'bookmarks');
    await seek(page, 9400);
    const gap = await page.locator('.manual-demo-scene').evaluate(scene => {
      const pointer = scene.querySelector('.manual-demo-pointer').getBoundingClientRect();
      const button = scene.querySelector('.manual-demo-action').getBoundingClientRect();
      return Math.hypot(pointer.x - (button.x + button.width / 2), pointer.y - (button.y + button.height / 2));
    });
    expect(gap).toBeLessThan(1);
    await openTopic(page, 'presets');
    await seek(page, 12000);
    const colors = await page.locator('.manual-demo').evaluate(demo => [
      getComputedStyle(demo.querySelector('[data-demo-item="Gmail"]')).backgroundColor,
      getComputedStyle(demo.querySelector('[data-demo-item="New DeskTab"]:last-of-type')).backgroundColor
    ]);
    const light = await page.evaluate(() => (getComputedStyle(document.documentElement).colorScheme === 'light'
      || (document.documentElement.dataset.interfaceTheme === 'system' && matchMedia('(prefers-color-scheme: light)').matches)));
    expect(colors[0]).toBe(light ? 'rgb(231, 238, 247)' : 'rgb(23, 38, 59)');
    expect(colors[1]).toBe('rgb(106, 61, 176)');
  }
});

test('keyboard demonstrations move illustrative focus without stealing actual focus', async ({ page }) => {
  await start(page);
  await openTopic(page, 'keyboard');
  const progress = page.locator('.manual-demo-progress');
  await progress.focus();
  await progress.press('Home');
  await expect(progress).toBeFocused();
  await seek(page, 2600);
  await expect(page.locator('.manual-demo-trash')).toHaveClass(/is-demo-focused/);
  await seek(page, 5200);
  await expect(page.locator('.manual-demo [data-demo-item="Gmail"]')).toHaveClass(/is-demo-focused/);
  await seek(page, 6700);
  await expect(page.locator('.manual-demo [data-demo-item="YouTube"]')).toHaveClass(/is-demo-focused/);
  await seek(page, 9700);
  await expect(page.locator('.manual-demo-panel')).toHaveCSS('opacity', '0');
  await expect(page.locator('.manual-demo [data-demo-item="YouTube"]')).toHaveClass(/is-demo-focused/);
  await page.locator('.manual-demo').screenshot({ path: 'test-results/manual-demo-keyboard-return.png' });
  await seek(page, 10190);
  await expect(page.locator('.manual-demo [data-demo-item="YouTube"]')).toHaveClass(/is-demo-focused/);
  await seek(page, 10200);
  await expect(page.locator('.manual-demo-key')).toHaveText('Esc');
  await expect(page.locator('.manual-demo-key')).toHaveCSS('opacity', '1');
  await expect(page.locator('.manual-demo .is-demo-focused')).toHaveCount(0);
  await expect(progress).toBeFocused();
  await progress.press('End');
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-time', '12000');
  await expect(page.locator('.manual-demo .is-demo-focused')).toHaveCount(0);
});

test('previous and next sections let readers review demos in order', async ({ page }) => {
  await start(page);
  await openTopic(page, 'bookmarks');
  await expect(page.locator('.manual-sequence-previous')).toHaveCount(0);
  await expect(page.locator('.manual-sequence-next')).toHaveAttribute('data-manual-topic', 'quick-save');
  await page.locator('.manual-sequence-next').click();
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-topic', 'quick-save');
  await page.locator('.manual-sequence-previous').click();
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-topic', 'bookmarks');
  await expect(page.locator('#manual-back')).toBeFocused();
  await openTopic(page, 'keyboard');
  await expect(page.locator('.manual-sequence-next')).toHaveAttribute('data-manual-topic', 'shortcuts');
  await expect(page.locator('.manual-related [data-manual-topic]')).toHaveCount(1);
  await expect(page.locator('.manual-related [data-manual-topic]')).toHaveAttribute('data-manual-topic', 'selection');
  await openTopic(page, 'resizing');
  await expect(page.locator('.manual-related')).toHaveCount(0);
});

test('learning starts with a daily tip, searches a prefix and opens the matching instructions', async ({ page }) => {
  await start(page);
  for (const language of ['es', 'es_419', 'en', 'pt_BR']) {
    await page.evaluate(async language => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language }), language);
    await openTopic(page, 'learning');
    const scene = page.locator('.manual-demo-scene');
    const panels = scene.locator('.manual-demo-panel');
    const tip = panels.nth(0);
    const manual = panels.nth(1);
    const article = panels.nth(2);
    const search = manual.locator('.manual-demo-field').first();
    const result = manual.locator('.manual-demo-row').last();
    await seek(page, 1400);
    await expect(tip).toHaveCSS('opacity', '1');
    await expect(manual).toHaveCSS('opacity', '0');
    await expect(article).toHaveCSS('opacity', '0');
    await seek(page, 3800);
    const gap = await scene.evaluate(scene => {
      const pointer = scene.querySelector('.manual-demo-pointer').getBoundingClientRect();
      const read = scene.querySelector('.manual-demo-panel .manual-demo-action').getBoundingClientRect();
      return Math.hypot(pointer.x - (read.x + read.width / 2), pointer.y - (read.y + read.height / 2));
    });
    expect(gap).toBeLessThan(1);
    await seek(page, 4300);
    expect(await tip.evaluate(node => new DOMMatrix(getComputedStyle(node).transform).e)).toBeGreaterThan(0);
    await expect(manual).toHaveCSS('opacity', '0');
    await seek(page, 4800);
    expect(await tip.evaluate(node => Number(getComputedStyle(node).opacity))).toBeLessThan(.001);
    await seek(page, 5300);
    await expect(manual).toHaveCSS('opacity', '1');
    await expect(search).toHaveText('');
    await expect(result).toHaveCSS('opacity', '0');
    await seek(page, 6800);
    await expect(search).toHaveText(language === 'en' ? 'key' : 'tec');
    await expect(result).toHaveCSS('opacity', '0');
    await seek(page, 7500);
    await expect(search).toHaveText(language === 'en' ? 'keyb' : 'tecl');
    await expect(result).toHaveCSS('opacity', '1');
    const title = await result.locator('.manual-demo-label').textContent();
    await page.locator('.manual-demo').screenshot({ path: `test-results/manual-demo-learning-${language}-search.png` });
    await seek(page, 9700);
    await expect(result).toHaveClass(/is-demo-active/);
    await seek(page, 12000);
    await expect(tip).toHaveCSS('opacity', '0');
    await expect(manual).toHaveCSS('opacity', '0');
    await expect(article).toHaveCSS('opacity', '1');
    await expect(article.locator('.manual-demo-panel-title')).toHaveText(title);
    await expect(article.locator('p')).not.toBeEmpty();
    await expect(page.locator('.manual-article')).toHaveAttribute('data-topic', 'learning');
    await page.locator('.manual-demo').screenshot({ path: `test-results/manual-demo-learning-${language}-article.png` });
    // Rewinding after the animated parent moves must still put the click on its button.
    await seek(page, 3800);
    const rewindGap = await scene.evaluate(scene => {
      const pointer = scene.querySelector('.manual-demo-pointer').getBoundingClientRect();
      const read = scene.querySelector('.manual-demo-panel .manual-demo-action').getBoundingClientRect();
      return Math.hypot(pointer.x - (read.x + read.width / 2), pointer.y - (read.y + read.height / 2));
    });
    expect(rewindGap).toBeLessThan(1);
  }
});

test('compact demonstration narrows the desktop into an ordered list in either theme', async ({ page }) => {
  await start(page);
  const margins = [];
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.interfaceTheme = theme; }, theme);
    await openTopic(page, 'compact');
    await seek(page, 0);
    const gmail = page.locator('.manual-demo [data-demo-item="Gmail"]');
    const desktopLayout = () => gmail.evaluate(element => [element.offsetLeft, element.offsetTop, element.offsetWidth, element.offsetHeight]);
    const original = await desktopLayout();
    await seek(page, 6300);
    const layout = await page.locator('.manual-demo-scene').evaluate(scene => {
      const bounds = scene.getBoundingClientRect();
      const window = scene.querySelector('.manual-demo-compact-window').getBoundingClientRect();
      const items = [...scene.querySelectorAll('.manual-demo-item')];
      const rows = items.map(item => item.getBoundingClientRect());
      return {
        names: items.map(item => (item.querySelector('.bookmark-title, .manual-demo-folder-name') ?? item.lastElementChild).textContent),
        left: window.left - bounds.left, right: bounds.right - window.right,
        background: getComputedStyle(scene).backgroundColor,
        ordered: rows.every((row, index) => !index || row.top > rows[index - 1].bottom),
        contained: rows.every(row => row.left >= window.left && row.right <= window.right && row.bottom < window.bottom)
      };
    });
    expect(layout.names).toEqual(['Recycle bin', 'Work', 'Gmail', 'YouTube', 'New DeskTab']);
    expect(layout.left).toBeGreaterThan(0);
    expect(layout.left).toBeCloseTo(layout.right, 1);
    expect(layout.ordered).toBe(true);
    expect(layout.contained).toBe(true);
    await expect(page.locator('.manual-demo-toolbar')).toBeHidden();
    const alignment = await page.locator('.manual-demo-compact-surface').evaluate(surface => {
      const folder = surface.querySelector('.folder-visual').getBoundingClientRect();
      const folderName = surface.querySelector('.manual-demo-folder-name').getBoundingClientRect();
      const gmail = surface.querySelector('[data-demo-item="Gmail"] .bookmark-favicon').getBoundingClientRect();
      const gmailName = surface.querySelector('[data-demo-item="Gmail"] .bookmark-title').getBoundingClientRect();
      return [Math.abs(folder.left - gmail.left), Math.abs(folderName.left - gmailName.left)];
    });
    expect(alignment.every(gap => gap < 5)).toBe(true);
    margins.push(layout.background);
    await page.locator('.manual-demo').screenshot({ path: `test-results/manual-demo-compact-${theme}.png` });
    await seek(page, 12000);
    expect(await desktopLayout()).toEqual(original);
    await expect(page.locator('.manual-demo-compact-heading')).toBeHidden();
    await expect(page.locator('.manual-demo-toolbar')).toBeVisible();
  }
  expect(margins[0]).not.toBe(margins[1]);
});

test('reset restores browser defaults while delete clears only the illustrated workspace', async ({ page }) => {
  await start(page);
  // The browser language deliberately differs from the manual's chosen language.
  await page.evaluate(() => { chrome.i18n = { getUILanguage: () => 'pt-BR' }; });
  for (const [language, colorScheme] of [['en', 'dark'], ['es', 'light'], ['es_419', 'dark'], ['pt_BR', 'light']]) {
    await page.emulateMedia({ colorScheme });
    await page.evaluate(async language => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language }), language);
    await openTopic(page, 'data');
    const realState = () => page.evaluate(() => ({
      language: document.documentElement.lang,
      theme: document.documentElement.dataset.interfaceTheme,
      data: sessionStorage.getItem('newdesktab-test-local')
    }));
    const before = await realState();
    const scene = page.locator('.manual-demo-scene');
    const general = scene.locator('.manual-demo-panel').first();
    const tileStyles = () => scene.locator('.bookmark').evaluateAll(cards => cards.map(card => ({
      name: card.dataset.demoItem, x: card.offsetLeft, y: card.offsetTop,
      width: card.offsetWidth, height: card.offsetHeight,
      image: getComputedStyle(card).backgroundImage, color: getComputedStyle(card).backgroundColor,
      imageSize: getComputedStyle(card).backgroundSize, imagePosition: getComputedStyle(card).backgroundPosition
    })));
    await seek(page, 0);
    const styled = await tileStyles();
    const folderName = await scene.locator('.manual-demo-folder-name').textContent();
    expect(styled.map(({ width, height }) => [width, height])).toEqual([[210, 62], [98, 136], [98, 62]]);
    expect(styled.filter(card => card.image !== 'none')).toHaveLength(2);
    expect(styled.filter(card => card.image !== 'none').every(card => card.imageSize.split(',').every(size => size.trim() === 'cover')
      && card.imagePosition.split(',').every(position => position.trim() === '50% 50%'))).toBe(true);
    await expect(scene).toHaveClass(/is-demo-light/);
    await expect(scene.locator('.manual-demo-wallpaper')).toHaveCSS('opacity', '1');
    await expect(scene.locator('.manual-demo-toolbar')).toHaveCSS('color', 'rgb(23, 43, 64)');
    await page.locator('.manual-demo').screenshot({ path: `test-results/manual-demo-data-${language}-initial.png` });
    await seek(page, 3500);
    await expect(general.locator('.manual-demo-field')).toHaveText(language === 'en' ? 'Español' : 'English');
    await page.locator('.manual-demo').screenshot({ path: `test-results/manual-demo-data-${language}-settings.png` });
    await seek(page, 5900);
    expect(await tileStyles()).toEqual(styled);
    await expect(scene.locator('.manual-demo-folder-name')).toHaveText(folderName);
    await expect(scene.locator('.manual-demo-wallpaper')).toHaveCSS('opacity', '0');
    expect(await scene.evaluate(node => node.classList.contains('is-demo-light'))).toBe(colorScheme === 'light');
    await expect(scene.locator('.manual-demo-trash > span').last()).toHaveText('Lixeira');
    await page.locator('.manual-demo').screenshot({ path: `test-results/manual-demo-data-${language}-reset.png` });
    await seek(page, 7500);
    await expect(general.locator('.manual-demo-field')).toHaveText('Navegador');
    await expect(general.locator('.manual-demo-choice.is-demo-active')).toHaveText('Navegador');
    await seek(page, 9600);
    await expect(scene.locator('.manual-demo-panel').last()).toHaveCSS('opacity', '1');
    const fits = await scene.evaluate(scene => {
      const bounds = scene.getBoundingClientRect();
      return [...scene.querySelectorAll('.manual-demo-panel')]
        .filter(panel => Number(getComputedStyle(panel).opacity) > .9)
        .flatMap(panel => [panel, ...panel.querySelectorAll('.manual-demo-action')])
        .every(node => { const box = node.getBoundingClientRect(); return box.bottom <= bounds.bottom && box.right <= bounds.right; });
    });
    expect(fits).toBe(true);
    await page.locator('.manual-demo').screenshot({ path: `test-results/manual-demo-data-${language}-confirm.png` });
    await seek(page, 12000);
    const remaining = await scene.locator('.manual-demo-item').evaluateAll(items => items
      .filter(item => Number(getComputedStyle(item).opacity) > .9)
      .map(item => item.classList.contains('manual-demo-trash') ? 'trash' : item.dataset.demoItem));
    expect(remaining).toEqual(['trash']);
    for (const panel of await scene.locator('.manual-demo-panel').all()) await expect(panel).toHaveCSS('opacity', '0');
    await page.locator('.manual-demo').screenshot({ path: `test-results/manual-demo-data-${language}-empty.png` });
    expect(await realState()).toEqual(before);
    await seek(page, 0);
    expect(await tileStyles()).toEqual(styled);
    await expect(scene.locator('.manual-demo-wallpaper')).toHaveCSS('opacity', '1');
    await expect(scene).toHaveClass(/is-demo-light/);
  }
});

test('demos translate, fit narrow screens and respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await openTopic(page, 'resizing');
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-time', '3500');
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-playing', 'false');
  await page.locator('.manual-demo-play').click();
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-time', '7500');
  await page.waitForTimeout(180);
  await expect(page.locator('.manual-demo')).toHaveAttribute('data-demo-time', '7500');
  for (const [language, title] of [['es', 'Ver en acción'], ['en', 'See it in action'], ['pt_BR', 'Veja em ação'], ['es_419', 'Ver en acción']]) {
    await page.evaluate(async language => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language }), language);
    await expect(page.locator('.manual-demo-heading strong')).toHaveText(title);
    await expect(page.locator('.manual-demo-step-buttons button')).toHaveCount(3);
    expect(await page.locator('.manual-demo').textContent()).not.toMatch(/manual\.demo\.|editModal\.|settingsModal\./);
  }
  await page.setViewportSize({ width: 390, height: 700 });
  await expect(page.locator('#manual-modal')).toBeHidden();
  await page.setViewportSize({ width: 720, height: 700 });
  await expect(page.locator('#manual-modal')).toBeVisible();
  await seek(page, 12000);
  await expect(page.locator('.manual-demo')).toBeVisible();
  expect(await page.locator('.manual-card').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.locator('.manual-demo').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.locator('.manual-demo').screenshot({ path: 'test-results/manual-demo-mobile.png' });
});
