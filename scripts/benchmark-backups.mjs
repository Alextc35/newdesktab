import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createStaticServer } from './lib/staticServer.mjs';
import { expectAppReady } from '../tests/e2e/helpers/appReady.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const sizes = (process.argv.find(value => value.startsWith('--sizes='))?.slice(8) ?? '10,50,200')
  .split(',').map(Number);
const videoCount = Number(process.argv.find(value => value.startsWith('--count='))?.slice(8) ?? 1);
if (sizes.some(size => !Number.isInteger(size) || size < 1 || size > 200)) {
  throw new Error('Video sizes must be whole MiB between 1 and 200.');
}
if (!Number.isInteger(videoCount) || videoCount < 1 || videoCount > 25) throw new Error('Use 1–25 videos.');
const server = createStaticServer(root);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browserVersion;
const results = [];

try {
  for (const sizeMiB of sizes) {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', headless: true, args: ['--enable-precise-memory-info']
    });
    try {
      await context.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1'
        ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/tests/browser-harness.html`);
      await expectAppReady(page);
      const cdp = await context.newCDPSession(page);
      browserVersion = (await cdp.send('Browser.getVersion')).product;
      await page.evaluate(async ({ size, videoCount }) => {
        const videos = await import('/src/platform/images/localVideos.js');
        const { getState, setState, requirePersistence } = await import('/src/state/appStore.js');
        const block = new Uint8Array(1024 * 1024).fill(90);
        const references = [];
        for (let index = 0; index < videoCount; index++) {
          const file = new File(Array(size).fill(block), `benchmark-${size}MiB-${index}.webm`, { type: 'video/webm' });
          references.push(await videos.saveLocalVideo(file));
        }
        await setState({ data: { bookmarks: [{ id: 'benchmark', name: 'Vídeo 🎬', url: 'https://benchmark.internal' }],
          settings: { ...getState().data.settings, theme: { ...getState().data.settings.theme,
            backgroundDefault: true, backgroundMedia: references.map((local, index) => ({
              id: `video-${index}`, type: 'video', local, source: 'local'
            }))
          } }
        } });
        await requirePersistence();
        window.backupBenchmark = { references, samples: [], phase: 'baseline', output: null, filename: null };
        const sample = point => {
          window.backupBenchmark.samples.push({ phase: window.backupBenchmark.phase, point,
            jsHeapBytes: performance.memory?.usedJSHeapSize ?? null });
        };
        window.backupBenchmark.sample = sample;
        const originalStringify = JSON.stringify;
        JSON.stringify = (...args) => {
          const output = originalStringify(...args);
          if (output?.length > 1024 * 1024) sample('after JSON.stringify');
          return output;
        };
        const originalParse = JSON.parse;
        JSON.parse = (...args) => {
          const large = args[0]?.length > 1024 * 1024;
          if (large) sample('before JSON.parse');
          const output = originalParse(...args);
          if (large) sample('after JSON.parse');
          return output;
        };
        const originalCreateUrl = URL.createObjectURL;
        URL.createObjectURL = blob => {
          if (['application/json', 'application/zip'].includes(blob.type)) {
            window.backupBenchmark.output = blob;
            sample(`${blob.type} Blob created`);
          }
          return originalCreateUrl(blob);
        };
        const originalClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          if (this.download) window.backupBenchmark.filename = this.download;
          if (!this.download) originalClick.call(this);
        };
      }, { size: sizeMiB, videoCount });
      await cdp.send('HeapProfiler.collectGarbage');
      const baseline = await cdp.send('Runtime.getHeapUsage');
      const exported = await page.evaluate(async () => {
        window.backupBenchmark.phase = 'export';
        window.backupBenchmark.timer = setInterval(() => window.backupBenchmark.sample('interval'), 10);
        const start = performance.now();
        await (await import('/src/features/settings/backupActions.js')).exportBackup();
        if (!window.backupBenchmark.output) throw new Error('Backup export produced no Blob.');
        return { durationMs: performance.now() - start, backupBytes: window.backupBenchmark.output.size,
          format: window.backupBenchmark.output.type, filename: window.backupBenchmark.filename };
      });
      const afterExport = await cdp.send('Runtime.getHeapUsage');
      const imported = await page.evaluate(async () => {
        await (await import('/src/state/appStore.js')).clearAllLocalData();
        window.backupBenchmark.phase = 'import';
        const file = new File([window.backupBenchmark.output], window.backupBenchmark.filename,
          { type: window.backupBenchmark.output.type });
        const start = performance.now();
        const restored = await (await import('/src/features/settings/backupActions.js')).importBackup(file);
        return { durationMs: performance.now() - start, restored };
      });
      const afterImport = await cdp.send('Runtime.getHeapUsage');
      if (!imported.restored) {
        results.push({ sizeMiB, exportMs: exported.durationMs, importMs: imported.durationMs,
          videoCount, backupBytes: exported.backupBytes, restored: false, errors, heap: { baseline, afterExport, afterImport } });
        throw new Error(`Import failed for ${sizeMiB} MiB: ${errors.join(' | ')}`);
      }
      const verification = await page.evaluate(async () => {
        const { resolveLocalVideo } = await import('/src/platform/images/localVideos.js');
        const record = window.backupBenchmark;
        clearInterval(record.timer);
        const restoredVideos = [];
        for (const reference of record.references) {
          const stored = await new Promise((resolve, reject) => {
            const open = indexedDB.open('newdesktab-local-videos', 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const database = open.result;
              const transaction = database.transaction('videos', 'readonly');
              const request = transaction.objectStore('videos').get(reference);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
              transaction.oncomplete = () => database.close();
            };
          });
          const blob = stored.blob;
          const first = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
          const last = new Uint8Array(await blob.slice(-64).arrayBuffer());
          restoredVideos.push({ restoredBytes: blob.size, blobUrlAvailable: Boolean(resolveLocalVideo(reference)),
            boundaryBytesMatch: [...first, ...last].every(value => value === 90) });
        }
        return { restoredVideos, samples: record.samples };
      });
      if (!imported.restored || verification.restoredVideos.length !== videoCount
        || verification.restoredVideos.some(video => video.restoredBytes !== sizeMiB * 1024 * 1024
          || !video.boundaryBytesMatch || !video.blobUrlAvailable)) {
        throw new Error('Backup round-trip verification failed.');
      }
      const result = { sizeMiB, exportMs: exported.durationMs, importMs: imported.durationMs,
        videoCount, backupBytes: exported.backupBytes, format: exported.format, filename: exported.filename,
        restored: imported.restored, ...verification,
        heap: { baseline, afterExport, afterImport } };
      results.push(result);
      console.log(`${videoCount} × ${sizeMiB} MiB: export ${(exported.durationMs / 1000).toFixed(2)}s; import ${(imported.durationMs / 1000).toFixed(2)}s; ZIP ${(exported.backupBytes / 1024 / 1024).toFixed(2)} MiB.`);
    } finally {
      await context.close();
    }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  const output = new URL('../docs/benchmarks/', import.meta.url);
  await mkdir(output, { recursive: true });
  const filename = videoCount === 1 ? 'backup-media-zip.json' : `backup-media-zip-${videoCount}-videos.json`;
  await writeFile(new URL(filename, output), JSON.stringify({
    recordedAt: new Date().toISOString(), browser: browserVersion, platform: process.platform,
    methodology: 'Fresh persistent Chromium profile for each size; actual ZIP export/import actions and IndexedDB; synthetic WebM MIME payloads; byte length and boundary verification of every video; JS heap sampled every 10ms, at Blob creation, stringify/parse and CDP checkpoints. Video decoding, download I/O and whole-process RSS are excluded.',
    results
  }, null, 2) + '\n');
}
