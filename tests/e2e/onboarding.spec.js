import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

const guide = page => page.locator('#onboarding-modal');

async function start(page, { fresh = true, width = 1280 } = {}) {
  await page.setViewportSize({ width, height: 800 });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto(`/tests/browser-harness.html${fresh ? '?fresh=1' : ''}`);
  await expectAppReady(page);
}

async function storedWelcome(page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-local')).newdesktabOnboarding);
}

test('welcomes a fresh profile once and skipping leaves its workspace untouched', async ({ page }) => {
  await start(page);
  await expect(guide(page)).toBeVisible();
  await expect(page.locator('#onboarding-next')).toBeFocused();
  await expect(page.locator('#onboarding-progress')).toHaveText('Step 1 of 5');
  await expect(page.locator('#bookmark-viewport')).toHaveAttribute('inert', '');
  await expect(page.locator('#onboarding-back')).toBeHidden();
  const preview = page.locator('.onboarding-demo');
  await expect(preview).toHaveAttribute('inert', '');
  await expect(preview.locator('.onboarding-demo-grid .folder-svg')).toHaveCount(2);
  await expect.poll(() => preview.locator('img').evaluateAll(images =>
    images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0)
  )).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#onboarding-hint [data-manual-topic="quick-save"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#onboarding-description [data-manual-topic="bookmarks"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#onboarding-skip')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#onboarding-next')).toBeFocused();
  await page.locator('#onboarding-skip').click();
  await expect(guide(page)).toBeHidden();
  await expect(page.locator('#bookmark-viewport')).not.toHaveAttribute('inert');
  await expect.poll(() => storedWelcome(page)).toEqual({ version: 1, status: 'dismissed' });
  const entities = await page.evaluate(async () => {
    const { data } = (await import('/src/state/appStore.js')).getState();
    return [data.bookmarks.length, data.folders.length, data.widgets.length];
  });
  expect(entities).toEqual([0, 0, 0]);
  await page.reload();
  await expectAppReady(page);
  await expect(guide(page)).toBeHidden();
});

test('finishes five steps and creates a real first bookmark', async ({ page }) => {
  await start(page);
  await expect(guide(page)).toBeVisible();
  const steps = ['start', 'edit', 'organize', 'style', 'ready'];
  const preview = page.locator('.onboarding-demo');
  const version = await page.evaluate(() => `v${chrome.runtime.getManifest().version}`);
  await expect(preview.locator('.onboarding-demo-version')).toHaveText(version);
  for (const [index, step] of steps.entries()) {
    await expect(guide(page)).toHaveAttribute('data-step', step);
    await expect(page.locator('#onboarding-progress')).toHaveText(`Step ${index + 1} of 5`);
    await expect(page.locator('#onboarding-title')).not.toBeEmpty();
    const brand = preview.locator('.onboarding-demo-default-brand');
    if (step === 'edit') await expect(brand).toBeVisible();
    else await expect(brand).toHaveCSS('opacity', index < 3 ? '1' : '0');
    await expect.poll(() => preview.evaluate(element =>
      getComputedStyle(element, '::before').opacity
    )).toBe(index < 3 ? '0' : '1');
    if (index < steps.length - 1) await page.locator('#onboarding-next').click();
  }
  await expect(page.locator('#onboarding-explore')).toBeVisible();
  await page.getByRole('button', { name: 'Add my first bookmark' }).click();
  await expect(guide(page)).toBeHidden();
  await expect(page.locator('#edit-bookmark-modal')).toBeVisible();
  await page.locator('#edit-bookmark-modal [data-field="name"]').fill('My first page');
  await page.locator('#edit-bookmark-modal [data-field="url"]').fill('https://first.internal');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('link', { name: /My first page/ })).toBeVisible();
  await expect.poll(() => storedWelcome(page)).toEqual({ version: 1, status: 'completed' });
  await page.reload();
  await expectAppReady(page);
  await expect(guide(page)).toBeHidden();
  await expect(page.getByRole('link', { name: /My first page/ })).toBeVisible();
});

test('reopens from Information in every language without losing a settings draft', async ({ page }) => {
  await start(page, { fresh: false });
  await page.keyboard.press('KeyS');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await page.locator('input[name="interface-theme"][value="dark"]').check();
  const locales = [
    ['es', 'Tus páginas. Tu propio espacio.', 'Volver a ajustes'],
    ['es_419', 'Tus páginas. Tu propio espacio.', 'Volver a configuración'],
    ['pt_BR', 'Suas páginas. Seu próprio espaço.', 'Voltar às configurações'],
    ['en', 'Your pages. Your own space.', 'Back to settings']
  ];
  for (const [locale, title, finish] of locales) {
    await page.locator('[data-tab="settings-modal-tab-general"]').click();
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale.replace('_', '-'));
    await page.locator('[data-tab="settings-modal-tab-info"]').click();
    await page.locator('#settings-open-guide').click();
    await expect(guide(page)).toBeVisible();
    await expect(page.locator('#onboarding-title')).toHaveText(title);
    await page.locator('#onboarding-next').click();
    await page.locator('#onboarding-back').click();
    await expect(page.locator('#onboarding-title')).toHaveText(title);
    await expect(page.locator('#onboarding-next')).toBeFocused();
    for (let index = 0; index < 4; index++) await page.locator('#onboarding-next').click();
    await expect(page.locator('#onboarding-explore')).toBeHidden();
    await page.getByRole('button', { name: finish, exact: true }).click();
    await expect(guide(page)).toBeHidden();
    await expect(page.locator('#settings-open-guide')).toBeFocused();
    await expect(page.locator('input[name="interface-theme"][value="dark"]')).toBeChecked();
    await expect(page.locator('#settings-modal-save')).toBeEnabled();
  }
  await page.locator('#settings-open-guide').click();
  await page.keyboard.press('Escape');
  await expect(guide(page)).toBeHidden();
  await expect(page.locator('#settings-modal')).toBeVisible();
});

test('the guide waits in list mode without being consumed and appears after widening', async ({ page }) => {
  await start(page, { width: 375 });
  await expect(guide(page)).toBeHidden();
  await expect(page.locator('.flash-info').last()).toHaveText('Widen the window to use this feature.');
  expect(await storedWelcome(page)).toBeUndefined();
  await page.setViewportSize({ width: 720, height: 800 });
  await expect(guide(page)).toBeVisible();
  await page.locator('#onboarding-skip').click();
  await expect(guide(page)).toBeHidden();
  await expect(page.locator('#edit-bookmark-modal')).toBeHidden();
});

test('loops the add demonstration safely and stops it outside the first step', async ({ page }) => {
  await start(page);
  const preview = page.locator('.onboarding-demo');
  const add = preview.locator('.launcher-add');
  const favorite = preview.locator('.launcher-options button').first();
  const seek = async time => preview.evaluate((element, currentTime) => {
    const animation = element.getAnimations({ subtree: true })
      .find(animation => animation.id === 'onboarding-add-cursor');
    animation.pause();
    animation.currentTime = currentTime;
  }, time);
  await expect.poll(() => preview.evaluate(element => element.getAnimations({ subtree: true })
    .some(animation => animation.id === 'onboarding-add-cursor'))).toBe(true);
  await expect(preview.locator('.launcher-dock [id]')).toHaveCount(0);
  for (const cycle of [0, 7600]) {
    await seek(cycle + 7600 * .52);
    await expect(add).toHaveAttribute('aria-expanded', 'true');
    await expect(favorite).toHaveText('Bookmark');
    await expect(favorite).toHaveClass(/is-demo-hovered/);
    await expect.poll(() => preview.evaluate(element => {
      const target = element.querySelector('.launcher-options button').getBoundingClientRect();
      const pointer = element.querySelector('.onboarding-demo-cursor').getBoundingClientRect();
      return Math.max(
        Math.abs(pointer.x + 2 - target.x - target.width / 2),
        Math.abs(pointer.y + 2 - target.y - target.height / 2)
      );
    })).toBeLessThan(.5);
    await seek(cycle + 7600 * .8);
    await expect(add).toHaveAttribute('aria-expanded', 'false');
    await expect(preview.locator('.launcher-dock')).not.toHaveClass(/is-demo-revealed/);
  }
  await expect(page.locator('#edit-bookmark-modal')).toBeHidden();
  await expect(page.locator('#add-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#onboarding-next').click();
  expect(await preview.evaluate(element => element.getAnimations({ subtree: true })
    .some(animation => animation.id === 'onboarding-add-cursor'))).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#onboarding-back').click();
  await expect(add).toHaveAttribute('aria-expanded', 'true');
  await expect(favorite).toHaveClass(/is-demo-hovered/);
  await expect(preview.locator('.onboarding-demo-cursor')).toHaveCSS('opacity', '0');
  expect(await preview.evaluate(element => element.getAnimations({ subtree: true })
    .some(animation => animation.id === 'onboarding-add-cursor'))).toBe(false);
});

for (const width of [1280, 720]) {
  test(`final demonstration deletes, undoes and searches, then resets smoothly at ${width}px`, async ({ page }) => {
    await start(page, { width });
    for (let step = 0; step < 4; step++) await page.locator('#onboarding-next').click();
    const preview = page.locator('.onboarding-demo');
    const item = preview.locator('.onboarding-demo-video');
    const edit = preview.locator('.launcher-edit');
    const undo = preview.locator('.onboarding-demo-undo');
    const redo = preview.locator('.onboarding-demo-redo');
    const search = preview.locator('.onboarding-demo-search');
    const input = search.locator('input');
    const grid = preview.locator('.onboarding-demo-grid');
    await expect.poll(() => preview.evaluate(element => element.getAnimations({ subtree: true })
      .some(animation => animation.id === 'onboarding-ready-cursor'))).toBe(true);
    const duration = await preview.evaluate(element => element.getAnimations({ subtree: true })
      .find(animation => animation.id === 'onboarding-ready-cursor').effect.getTiming().duration);
    const seek = time => preview.evaluate((element, time) => {
      for (const animation of element.getAnimations({ subtree: true })) {
        if (!animation.id.startsWith('onboarding-ready-')) continue;
        animation.pause();
        animation.currentTime = time;
      }
    }, time);
    const pointerError = locator => locator.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const pointer = element.closest('.onboarding-demo').querySelector('.onboarding-demo-cursor').getBoundingClientRect();
      return Math.max(Math.abs(pointer.x + 2 - bounds.x - bounds.width / 2),
        Math.abs(pointer.y + 2 - bounds.y - bounds.height / 2));
    });
    await seek(100);
    const initial = await item.boundingBox();
    for (const cycle of [0, duration]) {
      await seek(cycle + 100);
      await expect(search).toHaveCSS('opacity', '0');
      await expect(grid).toHaveCSS('opacity', '1');
      await expect(grid).toHaveCSS('filter', 'none');
      await expect(undo).toBeDisabled();
      await expect(edit).toHaveAttribute('aria-pressed', 'false');
      await seek(cycle + 1050);
      await expect.poll(() => pointerError(edit)).toBeLessThan(.5);
      await seek(cycle + 1600);
      await expect(edit).toHaveAttribute('aria-pressed', 'true');
      await expect(preview.locator('.onboarding-demo-edit-grid')).toHaveCSS('opacity', '1');
      await expect(preview.locator('.onboarding-demo-default-brand')).toHaveCSS('opacity', '0');
      await seek(cycle + 3100);
      await expect(item).toHaveClass(/is-demo-trash-dragging/);
      await expect.poll(() => pointerError(item)).toBeLessThan(.5);
      await seek(cycle + 3950);
      await expect(preview.locator('.onboarding-demo-trash')).toHaveClass(/is-demo-trash-target/);
      await expect.poll(() => pointerError(preview.locator('.onboarding-demo-trash'))).toBeLessThan(.5);
      await seek(cycle + 4500);
      await expect(item).toHaveCSS('opacity', '0');
      await expect(undo).toBeEnabled();
      await expect(redo).toBeDisabled();
      await seek(cycle + 5000);
      await expect(edit).toHaveAttribute('aria-pressed', 'false');
      await expect(preview.locator('.onboarding-demo-edit-grid')).toHaveCSS('opacity', '0');
      await seek(cycle + 6100);
      await expect.poll(() => pointerError(undo)).toBeLessThan(.5);
      await seek(cycle + 6800);
      await expect(item).toHaveCSS('opacity', '1');
      expect((await item.boundingBox()).x).toBeCloseTo(initial.x, 0);
      expect((await item.boundingBox()).y).toBeCloseTo(initial.y, 0);
      await expect(undo).toBeDisabled();
      await expect(redo).toBeEnabled();
      await seek(cycle + 7600);
      await expect.poll(() => pointerError(preview.locator('.onboarding-demo-loupe'))).toBeLessThan(.5);
      await seek(cycle + 8300);
      await expect(search).toHaveCSS('opacity', '1');
      await expect(input).toHaveValue('');
      await expect(search.locator('.search-result:visible')).toHaveCount(3);
      await seek(cycle + 8500);
      await expect.poll(() => pointerError(input)).toBeLessThan(.5);
      await seek(cycle + 8750);
      await expect(input).toHaveValue('y');
      await seek(cycle + 9030);
      await expect(input).toHaveValue('you');
      await seek(cycle + 10000);
      await expect(input).toHaveValue('youtube');
      await expect(search.locator('.search-result:visible')).toHaveCount(1);
      await expect(search.locator('.search-result:visible strong')).toHaveText('YouTube');
      await expect(preview.locator('.onboarding-demo-cursor')).toHaveCSS('opacity', '0');
      const panel = await search.boundingBox();
      const surface = await preview.boundingBox();
      expect(panel.x).toBeGreaterThan(surface.x);
      expect(panel.x + panel.width).toBeLessThan(surface.x + surface.width);
      expect(panel.y).toBeGreaterThan(surface.y);
      expect(panel.y + panel.height).toBeLessThan(surface.y + surface.height);
      await seek(cycle + 11300);
      await expect.poll(() => pointerError(search.locator('button'))).toBeLessThan(.5);
      await seek(cycle + 11600);
      const opacity = await search.evaluate(element => Number(getComputedStyle(element).opacity));
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);
      const veilOpacity = await preview.locator('.onboarding-demo-search-backdrop')
        .evaluate(element => Number(getComputedStyle(element).opacity));
      expect(veilOpacity).toBeCloseTo(opacity, 4);
      await expect(grid).toHaveCSS('opacity', '1');
      await expect(input).toHaveValue('youtube');
      await seek(cycle + 11900);
      await expect(grid).toHaveCSS('opacity', '1');
      await expect(input).toHaveValue('youtube');
      await seek(cycle + 12050);
      await expect(search).toHaveCSS('opacity', '0');
      await expect(preview.locator('.onboarding-demo-search-backdrop')).toHaveCSS('opacity', '0');
      await expect(grid).toHaveCSS('opacity', '1');
      await expect(item).toHaveCSS('opacity', '1');
      await seek(cycle + 12900);
      await expect(grid).toHaveCSS('opacity', '1');
      await expect(input).toHaveValue('');
      await expect(preview).not.toHaveClass(/is-demo-searching/);
      await expect(redo).toBeDisabled();
    }
    await expect(page.locator('#search-modal')).toBeHidden();
    await expect(page.locator('#history-undo')).toBeDisabled();
    await expect(page.locator('#edit-toggle-mode')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#onboarding-back').click();
    expect(await preview.evaluate(element => element.getAnimations({ subtree: true })
      .some(animation => animation.id.startsWith('onboarding-ready-')))).toBe(false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#onboarding-next').click();
    await expect(search).toHaveCSS('opacity', '1');
    await expect(input).toHaveValue('youtube');
    expect(await preview.evaluate(element => element.getAnimations({ subtree: true })
      .some(animation => animation.id.startsWith('onboarding-ready-')))).toBe(false);
    const entities = await page.evaluate(async () => {
      const { data } = (await import('/src/state/appStore.js')).getState();
      return [data.bookmarks.length, data.folders.length, data.widgets.length];
    });
    expect(entities).toEqual([0, 0, 0]);
  });

  test(`folder demonstration opens, edits and moves an example item at ${width}px`, async ({ page }) => {
    await start(page, { width });
    await page.locator('#onboarding-next').click();
    await page.locator('#onboarding-next').click();
    const preview = page.locator('.onboarding-demo');
    const panel = preview.locator('.onboarding-demo-folder');
    const edit = panel.locator('.folder-modal-edit-toggle');
    const item = panel.locator('.onboarding-demo-folder-item').first();
    const other = panel.locator('.onboarding-demo-folder-item').nth(1);
    const seek = async progress => preview.evaluate((element, progress) => {
      for (const animation of element.getAnimations({ subtree: true })) {
        if (!animation.id.startsWith('onboarding-folder-')) continue;
        animation.pause();
        animation.currentTime = progress * animation.effect.getTiming().duration;
      }
    }, progress);
    const pointerError = locator => locator.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const pointer = element.closest('.onboarding-demo').querySelector('.onboarding-demo-cursor').getBoundingClientRect();
      return Math.max(Math.abs(pointer.x + 2 - bounds.x - bounds.width / 2),
        Math.abs(pointer.y + 2 - bounds.y - bounds.height / 2));
    });
    await expect.poll(() => preview.evaluate(element => element.getAnimations({ subtree: true })
      .some(animation => animation.id === 'onboarding-folder-panel'))).toBe(true);
    await seek(.05);
    await expect(panel).toHaveCSS('opacity', '0');
    for (const cycle of [0, 1]) {
      await seek(cycle + .12);
      await expect.poll(() => pointerError(preview.locator('.onboarding-demo-media'))).toBeLessThan(.5);
      await seek(cycle + .22);
      await expect(panel).toHaveCSS('opacity', '1');
      await expect(panel.locator('.onboarding-demo-folder-title')).toHaveText('Media');
      await expect(panel.locator('.onboarding-demo-folder-summary')).toHaveText('2 of 18 spaces used');
      await expect(edit).toHaveAttribute('aria-pressed', 'false');
      const initial = await item.boundingBox();
      const stationary = await other.boundingBox();
      const cells = await panel.locator('.folder-modal-grid').boundingBox();
      const surface = await panel.boundingBox();
      const stage = await preview.boundingBox();
      expect(surface.x).toBeGreaterThan(stage.x);
      expect(surface.y).toBeGreaterThan(stage.y);
      expect(surface.x + surface.width).toBeLessThan(stage.x + stage.width);
      expect(surface.y + surface.height).toBeLessThan(stage.y + stage.height);
      await seek(cycle + .27);
      await expect.poll(() => pointerError(edit)).toBeLessThan(.5);
      await seek(cycle + .32);
      await expect(edit).toHaveAttribute('aria-pressed', 'true');
      await expect(edit).toHaveText('Finish editing');
      await expect(panel.locator('.folder-bookmark-actions:visible')).toHaveCount(2);
      await seek(cycle + .5);
      await expect(item).toHaveClass(/is-folder-grid-dragging/);
      await expect.poll(() => pointerError(item)).toBeLessThan(.5);
      await seek(cycle + .56);
      await expect(item).not.toHaveClass(/is-folder-grid-dragging/);
      const moved = await item.boundingBox();
      expect(moved.x - initial.x).toBeCloseTo((cells.width - 2) / 6, 0);
      expect(moved.y - initial.y).toBeCloseTo((cells.height - 2) / 3, 0);
      expect((await other.boundingBox()).x).toBeCloseTo(stationary.x, 0);
      await seek(cycle + .61);
      await expect.poll(() => pointerError(edit)).toBeLessThan(.5);
      await seek(cycle + .67);
      await expect(edit).toHaveAttribute('aria-pressed', 'false');
      await expect(panel.locator('.folder-bookmark-actions:visible')).toHaveCount(0);
      await expect(preview.locator('.onboarding-demo-cursor')).toHaveCSS('opacity', '0');
      await seek(cycle + .82);
      await expect(panel).toHaveCSS('opacity', '1');
      expect((await item.boundingBox()).x).toBeCloseTo(moved.x, 0);
      await seek(cycle + .94);
      await expect(panel).toHaveCSS('opacity', '0');
      await expect(preview).not.toHaveClass(/is-demo-folder-open/);
    }
    await expect(page.locator('#folder-modal')).toBeHidden();
    await page.locator('#onboarding-next').click();
    await expect(panel).toHaveCSS('opacity', '0');
    expect(await preview.evaluate(element => element.getAnimations({ subtree: true })
      .some(animation => animation.id.startsWith('onboarding-folder-')))).toBe(false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#onboarding-back').click();
    await expect(panel).toHaveCSS('opacity', '1');
    await expect(preview.locator('.onboarding-demo-cursor')).toHaveCSS('opacity', '0');
    expect(await preview.evaluate(element => element.getAnimations({ subtree: true })
      .some(animation => animation.id.startsWith('onboarding-folder-')))).toBe(false);
    await page.evaluate(async () => (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language: 'es' }));
    await expect(edit).toHaveText('Editar');
    await expect(panel.locator('.onboarding-demo-folder-summary')).toHaveText('2 de 18 huecos ocupados');
    const entities = await page.evaluate(async () => {
      const { data } = (await import('/src/state/appStore.js')).getState();
      return [data.bookmarks.length, data.folders.length, data.widgets.length];
    });
    expect(entities).toEqual([0, 0, 0]);
  });

  test(`edit demonstration moves and resizes on the grid, then resets smoothly at ${width}px`, async ({ page }) => {
    await start(page, { width });
    await page.locator('#onboarding-next').click();
    const preview = page.locator('.onboarding-demo');
    const gmail = preview.locator('.onboarding-demo-favorite');
    const edit = preview.locator('.launcher-edit');
    const grid = preview.locator('.onboarding-demo-edit-grid');
    const seek = async progress => {
      await preview.evaluate((element, progress) => {
        for (const animation of element.getAnimations({ subtree: true })) {
          if (!animation.id.startsWith('onboarding-edit-')) continue;
          animation.pause();
          animation.currentTime = progress * animation.effect.getTiming().duration;
        }
      }, progress);
    };
    const bounds = () => gmail.boundingBox();
    await expect.poll(() => preview.evaluate(element => element.getAnimations({ subtree: true })
      .some(animation => animation.id === 'onboarding-edit-bookmark'))).toBe(true);
    const duration = await preview.evaluate(element => element.getAnimations({ subtree: true })
      .find(animation => animation.id === 'onboarding-edit-bookmark').effect.getTiming().duration);
    await seek(.05);
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    const initial = await bounds();
    const neighboring = await preview.locator('.onboarding-demo-media').boundingBox();
    const cellWidth = neighboring.x - initial.x;

    for (const cycle of [0, 1]) {
      await seek(cycle + .25);
      await expect(edit).toHaveAttribute('aria-pressed', 'true');
      await expect(grid).toHaveCSS('opacity', '1');
      await expect(preview.locator('.onboarding-demo-default-brand')).toHaveCSS('opacity', '0.24');
      await expect(page.locator('#edit-toggle-mode')).toHaveAttribute('aria-pressed', 'false');
      await seek(cycle + .45);
      await expect(gmail).toHaveClass(/is-demo-selected/);
      const moved = await bounds();
      expect(moved.x - initial.x).toBeCloseTo(cellWidth, 0);
      expect(moved.y).toBeGreaterThan(initial.y + initial.height);
      expect(moved.width).toBeCloseTo(initial.width, 0);

      await seek(cycle + .59);
      await expect(gmail).toHaveClass(/is-demo-resizing/);
      await expect(gmail.locator('.resize-indicator')).toHaveText('2 × 1');
      await expect(gmail.locator('.resizer.bottom-right')).toHaveClass(/is-active/);
      await expect.poll(() => preview.evaluate(element => {
        const target = element.querySelector('.onboarding-demo-favorite').getBoundingClientRect();
        const pointer = element.querySelector('.onboarding-demo-cursor').getBoundingClientRect();
        return Math.max(Math.abs(pointer.x + 2 - target.right), Math.abs(pointer.y + 2 - target.bottom));
      })).toBeLessThan(.5);

      await seek(cycle + .705);
      await expect(edit).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => preview.evaluate(element => {
        const target = element.querySelector('.launcher-edit').getBoundingClientRect();
        const pointer = element.querySelector('.onboarding-demo-cursor').getBoundingClientRect();
        return Math.max(
          Math.abs(pointer.x + 2 - target.x - target.width / 2),
          Math.abs(pointer.y + 2 - target.y - target.height / 2)
        );
      })).toBeLessThan(.5);
      await seek(cycle + 8851 / duration);
      await expect(edit).toHaveAttribute('aria-pressed', 'false');
      await expect(grid).toHaveCSS('opacity', '0');
      await expect(gmail).not.toHaveClass(/is-demo-selected/);
      await expect(gmail.locator('.resizer:visible')).toHaveCount(0);
      await seek(cycle + 9250 / duration);
      await expect(gmail).not.toHaveClass(/is-demo-resizing/);
      await expect(gmail.locator('.resizer.bottom-right')).not.toHaveClass(/is-active/);
      await expect(gmail.locator('.resize-indicator')).toHaveCSS('opacity', '0');
      await expect(preview.locator('.onboarding-demo-cursor')).not.toHaveClass(/is-demo-resize/);
      await expect(preview.locator('.onboarding-demo-cursor')).toHaveCSS('opacity', '0');
      const resized = await bounds();
      expect(resized.width).toBeCloseTo(initial.width + cellWidth, 0);
      expect(resized.height).toBeCloseTo(initial.height, 0);
      await seek(cycle + (8850 + 2000) / duration);
      await expect(gmail).toHaveCSS('opacity', '1');
      await expect(preview.locator('.onboarding-demo-cursor')).toHaveCSS('opacity', '0');
      const held = await bounds();
      expect(held.width).toBeCloseTo(resized.width, 0);
      expect(held.x).toBeCloseTo(resized.x, 0);
      const stage = await preview.boundingBox();
      expect(resized.x + resized.width).toBeLessThan(stage.x + stage.width - 3);
      await seek(cycle + .93);
      await expect(gmail).toHaveCSS('opacity', '0');
      await expect(preview.locator('.onboarding-demo-cursor')).toHaveCSS('opacity', '0');
      await seek(cycle + .98);
      await expect(edit).toHaveAttribute('aria-pressed', 'false');
      await expect(preview.locator('.onboarding-demo-default-brand')).toHaveCSS('opacity', '1');
      const reset = await bounds();
      expect(reset.x).toBeCloseTo(initial.x, 0);
      expect(reset.y).toBeCloseTo(initial.y, 0);
      expect(reset.width).toBeCloseTo(initial.width, 0);
    }
    await page.locator('#onboarding-next').click();
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    await expect(gmail).not.toHaveClass(/is-demo-selected/);
    expect(await preview.evaluate(element => element.getAnimations({ subtree: true })
      .some(animation => animation.id.startsWith('onboarding-edit-')))).toBe(false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#onboarding-back').click();
    await expect(edit).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toHaveCSS('opacity', '1');
    await expect(preview.locator('.onboarding-demo-cursor')).toHaveCSS('opacity', '0');
    expect(await preview.evaluate(element => element.getAnimations({ subtree: true })
      .some(animation => animation.id.startsWith('onboarding-edit-')))).toBe(false);
    const entities = await page.evaluate(async () => {
      const { data } = (await import('/src/state/appStore.js')).getState();
      return [data.bookmarks.length, data.folders.length, data.widgets.length];
    });
    expect(entities).toEqual([0, 0, 0]);
  });
}
