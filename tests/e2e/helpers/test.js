import { test as base, expect, chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';

// Opt in to instrumentation; ordinary E2E runs keep production Debug disabled.
export const test = base.extend({
  actionAudit: [async ({ page, browserName }, use, testInfo) => {
    const directory = process.env.NEWDESKTAB_AUDIT_DIR;
    if (!directory || browserName !== 'chromium') return use();
    const timings = [];
    const uiResponses = [];
    await page.exposeFunction('__collectActionTiming', record => { timings.push(record); });
    await page.exposeFunction('__collectUiResponse', record => { uiResponses.push(record); });
    await page.addInitScript(({ enableDebug }) => {
      for (const type of ['click', 'input', 'change', 'keydown', 'pointerup', 'focusin']) {
        document.addEventListener(type, event => {
          const target = event.target.closest?.('[data-field], [id], [data-tab], [data-icon-choice]') || event.target;
          const control = target.dataset?.field || target.id || target.dataset?.tab
            || (target.dataset?.iconChoice !== undefined ? 'icon-choice' : target.tagName);
          const start = performance.now();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            window.__collectUiResponse({ event: type, control, frameMs: performance.now() - start }).catch(() => {});
          }));
        }, true);
      }
      Object.defineProperty(window, 'NewDeskTabDebug', {
        configurable: true,
        set(api) {
          Object.defineProperty(window, 'NewDeskTabDebug', { value: api, configurable: true });
          api.subscribe(record => { window.__collectActionTiming(record).catch(() => {}); });
          if (enableDebug && !api.enabled) queueMicrotask(() => api.toggle());
        }
      });
    }, { enableDebug: !['debug.spec.js', 'uiPerformance.spec.js'].includes(basename(testInfo.file)) });
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await page.coverage.startCSSCoverage({ resetOnNavigation: false });
    await use();
    let javascript = [];
    let styles = [];
    if (!page.isClosed()) {
      [javascript, styles] = await Promise.all([
        page.coverage.stopJSCoverage(), page.coverage.stopCSSCoverage()
      ]);
    }
    const sourceOnly = entries => entries.filter(entry => {
      try { return new URL(entry.url).pathname.startsWith('/src/'); } catch { return false; }
    });
    const id = createHash('sha256').update(testInfo.testId).digest('hex').slice(0, 16);
    await mkdir(resolve(directory), { recursive: true });
    await writeFile(resolve(directory, `${id}.json`), JSON.stringify({
      file: basename(testInfo.file), title: testInfo.titlePath.slice(1).join(' › '),
      status: testInfo.status, expectedStatus: testInfo.expectedStatus,
      durationMs: testInfo.duration, timings, uiResponses,
      javascript: sourceOnly(javascript), styles: sourceOnly(styles)
    }));
  }, { auto: true }]
});

export { expect, chromium };
