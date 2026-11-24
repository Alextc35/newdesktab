import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { findBrowser } from './browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = resolve(here, '../public/captures');
const raw = resolve(out, '_raw');
await mkdir(raw, { recursive: true });
await mkdir(resolve(here, '../output'), { recursive: true });
const executablePath = findBrowser() ?? chromium.executablePath();
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const report = { productVersion: manifest.version, mode: 'unpacked-extension', viewport: { width: 1440, height: 900 }, stillSize: { width: 1920, height: 1200 }, screenshots: [], clips: [], checks: [], errors: [], fixture: 'Curated sample bookmarks open real websites. These are user bookmark cards, not built-in apps.' };
const context = await chromium.launchPersistentContext('', {
  executablePath, headless: true, viewport: report.viewport, deviceScaleFactor: 4 / 3,
  colorScheme: 'dark', timezoneId: 'Europe/Madrid',
  recordVideo: { dir: raw, size: report.viewport },
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--headless=new', '--no-first-run'],
});
const page = await context.newPage();
const video = page.video();
const recordingStart = performance.now();
const elapsed = () => (performance.now() - recordingStart) / 1000;
page.on('pageerror', e => report.errors.push(e.message));
await context.route(/^https?:/, route => route.abort());
const hold = ms => page.waitForTimeout(ms);
let pointerReady = false;
async function pointer(show = true) {
  if (!pointerReady) {
    await page.evaluate(() => {
      const el = document.createElement('div'); el.id = 'promo-capture-pointer';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:26px;height:32px;filter:drop-shadow(0 2px 3px #0009);display:none';
      el.innerHTML = '<svg viewBox="0 0 24 30" width="24" height="30"><path d="M3 2v23l6-6 4 9 4-2-4-9h8Z" fill="white" stroke="#17233e" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      document.body.append(el);
      window.addEventListener('pointermove', ev => { el.style.transform = `translate(${ev.clientX}px,${ev.clientY}px)`; }, true);
    });
    pointerReady = true;
  }
  await page.locator('#promo-capture-pointer').evaluate((el, visible) => { el.style.display = visible ? 'block' : 'none'; }, show);
}
async function still(name) {
  await pointer(false);
  await page.waitForFunction(() => document.querySelectorAll('.flash-message.show').length === 0);
  await hold(350);
  await hold(180);
  await page.screenshot({ path: resolve(out, `${name}.png`), animations: 'disabled' });
  report.screenshots.push(`${name}.png`);
  console.log(`Captured ${name}.png`);
}
async function motion(name, action, minimumSeconds = 5) {
  await pointer(true);
  const start = elapsed();
  await hold(450);
  await action();
  const remaining = minimumSeconds - (elapsed() - start);
  await hold(Math.max(750, remaining * 1000));
  report.clips.push({ name, start, duration: elapsed() - start });
  await pointer(false);
  console.log(`Recorded ${name}`);
}
async function saved() {
  await page.waitForFunction(async () => (await import(chrome.runtime.getURL('src/state/appStore.js'))).getState().ui.persistence.status === 'saved');
}
async function data() { return page.evaluate(async () => (await import(chrome.runtime.getURL('src/state/appStore.js'))).getState().data); }
async function move(x, y, milliseconds = 900) {
  const before = await page.evaluate(() => {
    const transform = document.getElementById('promo-capture-pointer')?.style.transform || '';
    const match = transform.match(/translate\(([-.\d]+)px,\s*([-.\d]+)px\)/);
    return match ? [Number(match[1]), Number(match[2])] : [700, 700];
  });
  const n = 30;
  for (let i = 1; i <= n; i++) {
    const p = i / n; const ease = p * p * (3 - 2 * p);
    await page.mouse.move(before[0] + (x - before[0]) * ease, before[1] + (y - before[1]) * ease);
    await hold(milliseconds / n);
  }
}

try {
  await page.clock.setFixedTime(new Date('2026-11-22T10:24:00+01:00'));
  await page.goto('chrome://newtab/');
  await page.locator('#bookmark-container[tabindex="-1"]').waitFor();
  assert.match(page.url(), /^chrome-extension:\/\//);
  report.extensionUrl = page.url();
  await page.evaluate(async () => {
    const { createDefaultPersistedData } = await import(chrome.runtime.getURL('src/platform/storage/persistedDataDefaults.js'));
    const blank = createDefaultPersistedData();
    blank.settings.language = 'en'; blank.settings.interfaceTheme = 'dark'; blank.settings.showRecycleBin = false;
    await chrome.storage.local.set({ ...blank, newdesktabOnboarding: { version: 1, status: 'completed' }, newdesktabReleaseNotes: { version: chrome.runtime.getManifest().version }, newdesktabDailyTips: { enabled: false } });
  });
  await page.reload(); await page.locator('#bookmark-container[tabindex="-1"]').waitFor();
  await hold(1000); await still('plain');

  await page.evaluate(async () => {
    const { createDefaultPersistedData } = await import(chrome.runtime.getURL('src/platform/storage/persistedDataDefaults.js'));
    const { DEFAULT_BOOKMARK } = await import(chrome.runtime.getURL('src/domain/bookmarks/bookmarkDefaults.js'));
    const { DEFAULT_FOLDER_STYLE } = await import(chrome.runtime.getURL('src/domain/folders/folderDefaults.js'));
    const { normalizeCatalogIconId } = await import(chrome.runtime.getURL('src/shared/icons/iconCatalog.js'));
    const value = createDefaultPersistedData();
    const cards = [
      ['mail', 'Gmail', 'https://mail.google.com', '#ce585a', 1, 1, 2, 1],
      ['calendar', 'Google Calendar', 'https://calendar.google.com', '#4268cc', 3, 1, 2, 1],
      ['notes', 'Notion', 'https://www.notion.so', '#7653bb', 5, 1, 2, 2],
      ['projects', 'GitHub', 'https://github.com', '#258b9a', 1, 2, 2, 1],
      ['design', 'Figma', 'https://www.figma.com', '#c55a8a', 3, 2, 2, 1],
      ['music', 'Spotify', 'https://open.spotify.com', '#288574', 1, 3, 2, 2],
      ['tasks', 'Linear', 'https://linear.app', '#bd8749', 3, 3, 2, 1],
      ['ideas', 'Wikipedia', 'https://www.wikipedia.org', '#705bb3', 5, 3, 2, 1],
      ['docs', 'Google Drive', 'https://drive.google.com', '#4868a8', 3, 4, 2, 1],
    ];
    value.bookmarks = cards.map(([id, name, url, backgroundColor, gx, gy, w, h]) => ({ ...DEFAULT_BOOKMARK, id, name, url, backgroundColor, gx, gy, w, h, iconId: normalizeCatalogIconId(id), noBackground: false, backgroundFavicon: true, showFavicon: false, showText: true }));
    const inside = [
      ['mdn', 'MDN Web Docs', 'https://developer.mozilla.org', 'docs', '#496ba9'],
      ['webdev', 'web.dev', 'https://web.dev', 'projects', '#28929a'],
      ['github-resources', 'GitHub', 'https://github.com', 'projects', '#7553b2'],
      ['react', 'React', 'https://react.dev', 'ui-code', '#308caa'],
      ['typescript', 'TypeScript', 'https://www.typescriptlang.org', 'docs', '#4268cc'],
      ['remotion', 'Remotion', 'https://www.remotion.dev', 'design', '#bd5a8c'],
    ];
    value.bookmarks.push(...inside.map(([id, name, url, iconId, backgroundColor], index) => ({ ...DEFAULT_BOOKMARK, id, name, url, iconId: normalizeCatalogIconId(iconId), backgroundColor, noBackground: false, backgroundFavicon: true, showFavicon: false, folderId: 'reading', gx: index, gy: 0, w: 1, h: 1 })));
    value.folders = [{ ...DEFAULT_FOLDER_STYLE, id: 'reading', name: 'Resources', groupId: null, gx: 5, gy: 4, w: 2, h: 1, noBackground: false, backgroundColor: '#b78736', textColor: '#ffffff', showPreviews: true, showName: true },
      { ...DEFAULT_FOLDER_STYLE, id: 'inspiration', name: 'Inspiration', groupId: null, gx: 8, gy: 3, w: 2, h: 2, noBackground: false, backgroundColor: '#213553', textColor: '#ffffff', backgroundImageUrl: chrome.runtime.getURL('src/features/onboarding/assets/multimedia-landscape.svg'), showPreviews: false, showName: true },
      { ...DEFAULT_FOLDER_STYLE, id: 'cloud', name: 'Cloud', groupId: null, gx: 10, gy: 3, w: 1, h: 1, iconId: 'ui-cloud', iconColor: '#b5d8ed', backgroundColor: '#9fc1d8', noBackground: true, showPreviews: false, showName: true }];
    value.widgets = [{ id: 'promo-clock', type: 'clock', version: 1, groupId: null, gx: 8, gy: 1, w: 3, h: 1, config: { hourCycle: '24', showSeconds: false } }];
    value.recycleBin = { ...value.recycleBin, gx: 10, gy: 4, w: 1, h: 1, noBackground: true, iconColor: '#cbd5e1', textColor: '#ffffff', showName: true };
    const { saveLocalImage } = await import(chrome.runtime.getURL('src/platform/images/localImages.js'));
    const cosmosBlob = await fetch(chrome.runtime.getURL('src/assets/images/information-cosmos.png')).then(response => response.blob());
    const cosmos = await saveLocalImage(new File([cosmosBlob], 'newdesktab-cosmos.png', { type: 'image/png' }));
    value.settings = { ...value.settings, language: 'en', interfaceTheme: 'dark', showRecycleBin: true,
      mainWorkspace: { ...value.settings.mainWorkspace, name: 'My space' },
      theme: { ...value.settings.theme, backgroundDefault: false, backgroundSolid: false, backgroundColor: '#070b18', backgroundImageLocal: cosmos, backgroundImageSource: 'local', backgroundMedia: [{ id: 'promo-cosmos', type: 'image', backgroundImageLocal: cosmos, backgroundImageSource: 'local', backgroundColor: '#070b18' }] },
      bookmarkGroups: [{ id: 'focus', name: 'Focus', themeEnabled: true, backgroundSolid: true, backgroundColor: '#102031' }, { id: 'personal', name: 'Personal', themeEnabled: true, backgroundSolid: true, backgroundColor: '#261d37' }], activeBookmarkGroupId: null };
    const extra = [
      ['focus-mail', 'Gmail', 'https://mail.google.com', 'mail', '#ce585a', 2, 1, 2, 1, 'focus'],
      ['focus-projects', 'GitHub', 'https://github.com', 'projects', '#258b9a', 4, 1, 2, 2, 'focus'],
      ['focus-notes', 'Notion', 'https://www.notion.so', 'notes', '#7653bb', 6, 1, 2, 1, 'focus'],
      ['focus-design', 'Figma', 'https://www.figma.com', 'design', '#c55a8a', 2, 2, 2, 1, 'focus'],
      ['focus-docs', 'Google Drive', 'https://drive.google.com', 'docs', '#4868a8', 6, 2, 2, 1, 'focus'],
      ['personal-music', 'Spotify', 'https://open.spotify.com', 'music', '#288574', 2, 1, 3, 2, 'personal'],
      ['personal-video', 'YouTube', 'https://www.youtube.com', 'video', '#c85c67', 5, 1, 2, 1, 'personal'],
      ['personal-wiki', 'Wikipedia', 'https://www.wikipedia.org', 'ideas', '#705bb3', 7, 1, 2, 1, 'personal'],
      ['personal-photos', 'Google Photos', 'https://photos.google.com', 'camera', '#b58d45', 5, 2, 2, 1, 'personal'],
      ['personal-reading', 'Pocket', 'https://getpocket.com', 'docs', '#537cc0', 7, 2, 2, 1, 'personal'],
    ];
    value.bookmarks.push(...extra.map(([id, name, url, iconId, backgroundColor, gx, gy, w, h, groupId]) => ({ ...DEFAULT_BOOKMARK, id, name, url, iconId: normalizeCatalogIconId(iconId), backgroundColor, gx, gy, w, h, groupId, noBackground: false, backgroundFavicon: true, showFavicon: false })));
    const { saveDeviceWallpapers } = await import(chrome.runtime.getURL('src/platform/storage/deviceWallpapers.js'));
    const { saveDeviceImageSelections } = await import(chrome.runtime.getURL('src/platform/storage/deviceImageSelections.js'));
    await saveDeviceWallpapers(value);
    await saveDeviceImageSelections(value);
    await chrome.storage.local.set(value);
  });
  await page.reload(); pointerReady = false;
  await page.locator('#bookmark-container[tabindex="-1"]').waitFor();
  await page.locator('.clock-widget').waitFor();
  await page.locator('#page-wallpaper-stage .is-visible img.is-ready').waitFor();
  await page.evaluate(async () => { await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); await document.fonts.ready; });
  await page.mouse.move(720, 890); await hold(700); await still('overview');
  report.checks.push({ check: 'real-extension', url: page.url(), topLevelBookmarks: await page.locator('#bookmark-container > .bookmark:not(.folder)').count(), saved: (await data()).bookmarks.length });

  await motion('drag', async () => {
    await page.keyboard.press('KeyE'); await hold(500);
    const source = page.locator('[data-bookmark-id="ideas"]');
    const b = await source.boundingBox();
    const grid = await page.locator('#bookmark-container').boundingBox();
    await move(b.x + b.width / 2, b.y + b.height / 2, 500);
    await page.mouse.down(); await hold(260);
    const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
    const cw = grid.width / 12; const ch = grid.height / 6;
    await move(cx + cw, cy, 400);
    await move(cx + 2 * cw, cy - ch, 600);
    await move(cx + 3 * cw, cy - ch, 400);
    await hold(350); await page.mouse.up(); await saved();
  }, 5.5);
  const moved = (await data()).bookmarks.find(b => b.id === 'ideas');
  assert.deepEqual([moved.gx, moved.gy], [8, 2]);
  report.checks.push({ check: 'real-pointer-drag', item: 'ideas', before: [5, 3], after: [moved.gx, moved.gy] });

  await motion('resize', async () => {
    const handle = page.locator('[data-bookmark-id="notes"] .resizer.bottom');
    const b = await handle.boundingBox();
    const grid = await page.locator('#bookmark-container').boundingBox();
    await move(b.x + b.width / 2, b.y + b.height / 2, 600);
    await page.mouse.down(); await hold(250);
    await move(b.x + b.width / 2, b.y + b.height / 2 + grid.height / 6, 1300);
    await hold(300); await page.mouse.up(); await saved(); await hold(500);
    await page.keyboard.press('KeyE');
  }, 5.2);
  const resized = (await data()).bookmarks.find(b => b.id === 'notes');
  assert.equal(resized.h, 3);
  report.checks.push({ check: 'real-pointer-resize', item: 'notes', before: [2, 2], after: [resized.w, resized.h] });
  await still('arranged');

  await motion('folder', async () => {
    const button = page.locator('[data-folder-id="reading"] .folder-open');
    const b = await button.boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2, 700); await button.click();
    await page.locator('#folder-modal').waitFor({ state: 'visible' }); await hold(700);
    await move(820, 440, 800);
  }, 5.4);
  await still('folder');
  assert.equal(await page.locator('#folder-modal .folder-grid-bookmark').count(), 6);
  report.checks.push({ check: 'folder-contents', folder: 'Resources', bookmarks: 6 });
  await page.keyboard.press('Escape'); await hold(300);

  await motion('style', async () => {
    await page.keyboard.press('KeyE'); await hold(300);
    const edit = page.locator('[data-bookmark-id="design"] .item-action-button.edit');
    const b = await edit.boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2, 550); await edit.click();
    const editor = page.locator('#edit-bookmark-modal'); await editor.waitFor({ state: 'visible' });
    await editor.getByRole('tab', { name: 'Style', exact: true }).click(); await hold(400);
    const look = editor.locator('[data-appearance-look="midnight"]');
    if (await look.count()) { const b = await look.boundingBox(); await move(b.x + b.width / 2, b.y + b.height / 2, 650); await look.click(); }
  }, 5.5);
  await still('style');
  await page.locator('#edit-bookmark-modal-save').click();
  await page.locator('#edit-bookmark-modal').waitFor({ state: 'hidden' });
  await saved();
  report.checks.push({ check: 'real-style-save', item: 'design', backgroundColor: (await data()).bookmarks.find(item => item.id === 'design').backgroundColor });
  await page.keyboard.press('KeyE'); await hold(350);

  async function chooseWorkspace(id) {
    await page.mouse.move(720, 890); await hold(310); await page.locator('#workspace-toggle').click(); await hold(290);
    await page.locator(`.workspace-option[data-workspace-id="${id}"]`).click(); await hold(500);
  }
  await chooseWorkspace('focus');
  await page.mouse.move(720, 890); await still('workspace-focus');
  assert.equal((await data()).settings.activeBookmarkGroupId, 'focus');
  report.checks.push({ check: 'workspace-switch', active: 'focus', cards: await page.locator('#bookmark-container > .bookmark').count() });
  await chooseWorkspace(''); await hold(3200);
  await motion('workspace', async () => {
    await chooseWorkspace('focus'); await hold(300);
    await chooseWorkspace('personal');
  }, 6.3);
  await page.mouse.move(720, 890); await still('workspace-personal');
  assert.equal((await data()).settings.activeBookmarkGroupId, 'personal');

  await motion('search', async () => {
    await page.keyboard.press('Slash'); await page.locator('#search-modal').waitFor({ state: 'visible' });
    await hold(350); await page.locator('#search-modal-input').pressSequentially('GitHub', { delay: 180 }); await hold(550);
    await move(820, 450, 650);
  }, 4.6);
  await still('search');
  const searchCount = await page.locator('#search-modal-results .search-result').count();
  assert.equal(searchCount, 3); report.checks.push({ check: 'cross-workspace-search', query: 'GitHub', results: searchCount });
  await page.keyboard.press('Escape'); await hold(500);
  await chooseWorkspace(''); await hold(1000);
  await page.mouse.move(720, 890); await hold(500); await still('final-overview');
  assert.equal((await data()).settings.activeBookmarkGroupId, null);
  report.finalData = await data();
} catch (error) {
  report.errors.push(error.stack); console.error(error);
  await page.screenshot({ path: resolve(out, 'capture-error.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await page.close();
  await video.saveAs(resolve(raw, 'capture-session.webm'));
  await context.close();
  for (const clip of report.clips) {
    const target = resolve(out, `${clip.name}.mp4`);
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', clip.start.toFixed(3), '-i', resolve(raw, 'capture-session.webm'), '-t', clip.duration.toFixed(3), '-vf', 'scale=1920:1200:flags=lanczos,fps=60', '-c:v', 'libx264', '-crf', '17', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', target]);
    clip.file = `${clip.name}.mp4`;
    clip.encoded = JSON.parse(execFileSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', target], { encoding: 'utf8' }));
  }
  for (const name of await readdir(raw)) {
    if (/^page@[a-f0-9]+\.webm$/.test(name)) await unlink(resolve(raw, name));
  }
  if (!report.errors.length) await unlink(resolve(out, 'capture-error.png')).catch(() => {});
  await writeFile(resolve(here, '../output/capture-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mode: report.mode, screenshots: report.screenshots, clips: report.clips.map(({ file, duration }) => ({ file, duration })), errors: report.errors }, null, 2));
}
