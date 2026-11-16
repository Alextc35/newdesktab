# Action auditing and release cleanup

[Documentation index](../README.md) · [Development and diagnostics](../development/DEVELOPMENT.md) · [UI performance](UI_PERFORMANCE.md)

The audit combines E2E journeys, opt-in Debug measurements, visual control
responses and static source analysis. It uses isolated browser profiles rather
than a personal profile.

## Repeat the audit

Run these commands in PowerShell from the repository root:

```powershell
npm run check
$env:NEWDESKTAB_AUDIT_DIR = 'dist/release-audit/actions-new-run'
npm run test:e2e
Remove-Item Env:NEWDESKTAB_AUDIT_DIR
npm run audit:actions -- dist/release-audit/actions-new-run dist/release-audit/actions-summary.json
npm run audit:source -- dist/release-audit/source-summary.json
npm run benchmark:ui -- dist/release-audit/ui-performance.json
node scripts/benchmark-backups.mjs --sizes=10,50,200 --output=dist/release-audit/backup-performance.json
npm run test:extension
```

Use a new directory for each complete run so results from interrupted runs or
older versions do not mix. The suite uses one worker and has no configured
retries. Auditing is disabled during ordinary E2E runs. To benchmark at normal
CPU speed, set `$env:NEWDESKTAB_BENCHMARK_CPU = '1'` before running the UI
benchmark; its default is 4× CPU throttling.

Run benchmarks after the suite has finished, with no other test run competing
for CPU. The backup benchmark's `--output` argument keeps historical measurements
intact by writing the new results elsewhere. Install Playwright's Chromium
before running browser tools; see the [development guide](../development/DEVELOPMENT.md).

Node's coverage for source modules loaded by unit tests can be collected
separately. It excludes DOM/E2E execution and modules those tests do not load:

```powershell
node --experimental-test-coverage --test --test-coverage-include=src/** tests/*.test.mjs
```

If regression tests are added after a complete run without changing product
code, save their audit records in another directory and pass it as an additional
argument to `audit:actions`. Distinguish the runs and include each test only once.
After a product-code change, repeat the complete suite.

## What the measurements mean

- **Debug:** the duration of work identified by each record. Persisted actions
  include preparation, queue wait, writing and notification. A generic modal
  opening measures surface preparation and schedules focus; it does not measure
  all of an editor's work.
- **Benchmark:** synchronous JavaScript for thirteen specific operations,
  measured separately from elapsed time through two `requestAnimationFrame`
  callbacks. Each operation uses two warm-up runs and six samples, reporting
  the median.
- **E2E visual response:** time from capture of a click, input, change, keyboard,
  gesture-end or focus event through two animation frames. It includes frame
  waiting and may include animation; it does not measure completion of an
  asynchronous import, download or write.
- **Backup:** complete export/import action duration for synthetic 10, 50 and
  200 MiB video payloads, using the real actions and IndexedDB. Restored byte
  lengths and boundary bytes are checked. Disk download and video decoding are
  excluded.
- **JavaScript coverage:** V8 functions observed in primary test pages, rather
  than line or branch coverage. **CSS coverage:** the union of source ranges
  Chromium observed applying during the journeys. Extension contexts created
  by some tests receive separate functional checks.

Debug error records are counted separately from E2E outcomes: several tests
deliberately provoke quota, write or import failures to check recovery. E2E
journeys also include simulated delays and clocks, so their percentiles describe
those journeys. Use the controlled benchmark to compare performance. Local or
Sync save timings measure browser writes; cross-device propagation happens later.

## Review cleanup candidates without removing required behavior

`audit:source` follows the new-tab and popup entry graphs, identifies exports
without detected production references, and searches for CSS classes without
literal references. Reviewed template-generated classes have declared dynamic
references. The analysis explicitly retains the widget registration API and the
legacy JSON video-backup exporter, both covered by tests.

A function or rule not exercised by E2E tests is not automatically dead code:
it may support errors, browsers, viewport sizes, accessibility or a public API.
Removal requires checking source, DOM, tests and compatibility. The project-health
test checks that every source stylesheet and JavaScript module remains connected
to an application entry.

## Collect Debug measurements on another computer

In DevTools, `NewDeskTabDebug.toggle()` enables recording. To collect more than
the hundred operations retained by the history during one session:

```js
const timings = [];
const unsubscribe = NewDeskTabDebug.subscribe(record => timings.push(record));
// Perform the actions you want to measure.
unsubscribe();
console.table(timings.map(({ label, durationMs, status }) => ({ label, durationMs, status })));
```

Windows/Chromium test results, with external network media blocked, do not
replace measurements on other hardware or checks of real cross-device Sync.
