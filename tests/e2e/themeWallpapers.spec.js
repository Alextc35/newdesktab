import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1SQAAAABJRU5ErkJggg==',
  'base64'
);

async function openTheme(page) {
  await page.mouse.move(5, page.viewportSize().height / 2);
  await page.locator('#settings').click();
  await page.getByRole('button', { name: 'Theme' }).click();
}

async function openOwnWallpapers(page) {
  await page.locator('#settings-theme-more-wallpapers summary').click();
}

async function enableSyncDraft(page) {
  await page.getByRole('button', { name: 'Sync' }).click();
  await page.getByRole('radio', { name: /Synced/ }).check();
  await page.getByRole('button', { name: 'Theme' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
});

test('personal wallpapers use the same disclosure styling as storage availability', async ({ page }) => {
  const appearance = selector => page.locator(selector).evaluate(details => {
    const summary = details.querySelector('summary');
    const heading = summary.querySelector('h3');
    const surfaceStyle = getComputedStyle(details);
    const arrowStyle = getComputedStyle(summary, '::after');
    return {
      padding: surfaceStyle.padding,
      border: surfaceStyle.border,
      radius: surfaceStyle.borderRadius,
      background: surfaceStyle.backgroundColor,
      headingSize: getComputedStyle(heading).fontSize,
      arrowWidth: arrowStyle.width,
      arrowBorder: arrowStyle.borderRightWidth
    };
  });

  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  const wallpapers = page.locator('#settings-theme-more-wallpapers');
  await expect(wallpapers).not.toHaveAttribute('open', '');
  await expect(wallpapers.locator('summary')).toHaveClass(/settings-disclosure-title-row/);
  const wallpaperAppearance = await appearance('#settings-theme-more-wallpapers');

  await page.getByRole('button', { name: 'Sync' }).click();
  const storage = page.locator('details.storage-usage');
  await expect(storage).not.toHaveAttribute('open', '');
  expect(wallpaperAppearance).toEqual(await appearance('details.storage-usage'));

  await page.getByRole('button', { name: 'Theme' }).click();
  await openOwnWallpapers(page);
  await expect(wallpapers).toHaveAttribute('open', '');
  await expect(page.locator('#settings-theme-media-url')).toBeVisible();
});

test('uses the shared URL only when no personal wallpaper is available', async ({ page }, testInfo) => {
  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await expect(page.locator('#settings-theme-bg-image-url-field')).toBeHidden();
  await enableSyncDraft(page);
  await expect(page.locator('#settings-theme-bg-image-url-field')).toBeVisible();
  await page.locator('#settings-theme-bg-image').fill('https://images.test/fallback.png');
  await page.locator('.settings-theme-bg-image-input').screenshot({ path: testInfo.outputPath('shared-url-actions.png') });
  await expect(page.locator('#settings-theme-bg-upload')).toHaveCount(0);
  await expect(page.locator('#settings-theme-more-wallpapers')).not.toHaveAttribute('open', '');
  await openOwnWallpapers(page);
  await page.locator('#settings-theme-media-url').fill('https://images.test/own.png');
  await page.locator('#settings-theme-media-add').click();
  await expect(page.locator('#settings-theme-preview-navigation')).toBeHidden();
  await expect(page.locator('#settings-theme-bg-preview')).toHaveCSS('background-image', /own\.png/);
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /own\.png/);

  await openTheme(page);
  await openOwnWallpapers(page);
  await page.locator('#settings-theme-media-list .theme-wallpaper-row')
    .getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('#settings-theme-bg-preview')).toHaveCSS('background-image', /fallback\.png/);
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /fallback\.png/);

  await openTheme(page);
  await page.getByRole('button', { name: 'Sync' }).click();
  await page.getByRole('radio', { name: /This device only/ }).check();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', 'none');
  await openTheme(page);
  await expect(page.locator('#settings-theme-bg-image-url-field')).toBeHidden();
});

test('shows the first wallpaper instantly and crossfades on rotation to video', async ({ page }) => {
  const imageUrl = `data:image/png;base64,${imageBytes.toString('base64')}`;
  const videoUrl = 'http://127.0.0.1:4175/tests/missing-wallpaper.mp4';
  await page.evaluate(async ({ imageUrl, videoUrl }) => {
    const { applyPageTheme } = await import('/src/shared/ui/pageTheme.js');
    applyPageTheme({ theme: {
      backgroundDefault: false,
      backgroundSolid: false,
      backgroundImageColor: '#000000',
      backgroundRotationSeconds: 5,
      backgroundMedia: [
        { id: 'first', type: 'image', backgroundImageUrl: imageUrl,
          backgroundColor: '#123456' },
        { id: 'second', type: 'video', url: videoUrl,
          backgroundColor: '#654321' }
      ]
    } });
  }, { imageUrl, videoUrl });

  const visible = page.locator('#page-wallpaper-stage .page-wallpaper-layer.is-visible');
  await expect(visible).toHaveCount(1);
  await expect(visible.first()).toHaveClass(/is-instant/);
  await expect(visible.first()).toHaveCSS('transition-duration', '0s');
  await expect(visible.first().locator('img')).toHaveCSS('transition-duration', '0s');
  await expect(visible.first().locator('img')).toHaveClass(/is-ready/);

  await page.waitForTimeout(5100);
  await expect(visible).toHaveCount(2);
  const incoming = page.locator('#page-wallpaper-stage .page-wallpaper-layer').last();
  await expect(incoming).not.toHaveClass(/is-instant/);
  await expect(incoming).toHaveCSS('transition-duration', '0.85s');
  await expect(incoming.locator('video')).toHaveAttribute('src', videoUrl);
  await page.waitForTimeout(900);
  await expect(visible).toHaveCount(1);
  await expect(visible.first()).toHaveCSS('background-color', 'rgb(101, 67, 33)');
  await expect(page.locator('#page-wallpaper-video')).toHaveAttribute('src', videoUrl);
});

test('does not flash a first video wallpaper color before a frame is ready', async ({ page }) => {
  const videoUrl = 'http://127.0.0.1:4175/tests/first-video-slow.webm';
  let releaseVideo;
  const videoGate = new Promise(resolve => { releaseVideo = resolve; });
  await page.route(videoUrl, async route => {
    await videoGate;
    await route.abort();
  });

  try {
    await page.evaluate(async videoUrl => {
      const { applyPageTheme } = await import('/src/shared/ui/pageTheme.js');
      applyPageTheme({ theme: {
        backgroundDefault: false,
        backgroundSolid: false,
        backgroundImageColor: '#ff0000',
        backgroundMedia: [{ id: 'first', type: 'video', url: videoUrl,
          backgroundColor: '#ff0000' }]
      } });
    }, videoUrl);
    const layer = page.locator('#page-wallpaper-stage .page-wallpaper-layer.is-visible');
    await expect(layer).toHaveCount(1);
    await expect(layer).toHaveClass(/is-instant/);
    await expect(layer).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.locator('#page-wallpaper-video')).toHaveCSS('opacity', '0');

    releaseVideo();
    await expect(layer).toHaveCSS('background-color', 'rgb(255, 0, 0)');
  } finally {
    releaseVideo();
  }
});

test('waits for the next video without animating when reduced motion is enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const imageUrl = `data:image/png;base64,${imageBytes.toString('base64')}`;
  const videoUrl = 'http://127.0.0.1:4175/tests/reduced-motion-slow.webm';
  let releaseVideo;
  const videoGate = new Promise(resolve => { releaseVideo = resolve; });
  await page.route(videoUrl, async route => {
    await videoGate;
    await route.abort();
  });

  try {
    await page.evaluate(async ({ imageUrl, videoUrl }) => {
      const { applyPageTheme } = await import('/src/shared/ui/pageTheme.js');
      applyPageTheme({ theme: {
        backgroundDefault: false,
        backgroundSolid: false,
        backgroundRotationSeconds: 5,
        backgroundMedia: [
          { id: 'first', type: 'image', backgroundImageUrl: imageUrl,
            backgroundColor: '#123456' },
          { id: 'second', type: 'video', url: videoUrl,
            backgroundColor: '#654321' }
        ]
      } });
    }, { imageUrl, videoUrl });

    const visible = page.locator('#page-wallpaper-stage .page-wallpaper-layer.is-visible');
    await expect(visible).toHaveCount(1);
    await page.waitForTimeout(5100);
    await expect(visible).toHaveCount(1);
    await expect(visible.first().locator('img')).toHaveClass(/is-ready/);
    releaseVideo();
    await expect(visible).toHaveCount(1);
    await expect(visible.first()).toHaveCSS('background-color', 'rgb(101, 67, 33)');
    await expect(visible.first()).toHaveCSS('transition-duration', '0s');
  } finally {
    releaseVideo();
  }
});

test('keeps previews clear of the video color while its first frame loads', async ({ page }) => {
  const videoUrl = 'http://127.0.0.1:4175/tests/preview-slow.webm';
  let releaseVideo;
  const videoGate = new Promise(resolve => { releaseVideo = resolve; });
  await page.route(videoUrl, async route => {
    await videoGate;
    await route.abort();
  });

  try {
    await openTheme(page);
    await page.locator('#settings-theme-bg-image-mode').check();
    await openOwnWallpapers(page);
    await page.locator('#settings-theme-media-url').fill('https://images.test/first.png');
    await page.locator('#settings-theme-media-add').click();
    await page.locator('#settings-theme-media-url').fill(videoUrl);
    await page.locator('#settings-theme-media-add').click();
    const videoRow = page.locator('#settings-theme-media-list .theme-wallpaper-row').nth(1);
    await videoRow.locator('input[type="color"]').fill('#ff0000');
    await page.locator('#settings-theme-preview-next').click();

    const preview = page.locator('#settings-theme-bg-preview');
    await expect(preview).toHaveCSS('background-image', /first\.png/);
    await expect(preview).not.toHaveCSS('background-color', 'rgb(255, 0, 0)');
    await expect(page.locator('#settings-theme-preview-video')).toHaveAttribute('src', videoUrl);
    await expect(page.locator('#settings-theme-preview-video')).toHaveCSS('opacity', '0');

    await videoRow.getByRole('button', { name: 'Preview wallpaper' }).hover();
    const peek = page.locator('.theme-wallpaper-peek:visible');
    await expect(peek).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(peek.locator('video')).toHaveCSS('opacity', '0');
    const coverage = await peek.evaluate(element => {
      const frame = element.getBoundingClientRect();
      const video = element.querySelector('video').getBoundingClientRect();
      return video.left <= frame.left && video.top <= frame.top
        && video.right >= frame.right && video.bottom >= frame.bottom;
    });
    expect(coverage).toBe(true);

    releaseVideo();
    await expect(preview).toHaveCSS('background-color', 'rgb(255, 0, 0)');
    await expect(peek).toHaveCSS('background-color', 'rgb(255, 0, 0)');
  } finally {
    releaseVideo();
  }
});

test('rotates personal URLs, preserves their colors and preview crop after reload', async ({ page }) => {
  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await openOwnWallpapers(page);
  for (const name of ['first.png', 'second.png']) {
    await page.locator('#settings-theme-media-url').fill(`https://images.test/${name}`);
    await page.locator('#settings-theme-media-add').click();
  }
  const rows = page.locator('#settings-theme-media-list .theme-wallpaper-row');
  await rows.nth(1).locator('input[type="color"]').fill('#123456');
  const colorStyle = await page.evaluate(() => {
    const fallback = document.querySelector('#settings-theme-bg-image-color');
    const personal = document.querySelectorAll('.theme-wallpaper-color')[1];
    const appearance = element => ({
      width: getComputedStyle(element).width,
      height: getComputedStyle(element).height,
      padding: getComputedStyle(element, '::-webkit-color-swatch-wrapper').padding,
      border: getComputedStyle(element, '::-webkit-color-swatch').borderTopWidth,
      radius: getComputedStyle(element, '::-webkit-color-swatch').borderTopLeftRadius
    });
    return { fallback: appearance(fallback), personal: appearance(personal) };
  });
  expect(colorStyle.personal).toEqual(colorStyle.fallback);
  await rows.nth(1).getByRole('button', { name: 'Preview wallpaper' }).hover();
  await expect(page.locator('.theme-wallpaper-peek:visible')).toHaveCSS('background-image', /second\.png/);
  await expect(page.locator('.theme-wallpaper-peek:visible')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  const previewLayout = await page.evaluate(() => {
    const row = document.querySelectorAll('#settings-theme-media-list .theme-wallpaper-row')[1];
    const viewport = document.querySelector('#bookmark-viewport').getBoundingClientRect();
    const previewElement = document.querySelector('#settings-theme-bg-preview');
    const peekElement = row.querySelector('.theme-wallpaper-peek');
    const preview = previewElement.getBoundingClientRect();
    const peek = peekElement.getBoundingClientRect();
    return {
      previewBeforeColor: row.querySelector('.theme-wallpaper-preview-trigger').getBoundingClientRect().right
        <= row.querySelector('input[type="color"]').getBoundingClientRect().left,
      viewportRatio: viewport.width / viewport.height,
      previewRatio: preview.width / preview.height,
      peekRatio: peek.width / peek.height,
      sameCrop: ['backgroundSize', 'backgroundPosition', 'backgroundRepeat'].every(property =>
        getComputedStyle(previewElement)[property] === getComputedStyle(peekElement)[property])
    };
  });
  expect(previewLayout.previewBeforeColor).toBe(true);
  expect(previewLayout.previewRatio).toBeCloseTo(previewLayout.viewportRatio, 1);
  expect(previewLayout.peekRatio).toBeCloseTo(previewLayout.viewportRatio, 1);
  expect(previewLayout.sameCrop).toBe(true);

  await rows.nth(1).getByRole('button', { name: 'Move up' }).click();
  await page.locator('#settings-theme-media-interval').selectOption('15');
  await expect(page.locator('#settings-theme-preview-count')).toHaveText('1 / 2');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await openTheme(page);
  await openOwnWallpapers(page);
  await expect(rows.first()).toContainText('second.png');
  await expect(rows.first().locator('input[type="color"]')).toHaveValue('#123456');
  await expect(page.locator('#settings-theme-media-interval')).toHaveValue('15');
  await page.locator('#settings-theme-media-interval').selectOption('0');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await openTheme(page);
  await openOwnWallpapers(page);
  await expect(page.locator('#settings-theme-media-interval')).toHaveValue('0');
});

test('accepts a video URL as the fallback wallpaper', async ({ page }) => {
  await openTheme(page);
  await enableSyncDraft(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await page.locator('#settings-theme-bg-image').fill('https://video.test/wallpaper.mp4');
  await expect(page.locator('#settings-theme-preview-video'))
    .toHaveAttribute('src', 'https://video.test/wallpaper.mp4');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#page-wallpaper-video'))
    .toHaveAttribute('src', 'https://video.test/wallpaper.mp4');
});

test('default and solid modes preserve the fallback and personal wallpapers', async ({ page }) => {
  await openTheme(page);
  await enableSyncDraft(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await page.locator('#settings-theme-bg-image').fill('https://images.test/fallback.png');
  await openOwnWallpapers(page);
  await page.locator('#settings-theme-media-url').fill('https://images.test/own.png');
  await page.locator('#settings-theme-media-add').click();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();

  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').uncheck();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('html')).toHaveClass(/is-default-bg/);
  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await expect(page.locator('#settings-theme-bg-preview')).toHaveCSS('background-image', /own\.png/);
  await page.locator('#settings-theme-bg-solid').check();
  await page.locator('#settings-theme-bg-color').fill('#123456');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await page.reload();
  await expectAppReady(page);
  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await expect(page.locator('#settings-theme-bg-image')).toHaveValue('https://images.test/fallback.png');
  await expect(page.locator('#settings-theme-bg-preview')).toHaveCSS('background-image', /own\.png/);
});

test('keeps personal local images and videos on this device and removes deleted videos', async ({ page }) => {
  await openTheme(page);
  await page.locator('#settings-theme-bg-image-mode').check();
  await openOwnWallpapers(page);
  await page.locator('#settings-theme-media-upload-input').setInputFiles([
    { name: 'landscape.png', mimeType: 'image/png', buffer: imageBytes },
    { name: 'motion.webm', mimeType: 'video/webm', buffer: Buffer.from('video fixture') }
  ]);
  const rows = page.locator('#settings-theme-media-list .theme-wallpaper-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('landscape.png');
  await expect(rows.nth(1)).toContainText('motion.webm');
  await expect(page.locator('#settings-theme-bg-preview')).toHaveCSS('background-image', /data:image\//);
  await page.locator('#settings-theme-preview-next').click();
  await expect(page.locator('#settings-theme-preview-video')).toHaveAttribute('src', /^blob:/);
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await openTheme(page);
  await openOwnWallpapers(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('landscape.png');
  await expect(rows.nth(1)).toContainText('motion.webm');
  await rows.nth(1).getByRole('button', { name: 'Remove' }).click();
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  const countVideos = () => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('newdesktab-local-videos', 1);
    request.onsuccess = () => {
      const database = request.result;
      const countRequest = database.transaction('videos').objectStore('videos').count();
      countRequest.onsuccess = () => { resolve(countRequest.result); database.close(); };
      countRequest.onerror = () => reject(countRequest.error);
    };
    request.onerror = () => reject(request.error);
  }));
  await expect.poll(countVideos).toBe(0);
});

test('keeps two synced devices personal collections separate while sharing the fallback', async ({ page, browser, baseURL }) => {
  const otherContext = await browser.newContext({ baseURL });
  const other = await otherContext.newPage();
  try {
    await openTheme(page);
    await enableSyncDraft(page);
    await page.locator('#settings-theme-bg-image-mode').check();
    await page.locator('#settings-theme-bg-image').fill('https://images.test/fallback.png');
    await openOwnWallpapers(page);
    await page.locator('#settings-theme-media-url').fill('https://images.test/device-a.png');
    await page.locator('#settings-theme-media-add').click();
    await page.locator('#settings-modal-save').click();
    await expect(page.locator('#settings-modal')).toBeHidden();
    const shared = await page.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-sync')));
    const payload = JSON.parse(shared['newdesktabSyncChunk:0']);
    expect(payload.settings.theme.backgroundImageUrl).toBe('https://images.test/fallback.png');
    expect(JSON.stringify(payload)).not.toContain('device-a.png');

    await other.goto('/tests/browser-harness.html');
    await expectAppReady(other);
    await other.evaluate(data => new Promise(resolve => chrome.storage.sync.set(data, resolve)), shared);
    await other.evaluate(() => new Promise(resolve => (
      chrome.storage.local.set({ newdesktabStorageMode: 'sync' }, resolve)
    )));
    await other.reload();
    await expectAppReady(other);
    await expect(other.locator('html')).toHaveCSS('--image-bg-body', /fallback\.png/);
    await openTheme(other);
    await openOwnWallpapers(other);
    await expect(other.locator('#settings-theme-media-list .theme-wallpaper-row')).toHaveCount(0);
    await other.locator('#settings-theme-media-url').fill('https://images.test/device-b.png');
    await other.locator('#settings-theme-media-add').click();
    await other.locator('#settings-modal-save').click();
    await expect(other.locator('#settings-modal')).toBeHidden();
    expect(await other.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-sync'))))
      .toEqual(shared);
    await expect(other.locator('html')).toHaveCSS('--image-bg-body', /device-b\.png/);
    await expect(page.locator('html')).toHaveCSS('--image-bg-body', /device-a\.png/);
  } finally {
    await otherContext.close();
  }
});

test('copies an older shared wallpaper list to each device before making it independent', async ({ page, browser, baseURL }) => {
  const otherContext = await browser.newContext({ baseURL });
  const other = await otherContext.newPage();
  const localReference = 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
  try {
    await page.evaluate(async () => {
      const { getState } = await import('/src/state/appStore.js');
      const legacy = getState().data;
      legacy.schemaVersion = 19;
      legacy.settings.theme.backgroundDefault = false;
      legacy.settings.theme.backgroundImageUrl = 'https://images.test/fallback.png';
      legacy.settings.theme.backgroundMedia = [
        { id: 'legacy', type: 'image', backgroundImageUrl: 'https://images.test/old-own.png' },
        { id: 'legacy-local', type: 'image',
          backgroundImageLocal: 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9' }
      ];
      await new Promise(resolve => chrome.storage.sync.set(legacy, resolve));
      await new Promise(resolve => chrome.storage.local.remove('newdesktabDeviceWallpapers', resolve));
      await new Promise(resolve => chrome.storage.local.set({ newdesktabStorageMode: 'sync' }, resolve));
    });
    await page.reload();
    await expectAppReady(page);
    await openTheme(page);
    await openOwnWallpapers(page);
    await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row').first())
      .toContainText('old-own.png');
    await page.locator('#settings-theme-bg-image').fill('https://images.test/new-fallback.png');
    await page.locator('#settings-modal-save').click();
    await expect(page.locator('#settings-modal')).toBeHidden();
    const shared = await page.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-sync')));
    const payload = JSON.parse(shared['newdesktabSyncChunk:0']);
    expect(payload.settings.theme.backgroundMedia).toEqual([]);
    expect(payload.settings.theme.legacyBackgroundMedia[0].backgroundImageUrl)
      .toBe('https://images.test/old-own.png');
    expect(payload.settings.theme.legacyBackgroundMedia[1].backgroundImageLocal).toBeUndefined();

    await other.goto('/tests/browser-harness.html');
    await expectAppReady(other);
    await other.evaluate(async ({ data, reference, bytes }) => {
      await new Promise(resolve => chrome.storage.sync.set(data, resolve));
      await new Promise(resolve => chrome.storage.local.remove('newdesktabDeviceWallpapers', resolve));
      await new Promise(resolve => chrome.storage.local.set({
        'newdesktabLocalImage:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9': {
          dataUrl: `data:image/png;base64,${bytes}`, name: 'legacy-local.png'
        },
        newdesktabLocalImageSelections: {
          'theme:legacy-local': { reference, source: 'local' }
        }
      }, resolve));
      await new Promise(resolve => chrome.storage.local.set({ newdesktabStorageMode: 'sync' }, resolve));
    }, { data: shared, reference: localReference, bytes: imageBytes.toString('base64') });
    await other.reload();
    await expectAppReady(other);
    await openTheme(other);
    await openOwnWallpapers(other);
    await expect(other.locator('#settings-theme-media-list .theme-wallpaper-row').first())
      .toContainText('old-own.png');
    await expect(other.locator('#settings-theme-media-list .theme-wallpaper-row').nth(1))
      .toContainText('legacy-local.png');
    await other.locator('#settings-theme-media-url').fill('https://images.test/only-b.png');
    await other.locator('#settings-theme-media-add').click();
    await other.locator('#settings-modal-save').click();
    await expect(other.locator('#settings-modal')).toBeHidden();
    expect(await other.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-sync'))))
      .toEqual(shared);
    await openTheme(page);
    await openOwnWallpapers(page);
    await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row')).toHaveCount(2);
  } finally {
    await otherContext.close();
  }
});

test('moves an older primary local file into My own wallpapers without losing its URL fallback', async ({ page }) => {
  const reference = 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';
  await page.evaluate(async ({ ref, bytes }) => {
    const { getState } = await import('/src/state/appStore.js');
    const legacy = getState().data;
    legacy.schemaVersion = 19;
    legacy.settings.theme.backgroundDefault = false;
    legacy.settings.theme.backgroundImageUrl = 'https://images.test/fallback.png';
    legacy.settings.theme.backgroundImageLocal = null;
    await new Promise(resolve => chrome.storage.sync.set(legacy, resolve));
    await new Promise(resolve => chrome.storage.local.remove('newdesktabDeviceWallpapers', resolve));
    await new Promise(resolve => chrome.storage.local.set({
      'newdesktabLocalImage:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9': {
        dataUrl: `data:image/png;base64,${bytes}`, name: 'former-primary.png'
      },
      newdesktabLocalImageSelections: { theme: { reference: ref, source: 'local' } },
      newdesktabStorageMode: 'sync'
    }, resolve));
  }, { ref: reference, bytes: imageBytes.toString('base64') });
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('html')).toHaveCSS('--image-bg-body', /data:image\//);
  await openTheme(page);
  await expect(page.locator('#settings-theme-bg-image')).toHaveValue('https://images.test/fallback.png');
  await openOwnWallpapers(page);
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row'))
    .toContainText('former-primary.png');
  await page.locator('#settings-theme-bg-image').fill('https://images.test/new-fallback.png');
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await openTheme(page);
  await openOwnWallpapers(page);
  await expect(page.locator('#settings-theme-media-list .theme-wallpaper-row'))
    .toContainText('former-primary.png');
  await expect(page.locator('#settings-theme-bg-image')).toHaveValue('https://images.test/new-fallback.png');
});
