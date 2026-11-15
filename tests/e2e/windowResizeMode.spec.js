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

async function scrollGrid(page, position) {
  await page.locator('#bookmark-viewport').evaluate(async (viewport, { x, y }) => {
    viewport.scrollLeft = x;
    viewport.scrollTop = y;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, position);
}

async function expectGridPosition(page, { x, y }) {
  await expect(page.locator('#bookmark-viewport')).toHaveJSProperty('scrollLeft', x);
  await expect(page.locator('#bookmark-viewport')).toHaveJSProperty('scrollTop', y);
}

async function expectActiveWorkspace(page, workspaceId) {
  await expect(page.locator('#workspace-select')).toHaveValue(workspaceId ?? '');
  await expect(page.locator('#bookmark-container')).not.toHaveClass(/is-switching-workspace/);
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
  await page.reload();
  await expectAppReady(page);
  await expectGridPosition(page, scroll);
});

test('restores a separate device-local position for each workspace', async ({ page }) => {
  await seedCenteredGrid(page);
  const workspaceId = await page.evaluate(async () => (
    await import('/src/features/workspaces/workspaceActions.js')
  ).createWorkspace('Pan workspace').id);
  await waitForSaved(page);
  await page.setViewportSize({ width: 700, height: 500 });
  await expectCenteredGrid(page);
  // A direct switch can happen before the browser dispatches the last scroll.
  await page.evaluate(async () => {
    const { setActiveWorkspace } = await import('/src/features/workspaces/workspaceActions.js');
    await new Promise(resolve => requestAnimationFrame(() => {
      const viewport = document.getElementById('bookmark-viewport');
      viewport.scrollLeft = 240;
      viewport.scrollTop = 120;
      void setActiveWorkspace(null).then(resolve);
    }));
  });
  await expectActiveWorkspace(page, null);
  await expectCenteredGrid(page);
  await scrollGrid(page, { x: 80, y: 60 });
  await page.keyboard.press('Control+ArrowDown');
  await expectActiveWorkspace(page, workspaceId);
  await expectGridPosition(page, { x: 240, y: 120 });
  await page.keyboard.press('Control+ArrowUp');
  await expectActiveWorkspace(page, null);
  await expectGridPosition(page, { x: 80, y: 60 });
  await page.reload();
  await expectAppReady(page);
  await expectGridPosition(page, { x: 80, y: 60 });
  await page.keyboard.press('Control+ArrowDown');
  await expectActiveWorkspace(page, workspaceId);
  await expectGridPosition(page, { x: 240, y: 120 });
  await page.reload();
  await expectAppReady(page);
  await expectGridPosition(page, { x: 240, y: 120 });
});

test('clamps saved positions for larger windows without losing them in fit or list view', async ({ page }) => {
  await seedCenteredGrid(page);
  await page.setViewportSize({ width: 700, height: 500 });
  await expectCenteredGrid(page);
  const position = { x: 400, y: 240 };
  await scrollGrid(page, position);
  const visibleCenter = await page.locator('#bookmark-viewport').evaluate(viewport => ({
    x: viewport.scrollLeft + viewport.clientWidth / 2,
    y: viewport.scrollTop + viewport.clientHeight / 2
  }));
  await page.setViewportSize({ width: 650, height: 450 });
  await expectGridPosition(page, { x: 425, y: 265 });
  expect(await page.locator('#bookmark-viewport').evaluate(viewport => ({
    x: viewport.scrollLeft + viewport.clientWidth / 2,
    y: viewport.scrollTop + viewport.clientHeight / 2
  }))).toEqual(visibleCenter);
  await page.setViewportSize({ width: 700, height: 500 });
  await expectGridPosition(page, position);
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect.poll(() => page.locator('#bookmark-viewport').evaluate(viewport => ({
    x: viewport.scrollLeft,
    y: viewport.scrollTop
  }))).toEqual({ x: 212, y: 112 });
  await page.setViewportSize({ width: 700, height: 500 });
  await expectGridPosition(page, position);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(page.locator('#bookmark-container')).toHaveJSProperty('clientWidth', 1600);
  await expect(page.locator('#bookmark-container')).toHaveJSProperty('clientHeight', 1000);
  await expectGridPosition(page, { x: 0, y: 0 });
  await page.setViewportSize({ width: 700, height: 500 });
  const enlargedCanvasPosition = { x: 600, y: 340 };
  await expectGridPosition(page, enlargedCanvasPosition);
  expect(await page.locator('#bookmark-viewport').evaluate(viewport => {
    const grid = document.getElementById('bookmark-container');
    return {
      x: viewport.scrollLeft + viewport.clientWidth / 2 - grid.clientWidth / 2,
      y: viewport.scrollTop + viewport.clientHeight / 2 - grid.clientHeight / 2
    };
  })).toEqual({ x: 144, y: 84 });

  for (const mode of ['fit', 'relative']) {
    await openSettings(page);
    await expandWindowResizeSettings(page);
    await page.locator(`input[name="window-resize-mode"][value="${mode}"]`).check();
    await page.locator('#settings-modal-save').click();
    await expect(page.locator('#settings-modal')).toBeHidden();
    await waitForSaved(page);
    await expectGridPosition(page, mode === 'fit' ? { x: 0, y: 0 } : enlargedCanvasPosition);
  }
  await page.setViewportSize({ width: 500, height: 500 });
  await expect(page.locator('#bookmark-container')).toHaveClass(/is-list-view/);
  await page.setViewportSize({ width: 700, height: 500 });
  await expectGridPosition(page, enlargedCanvasPosition);
  await page.reload();
  await expectAppReady(page);
  await expectGridPosition(page, enlargedCanvasPosition);
});

test('moving one axis after a resize clamp retains the other saved center anchor', async ({ page }) => {
  await seedCenteredGrid(page);
  await page.setViewportSize({ width: 700, height: 500 });
  await expectCenteredGrid(page);
  await scrollGrid(page, { x: 400, y: 200 });
  await page.setViewportSize({ width: 1000, height: 700 });
  await expectGridPosition(page, { x: 212, y: 100 });
  await scrollGrid(page, { x: 212, y: 80 });
  await page.setViewportSize({ width: 700, height: 500 });
  await expectGridPosition(page, { x: 400, y: 180 });
  await page.reload();
  await expectAppReady(page);
  await expectGridPosition(page, { x: 400, y: 180 });
});

test('restores legacy XY positions exactly before anchoring later resizes to the center', async ({ page }) => {
  await seedCenteredGrid(page);
  await page.setViewportSize({ width: 700, height: 500 });
  await expectCenteredGrid(page);
  await page.evaluate(() => localStorage.setItem('newdesktab:grid-scroll:v1:main',
    JSON.stringify({ x: 80, y: 60 })));
  await page.reload();
  await expectAppReady(page);
  await expectGridPosition(page, { x: 80, y: 60 });
  await page.setViewportSize({ width: 650, height: 450 });
  await expectGridPosition(page, { x: 105, y: 85 });
});

test('keeps card size fixed and restores saved pans before the incoming workspace paints', async ({ page }) => {
  await seedCenteredGrid(page);
  const workspaceId = await page.evaluate(async () => {
    const { createWorkspace } = await import('/src/features/workspaces/workspaceActions.js');
    const { getState, setState } = await import('/src/state/appStore.js');
    const workspace = createWorkspace('Fixed canvas');
    const { data } = getState();
    await setState({ data: { bookmarks: [...data.bookmarks, ...data.bookmarks.map(item => ({
      ...item, id: `incoming-${item.id}`, groupId: workspace.id
    }))] } });
    return workspace.id;
  });
  await waitForSaved(page);
  await expect(page.locator('[data-bookmark-id^="incoming-"]')).toHaveCount(4);
  await page.setViewportSize({ width: 700, height: 500 });
  await expectCenteredGrid(page);
  await scrollGrid(page, { x: 240, y: 120 });
  const expectedCard = await page.locator('[data-bookmark-id="incoming-centered-0"]').boundingBox();
  await page.keyboard.press('Control+ArrowUp');
  await expectActiveWorkspace(page, null);
  await expectCenteredGrid(page);
  await scrollGrid(page, { x: 80, y: 60 });
  await page.evaluate(() => {
    const viewport = document.getElementById('bookmark-viewport');
    const container = document.getElementById('bookmark-container');
    window.workspacePanFrames = [];
    window.captureWorkspacePan = true;
    const sample = () => {
      const item = container.querySelector('[data-bookmark-id]');
      const bounds = item?.getBoundingClientRect();
      if (bounds) window.workspacePanFrames.push({
        incoming: item.dataset.bookmarkId.startsWith('incoming-'),
        canvasWidth: container.getBoundingClientRect().width,
        canvasHeight: container.getBoundingClientRect().height,
        cardWidth: bounds.width,
        cardHeight: bounds.height,
        x: viewport.scrollLeft,
        y: viewport.scrollTop
      });
      if (window.captureWorkspacePan) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.keyboard.press('Control+ArrowDown');
  await expectActiveWorkspace(page, workspaceId);
  await expect(page.locator('[data-bookmark-id^="incoming-"]')).toHaveCount(4);
  await expectGridPosition(page, { x: 240, y: 120 });
  const frames = await page.evaluate(() => {
    window.captureWorkspacePan = false;
    return window.workspacePanFrames;
  });
  expect(frames.length).toBeGreaterThan(5);
  expect(frames.some(frame => frame.incoming)).toBe(true);
  for (const frame of frames) {
    expect(frame.canvasWidth).toBeCloseTo(1200, 2);
    expect(frame.canvasHeight).toBeCloseTo(800, 2);
    expect(frame.cardWidth).toBeCloseTo(expectedCard.width, 2);
    expect(frame.cardHeight).toBeCloseTo(expectedCard.height, 2);
    expect({ x: frame.x, y: frame.y }).toEqual(frame.incoming
      ? { x: 240, y: 120 } : { x: 80, y: 60 });
  }
});

test('keeps different device positions outside shared data and backup payloads', async ({ page, browser }) => {
  await seedCenteredGrid(page);
  const shared = await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { migratePersistedData } = await import('/src/platform/storage/dataSchema.js');
    const data = migratePersistedData(getState().data);
    await setState({ data });
    return data;
  });
  const otherDevice = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  try {
    const otherPage = await otherDevice.newPage();
    await otherPage.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue() : route.abort());
    await otherPage.goto(new URL('/tests/browser-harness.html', page.url()).href);
    await expectAppReady(otherPage);
    await otherPage.evaluate(async data => {
      const { setState } = await import('/src/state/appStore.js');
      await setState({ data });
    }, shared);
    for (const [device, size] of [
      [page, { width: 700, height: 500 }], [otherPage, { width: 900, height: 650 }]
    ]) {
      await device.setViewportSize(size);
      await expectCenteredGrid(device);
    }
    const firstPosition = { x: 80, y: 60 };
    const secondPosition = { x: 270, y: 190 };
    await scrollGrid(page, firstPosition);
    await scrollGrid(otherPage, secondPosition);
    for (const device of [page, otherPage]) {
      const backup = await device.evaluate(async () => {
        const { getState } = await import('/src/state/appStore.js');
        const { createBackupEnvelope } = await import('/src/platform/storage/dataSchema.js');
        return createBackupEnvelope(getState().data).data;
      });
      expect(backup).toEqual(shared);
      await device.reload();
      await expectAppReady(device);
    }
    await expectGridPosition(page, firstPosition);
    await expectGridPosition(otherPage, secondPosition);
  } finally {
    await otherDevice.close();
  }
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
