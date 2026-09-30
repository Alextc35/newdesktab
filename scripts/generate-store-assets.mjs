import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { DATA_SCHEMA_VERSION } from '../src/platform/storage/schemaVersion.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, 'assets/store');
await mkdir(output, { recursive: true });
const mimeTypes = new Map([
  ['.css', 'text/css'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html'],
  ['.js', 'text/javascript'],
  ['.json', 'application/json'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const file = resolve(root, `.${pathname}`);
    if (relative(root, file).startsWith(`..${sep}`) || relative(root, file) === '..') {
      response.writeHead(403).end();
      return;
    }
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': mimeTypes.get(extname(file)) ?? 'application/octet-stream' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});

const { port } = server.address();
const browser = await chromium.launch({ channel: 'chromium' });

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    deviceScaleFactor: 1
  });
  await context.route(/^https?:/, route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });

  const brandSvg = await readFile(resolve(root, 'assets/icons/brand-mark.svg'));
  const brandPage = await context.newPage();
  for (const [size, target] of [
    [48, 'assets/icons/icon-48.png'],
    [128, 'assets/icons/icon-128.png'],
    [512, 'assets/images/logo-new-desk-tab.png']
  ]) {
    await brandPage.setViewportSize({ width: size, height: size });
    await brandPage.setContent(`<style>body{margin:0}</style><img src="data:image/svg+xml;base64,${brandSvg.toString('base64')}" width="${size}" height="${size}" style="display:block">`);
    await brandPage.locator('img').evaluate(image => image.decode());
    await brandPage.locator('img').screenshot({ path: resolve(root, target), animations: 'disabled' });
  }
  const logoWebp = await brandPage.locator('img').evaluate(image => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    canvas.getContext('2d').drawImage(image, 0, 0, 512, 512);
    return canvas.toDataURL('image/webp', .94).split(',')[1];
  });
  await writeFile(resolve(root, 'assets/images/logo.webp'), Buffer.from(logoWebp, 'base64'));
  await brandPage.close();

  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/tests/browser-harness.html`);
  await page.getByRole('link', { name: /DEVELOPED BY/ }).waitFor();

  const cards = [
    ['mail', 'Mail', '#ea4335', 0, 0, 2, 1],
    ['calendar', 'Calendar', '#2563eb', 2, 0, 2, 1],
    ['notes', 'Notes', '#7c3aed', 4, 0, 2, 2],
    ['design', 'Design', '#db2777', 0, 1, 2, 1],
    ['projects', 'Projects', '#0891b2', 2, 1, 2, 1],
    ['music', 'Music', '#16a34a', 0, 2, 2, 2],
    ['tasks', 'Tasks', '#f97316', 2, 2, 2, 1],
    ['ideas', 'Ideas', '#9333ea', 4, 2, 2, 1],
    ['chat', 'Chat', '#0284c7', 6, 2, 2, 1],
    ['analytics', 'Analytics', '#0f766e', 2, 3, 2, 1],
    ['finance', 'Finance', '#ca8a04', 4, 3, 2, 1],
    ['docs', 'Documents', '#4f46e5', 6, 3, 2, 1]
  ].map(([id, name, backgroundColor, gx, gy, w, h]) => ({
    id,
    name,
    url: `https://${id}.internal`,
    groupId: 'focus',
    gx,
    gy,
    w,
    h,
    backgroundFavicon: false,
    showFavicon: false,
    showText: true,
    noBackground: false,
    backgroundColor,
    textColor: '#ffffff'
  }));
  cards.push(
    { id: 'read-1', name: 'Articles', url: 'https://articles.internal', folderId: 'reading', groupId: 'focus' },
    { id: 'read-2', name: 'Research', url: 'https://research.internal', folderId: 'reading', groupId: 'focus' }
  );

  const storeWallpaper = `http://127.0.0.1:${port}/src/assets/images/information-cosmos.png`;

  await page.evaluate(({ bookmarks, themeBackground, DATA_SCHEMA_VERSION }) => new Promise(resolveSet => {
    chrome.storage.local.set({
      schemaVersion: DATA_SCHEMA_VERSION,
      bookmarks,
      folders: [{
        id: 'reading',
        name: 'Reading list',
        groupId: 'focus',
        gx: 6,
        gy: 0,
        w: 2,
        h: 2,
        noBackground: false,
        backgroundColor: '#f59e0b',
        textColor: '#ffffff',
        showFolder: true,
        showPreviews: true,
        showName: true,
        showCount: true
      }],
      settings: {
        language: 'en',
        interfaceTheme: 'dark',
        theme: {
          backgroundDefault: false,
          backgroundSolid: false,
          backgroundColor: '#070b18',
          backgroundImageUrl: themeBackground,
          backgroundMedia: [{
            id: 'store-starfield',
            type: 'image',
            backgroundImageUrl: themeBackground,
            backgroundColor: '#070b18'
          }]
        },
        bookmarkGroups: [
          { id: 'focus', name: 'Focus' },
          { id: 'personal', name: 'Personal' },
          { id: 'inspiration', name: 'Inspiration' }
        ],
        activeBookmarkGroupId: 'focus'
      }
    }, resolveSet);
  }), { bookmarks: cards, themeBackground: storeWallpaper, DATA_SCHEMA_VERSION });
  await page.reload();
  await page.locator('#bookmark-container .bookmark').first().waitFor();
  await page.locator('#page-wallpaper-stage .page-wallpaper-layer.is-visible img').waitFor();
  await page.screenshot({
    path: resolve(output, 'screenshot-1280x800.png'),
    animations: 'disabled'
  });
  await page.locator('#settings').evaluate(button => button.click());
  await page.locator('#settings-modal').waitFor({ state: 'visible' });
  await page.screenshot({
    path: resolve(output, 'screenshot-settings-1280x800.png'),
    animations: 'disabled'
  });
  await page.locator('[data-tab="settings-modal-tab-info"]').click();
  await page.locator('#settings-modal-tab-info').waitFor({ state: 'visible' });
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  await page.locator('#settings-modal-tab-info [data-i18n="settingsModal.information.version"]')
    .evaluate((element, version) => { element.textContent = `Version: ${version}`; }, manifest.version);
  await page.screenshot({
    path: resolve(output, 'screenshot-information-1280x800.png'),
    animations: 'disabled'
  });

  const icon = (await readFile(resolve(root, 'assets/icons/icon-128.png'))).toString('base64');
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      html, body { width: 440px; height: 280px; margin: 0; overflow: hidden; }
      body {
        color: #fff; font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        background:
          radial-gradient(circle at 82% 12%, rgba(56,189,248,.35), transparent 32%),
          radial-gradient(circle at 18% 100%, rgba(124,58,237,.42), transparent 38%),
          #070b18;
      }
      main { position: relative; width: 100%; height: 100%; padding: 32px 34px; }
      .brand { display: flex; align-items: center; gap: 18px; }
      .brand img { width: 82px; height: 82px; filter: drop-shadow(0 12px 24px rgba(0,0,0,.4)); }
      h1 { margin: 0; font-size: 37px; letter-spacing: -.045em; line-height: 1; white-space: nowrap; }
      p { margin: 9px 0 0; color: #cbd5e1; font-size: 16px; line-height: 1.35; }
      .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 30px; }
      .card { height: 62px; border: 1px solid rgba(255,255,255,.13); border-radius: 13px;
        background: rgba(255,255,255,.08); box-shadow: 0 14px 30px rgba(0,0,0,.22); }
      .card:nth-child(1) { background: linear-gradient(145deg,#2563eb,#1d4ed8); }
      .card:nth-child(2) { background: linear-gradient(145deg,#7c3aed,#6d28d9); }
      .card:nth-child(3) { background: linear-gradient(145deg,#db2777,#be185d); }
      .card:nth-child(4) { background: linear-gradient(145deg,#0891b2,#0e7490); }
      .card:nth-child(5) { background: linear-gradient(145deg,#16a34a,#15803d); }
      .shine { position:absolute; inset:-80px auto auto 210px; width:280px; height:180px;
        border:1px solid rgba(255,255,255,.08); border-radius:50%; transform:rotate(-18deg); }
    </style></head><body><main>
      <div class="shine"></div>
      <div class="brand"><img src="data:image/png;base64,${icon}" alt="">
        <div><h1>New DeskTab</h1><p>Your new tab, organized your way.</p></div>
      </div>
      <div class="cards"><div class="card"></div><div class="card"></div><div class="card"></div><div class="card"></div><div class="card"></div></div>
    </main></body></html>`);
  await page.screenshot({
    path: resolve(output, 'promo-small-440x280.png'),
    animations: 'disabled'
  });
  await context.close();
  console.log('Created Chrome Web Store assets in assets/store/.');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
