import { expect, test } from './helpers/test.js';
import { expectAppReady } from './helpers/appReady.js';

test.use({
  viewport: { width: 1200, height: 800 },
  launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] }
});

async function waitForSaved(page) {
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().ui.persistence.status;
  })).toMatch(/^(idle|saved)$/);
}

async function openSettings(page) {
  await page.mouse.move(5, Math.floor((await page.evaluate(() => innerHeight)) / 2));
  await expect.poll(async () => (await page.locator('#floating-menu').boundingBox()).x)
    .toBeGreaterThanOrEqual(0);
  await page.locator('#settings').click();
  await expect(page.locator('#settings-modal')).toBeVisible();
}

async function expandWindowResizeSettings(page) {
  const toggle = page.locator('#window-resize-settings-title');
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(page.locator('#window-resize-settings-body')).toBeVisible();
}

async function expectCenteredGrid(page) {
  await expect.poll(() => page.locator('#bookmark-viewport').evaluate(viewport => {
    const grid = viewport.querySelector('#bookmark-container');
    return Math.max(
      Math.abs(grid.clientWidth / 2 - viewport.scrollLeft - viewport.clientWidth / 2),
      Math.abs(grid.clientHeight / 2 - viewport.scrollTop - viewport.clientHeight / 2)
    );
  })).toBeLessThanOrEqual(1);
}

async function seedCenteredGrid(page) {
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { data } = getState();
    void setState({ data: {
      bookmarks: Array.from({ length: 4 }, (_, index) => ({
        ...DEFAULT_BOOKMARK,
        id: `centered-${index}`,
        name: `Centered ${index + 1}`,
        url: 'https://example.internal',
        gx: 5 + index % 2,
        gy: 2 + Math.floor(index / 2),
        w: 1,
        h: 1
      })),
      settings: { ...data.settings, windowResizeMode: 'relative', showRecycleBin: false }
    } });
  });
  await waitForSaved(page);
  await expect(page.locator('[data-bookmark-id^="centered-"]')).toHaveCount(4);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expectAppReady(page);
});

test('keeps the grid size on smaller windows and returns to fitting on demand', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const fitSize = await page.locator('#bookmark-container').evaluate(element => ({
    width: element.clientWidth,
    height: element.clientHeight
  }));

  await openSettings(page);
  await expandWindowResizeSettings(page);
  await page.locator('input[name="window-resize-mode"][value="relative"]').check();
  await expect(page.locator('#window-resize-settings-summary'))
    .toHaveText('Keep bookmark size');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await waitForSaved(page);

  await expect.poll(() => page.locator('#bookmark-container')
    .evaluate(element => element.clientWidth)).toBe(fitSize.width);
  await page.setViewportSize({ width: 700, height: 500 });
  await expect.poll(() => page.locator('#bookmark-container')
    .evaluate(element => element.clientWidth)).toBe(fitSize.width);
  await expect.poll(() => page.locator('#bookmark-container')
    .evaluate(element => element.clientHeight)).toBe(fitSize.height);
  const relativeState = await page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    const viewport = document.getElementById('bookmark-viewport');
    return {
      mode: getState().data.settings.windowResizeMode,
      scrollWidth: viewport.scrollWidth,
      clientWidth: viewport.clientWidth,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight
    };
  });
  expect(relativeState.mode).toBe('relative');
  expect(relativeState.scrollWidth).toBeGreaterThan(relativeState.clientWidth);
  expect(relativeState.scrollHeight).toBeGreaterThan(relativeState.clientHeight);
  await expectCenteredGrid(page);

  await openSettings(page);
  await expandWindowResizeSettings(page);
  await page.locator('input[name="window-resize-mode"][value="fit"]').check();
  await page.locator('#settings-modal-save').click();
  await waitForSaved(page);
  await expect.poll(() => page.locator('#bookmark-container')
    .evaluate(element => element.clientWidth)).toBeLessThanOrEqual(700);
  const fitState = await page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().data.settings.windowResizeMode;
  });
  expect(fitState).toBe('fit');
  await expect(page.locator('#bookmark-viewport')).toHaveJSProperty('scrollLeft', 0);
  await expect(page.locator('#bookmark-viewport')).toHaveJSProperty('scrollTop', 0);
});

test('keeps centered bookmarks the same size through repeated resizes and list view', async ({ page }) => {
  await seedCenteredGrid(page);
  const bookmark = page.locator('[data-bookmark-id="centered-0"]');
  const original = await bookmark.boundingBox();
  for (const size of [
    { width: 700, height: 500 },
    { width: 1000, height: 650 },
    { width: 1200, height: 800 },
    { width: 760, height: 550 }
  ]) {
    await page.setViewportSize(size);
    await expectCenteredGrid(page);
    const current = await bookmark.boundingBox();
    expect(current.width).toBeCloseTo(original.width, 0);
    expect(current.height).toBeCloseTo(original.height, 0);
    await expect.poll(() => page.locator('#bookmark-viewport').evaluate(viewport => {
      const items = [...viewport.querySelectorAll('[data-bookmark-id^="centered-"]')]
        .map(element => element.getBoundingClientRect());
      const centerX = (Math.min(...items.map(item => item.left))
        + Math.max(...items.map(item => item.right))) / 2;
      const centerY = (Math.min(...items.map(item => item.top))
        + Math.max(...items.map(item => item.bottom))) / 2;
      return Math.max(Math.abs(centerX - viewport.clientWidth / 2),
        Math.abs(centerY - viewport.clientHeight / 2));
    })).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 500, height: 500 });
  await expect(page.locator('#bookmark-container')).toHaveClass(/is-list-view/);
  await expect(page.locator('#bookmark-viewport')).toHaveJSProperty('scrollLeft', 0);
  await page.setViewportSize({ width: 700, height: 500 });
  await expectCenteredGrid(page);
  const restored = await bookmark.boundingBox();
  expect(restored.width).toBeCloseTo(original.width, 0);
  expect(restored.height).toBeCloseTo(original.height, 0);

  await page.reload();
  await expectAppReady(page);
  await expectCenteredGrid(page);
});

test('preserves manual scrolling when the grid rerenders', async ({ page }) => {
  await seedCenteredGrid(page);
  await page.setViewportSize({ width: 700, height: 500 });
  await expectCenteredGrid(page);
  const scroll = await page.locator('#bookmark-viewport').evaluate(viewport => {
    viewport.scrollLeft = 80;
    viewport.scrollTop = 60;
    return { x: viewport.scrollLeft, y: viewport.scrollTop };
  });
  await page.evaluate(async () => {
    const { toggleEditing } = await import('/src/state/appStore.js');
    void toggleEditing();
  });
  await expect(page.locator('[data-bookmark-id="centered-0"]')).toHaveClass(/is-editing/);
  await expect(page.locator('#bookmark-viewport')).toHaveJSProperty('scrollLeft', scroll.x);
  await expect(page.locator('#bookmark-viewport')).toHaveJSProperty('scrollTop', scroll.y);
});

test('reveals scrollbars at their edges without moving the centered grid', async ({ page }) => {
  await seedCenteredGrid(page);
  await page.setViewportSize({ width: 700, height: 500 });
  await expectCenteredGrid(page);
  const viewport = page.locator('#bookmark-viewport');
  const bookmark = page.locator('[data-bookmark-id="centered-0"]');
  const original = await bookmark.boundingBox();
  await page.mouse.move(300, 100);
  await expect(viewport).not.toHaveClass(/is-(vertical|horizontal)-scrollbar-visible/);
  expect(await viewport.evaluate(element =>
    getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor))
    .toBe('rgba(0, 0, 0, 0)');

  await page.mouse.move(685, 150);
  await expect(viewport).toHaveClass(/is-vertical-scrollbar-visible/);
  await expect(viewport).not.toHaveClass(/is-horizontal-scrollbar-visible/);
  expect(await bookmark.boundingBox()).toEqual(original);
  await page.mouse.move(300, 485);
  await expect(viewport).toHaveClass(/is-horizontal-scrollbar-visible/);
  await expect(viewport).not.toHaveClass(/is-vertical-scrollbar-visible/);
  expect(await bookmark.boundingBox()).toEqual(original);

  await page.mouse.move(300, 100);
  await expect(viewport).not.toHaveClass(/is-(vertical|horizontal)-scrollbar-visible/);
  const beforeScroll = await viewport.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, 80);
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBeGreaterThan(beforeScroll);
  await expect(viewport).not.toHaveClass(/is-(vertical|horizontal)-scrollbar-visible/);
});
