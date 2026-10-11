import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

async function openSettings(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.mouse.move(5, 400);
  await expect.poll(async () => (await page.locator('#floating-menu').boundingBox()).x)
    .toBeGreaterThanOrEqual(0);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
}

async function selectMode(page, kind, mode) {
  const toggle = page.locator(`#bookmark-${kind}-settings-title`);
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator(`input[name="bookmark-${kind}-mode"][value="${mode}"]`).check();
  const preview = page.locator(`#bookmark-${kind}-preview`);
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toBeVisible();
  return preview;
}

async function seek(preview, progress) {
  await expect.poll(() => preview.evaluate(root => root.getAnimations({ subtree: true }).length))
    .toBeGreaterThan(0);
  await preview.evaluate((root, fraction) => {
    for (const animation of root.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = fraction * animation.effect.getTiming().duration;
    }
  }, progress);
}

async function box(element) {
  return element.evaluate(node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  });
}

async function expectInCell(tile, cell) {
  const [actual, expected] = await Promise.all([box(tile), box(cell)]);
  expect(actual.x).toBeCloseTo(expected.x, 0);
  expect(actual.y).toBeCloseTo(expected.y, 0);
}

for (const mode of ['none', 'relocate', 'cascade']) {
  test(`drag preview demonstrates ${mode} with a synchronized cursor and stable result`, async ({ page }) => {
    await openSettings(page);
    const saved = await page.evaluate(() => sessionStorage.getItem('newdesktab-test-local'));
    const preview = await selectMode(page, 'drag', mode);
    await expect(preview).toHaveAttribute('inert', '');
    await expect(preview.locator('.bookmark.is-preview')).toHaveCount(3);
    await seek(preview, .39);
    const [cursor, tile] = await Promise.all([
      box(preview.locator('.behavior-preview-pointer')), box(preview.locator('.preview-tile-a'))
    ]);
    expect(cursor.x + 2).toBeCloseTo(tile.x + tile.width / 2, 0);
    expect(cursor.y + 2).toBeCloseTo(tile.y + tile.height / 2, 0);
    await seek(preview, .72);
    const cells = preview.locator('.behavior-preview-cell');
    await expectInCell(preview.locator('.preview-tile-a'), cells.nth(mode === 'none' ? 4 : 2));
    await expectInCell(preview.locator('.preview-tile-b'), cells.nth(mode === 'none' ? 2 : mode === 'relocate' ? 0 : 1));
    await expectInCell(preview.locator('.preview-tile-c'), cells.nth(mode === 'cascade' ? 0 : 1));
    await seek(preview, .99);
    await expectInCell(preview.locator('.preview-tile-a'), cells.nth(0));
    expect(await page.evaluate(() => sessionStorage.getItem('newdesktab-test-local'))).toBe(saved);
  });
}

for (const mode of ['none', 'smooth']) {
  test(`resize preview demonstrates ${mode} in both dimensions and finishes aligned with the grid`, async ({ page }) => {
    await openSettings(page);
    const preview = await selectMode(page, 'resize', mode);
    await expect(preview.locator('.behavior-preview-pointer svg')).toBeVisible();
    const tile = preview.locator('.preview-resize-tile');
    const cells = preview.locator('.behavior-preview-cell');
    const initial = await box(cells.nth(0));
    const second = await box(cells.nth(1));
    await seek(preview, .2);
    const initialOutline = await tile.evaluate(node => getComputedStyle(node).outlineColor);
    const initialShadow = await tile.evaluate(node => getComputedStyle(node).boxShadow);
    if (mode === 'none') {
      const cursor = preview.locator('.behavior-preview-pointer');
      const cursorDelta = async () => {
        const position = await box(cursor);
        return {
          x: (position.x + position.width / 2 - initial.x - initial.width) / (second.x - initial.x),
          y: (position.y + position.height / 2 - initial.y - initial.height) / (initial.height + 8)
        };
      };
      await seek(preview, .39);
      const before = await cursorDelta();
      expect(before.x).toBeLessThan(.5);
      expect(before.y).toBeLessThan(.5);
      const small = await box(tile);
      expect(small.width).toBeCloseTo(initial.width, 0);
      expect(small.height).toBeCloseTo(initial.height, 0);
      await seek(preview, .41);
      const after = await cursorDelta();
      expect(after.x).toBeGreaterThan(.5);
      expect(after.y).toBeGreaterThan(.5);
      const large = await box(tile);
      expect(large.width).toBeCloseTo(initial.width + second.x - initial.x, 0);
      expect(large.height).toBeCloseTo(initial.height * 2 + 8, 0);
      await seek(preview, .49);
      const continued = await cursorDelta();
      expect(continued.x - after.x).toBeCloseTo((after.x - before.x) * 4, 3);
      expect(continued.y - after.y).toBeCloseTo((after.y - before.y) * 4, 3);
    }
    await seek(preview, .61);
    await expect(tile).toHaveCSS('outline-color', initialOutline);
    const stretched = await box(tile);
    expect(stretched.width).toBeGreaterThan(initial.width);
    if (mode === 'smooth') {
      const target = await box(cells.nth(6));
      expect(stretched.x + stretched.width).toBeCloseTo(target.x + target.width, 0);
      expect(stretched.y + stretched.height).toBeCloseTo(target.y + target.height, 0);
    }
    await seek(preview, .72);
    await expect(tile).toHaveCSS('outline-color', initialOutline);
    await expect(tile).toHaveCSS('box-shadow', initialShadow);
    expect(await cells.evaluateAll(nodes => nodes.every(node => getComputedStyle(node).borderStyle === 'dashed')))
      .toBe(true);
    const [final, corner] = await Promise.all([box(tile), box(cells.nth(mode === 'none' ? 5 : 6))]);
    if (mode === 'smooth') {
      expect(final.width).toBeCloseTo(stretched.width, 0);
      expect(final.height).toBeCloseTo(stretched.height, 0);
    }
    expect(final.x).toBeCloseTo(initial.x, 0);
    expect(final.y).toBeCloseTo(initial.y, 0);
    expect(final.x + final.width).toBeCloseTo(corner.x + corner.width, 0);
    expect(final.y + final.height).toBeCloseTo(corner.y + corner.height, 0);
    await seek(preview, .82);
    const held = await box(tile);
    expect(held.width).toBeCloseTo(final.width, 0);
    expect(held.height).toBeCloseTo(final.height, 0);
    await expect(tile).toHaveCSS('opacity', '1');
    await seek(preview, .99);
    expect((await box(tile)).width).toBeCloseTo(initial.width, 0);
    await expect(tile).toHaveCSS('outline-color', initialOutline);
  });
}

test('previews stop when collapsed, on another settings tab, and after closing', async ({ page }) => {
  await openSettings(page);
  const preview = await selectMode(page, 'drag', 'none');
  const animationCount = () => preview.evaluate(root => root.getAnimations({ subtree: true }).length);
  await expect.poll(animationCount).toBeGreaterThan(0);
  await page.locator('#bookmark-drag-settings-title').click();
  await expect.poll(animationCount).toBe(0);
  await page.locator('#bookmark-drag-settings-title').click();
  await preview.scrollIntoViewIfNeeded();
  await expect.poll(animationCount).toBeGreaterThan(0);
  await page.locator('[data-tab="settings-modal-tab-general"]').click();
  await expect.poll(animationCount).toBe(0);
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await preview.scrollIntoViewIfNeeded();
  await expect.poll(animationCount).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect.poll(animationCount).toBe(0);
});

test('reduced motion shows final positions without animations and resumes when changed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSettings(page);
  const preview = await selectMode(page, 'drag', 'cascade');
  await expect(preview).toHaveAttribute('data-static', 'true');
  await expectInCell(preview.locator('.preview-tile-a'), preview.locator('.behavior-preview-cell').nth(2));
  expect(await preview.evaluate(root => root.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(preview.locator('.behavior-preview-pointer')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(preview).not.toHaveAttribute('data-static');
  await seek(preview, .72);
  await expectInCell(preview.locator('.preview-tile-a'), preview.locator('.behavior-preview-cell').nth(2));
});

test('previews fit the resized settings panel and work in the light theme', async ({ page }) => {
  await openSettings(page);
  const preview = await selectMode(page, 'resize', 'smooth');
  await page.setViewportSize({ width: 980, height: 720 });
  await preview.scrollIntoViewIfNeeded();
  await page.evaluate(() => { document.documentElement.style.colorScheme = 'light'; });
  await seek(preview, .72);
  const [tile, corner, stage] = await Promise.all([
    box(preview.locator('.preview-resize-tile')),
    box(preview.locator('.behavior-preview-cell').nth(6)),
    box(preview.locator('.behavior-preview-stage'))
  ]);
  expect(tile.x + tile.width).toBeCloseTo(corner.x + corner.width, 0);
  expect(tile.x + tile.width).toBeLessThan(stage.x + stage.width);
  await page.screenshot({ path: 'test-results/behavior-preview-light.png' });
});
