import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

const icon = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1SQAAAABJRU5ErkJggg==',
  'base64'
);

test('loads the parent favicon when the app host returns a valid generic image with HTTP 404', async ({ page }) => {
  const requestedOrigins = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname !== 't3.gstatic.com') return route.abort();

    const origin = url.searchParams.get('url');
    requestedOrigins.push(origin);
    return route.fulfill({
      status: origin === 'https://web3forms.com' ? 200 : 404,
      contentType: 'image/png',
      body: icon
    });
  });
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await expect(page.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();

  const id = await page.evaluate(async () => {
    const { addBookmark } = await import('/src/features/bookmarks/bookmarkActions.js');
    return addBookmark({ name: 'Web3Forms', url: 'https://app.web3forms.com/dashboard' }).id;
  });
  const card = page.locator(`#bookmark-container [data-bookmark-id="${id}"]`);
  const favicon = card.locator('.bookmark-favicon-image').first();

  await expect(favicon).toBeVisible();
  await expect.poll(() => favicon.evaluate(image => ({
    origin: image.currentSrc ? new URL(image.currentSrc).searchParams.get('url') : null,
    loaded: image.complete && image.naturalWidth > 0
  }))).toEqual({ origin: 'https://web3forms.com', loaded: true });
  expect(requestedOrigins).toContain('https://web3forms.com');
  await expect(card.locator('a.bookmark-link')).toHaveAttribute('href', 'https://app.web3forms.com/dashboard');
});

test('offline initials fallback follows the interface theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue()
    : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);

  const id = await page.evaluate(async () => {
    const { addBookmark } = await import('/src/features/bookmarks/bookmarkActions.js');
    return addBookmark({ name: 'Theme fallback', url: 'https://theme.internal' }).id;
  });
  const fallback = page.locator(
    `#bookmark-container [data-bookmark-id="${id}"] .bookmark-favicon-fallback`
  );

  await expect(fallback).toHaveText('TH');
  await expect(fallback).toHaveCSS('background-color', 'rgb(238, 240, 252)');
  await expect(fallback).toHaveCSS('color', 'rgb(36, 36, 40)');

  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const settings = getState().data.settings;
    await setState({ data: { settings: { ...settings, interfaceTheme: 'dark' } } });
  });

  await expect(fallback).toHaveCSS('background-color', 'rgb(24, 36, 56)');
  await expect(fallback).toHaveCSS('color', 'rgb(255, 255, 255)');
});
