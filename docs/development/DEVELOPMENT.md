# Development and diagnostics

[Documentation index](../README.md) · [Architecture](../architecture/ARCHITECTURE.md) · [Contributing](../../CONTRIBUTING.md)

New DeskTab uses native JavaScript modules, HTML and CSS. The source extension
can be loaded directly from the repository. Node-based tools provide checks,
measurements and release preparation.

## Set up the environment

Use Node.js 24, matching GitHub Actions, and install the versions in the lockfile:

```sh
npm ci
npm run check
```

To open the source extension, enable Developer mode in `chrome://extensions` or
`brave://extensions`, choose **Load unpacked**, and select the repository root.
Chrome/Chromium 123 or newer is required. Open a new tab. After editing source
files, reload the extension and the affected tab.

The [technical project guide](../architecture/PROJECT_GUIDE.md) explains startup
and where to make each kind of change. The [contribution guidelines](../../CONTRIBUTING.md)
define the boundaries that new dependencies must respect.

## Run checks

| Command | What it checks |
| --- | --- |
| `npm run lint` | ESLint rules. |
| `npm run test:unit` | Models, schemas, storage and algorithms with `node:test`. |
| `npm run test:dom` | Component behavior with Vitest and jsdom. |
| `npm test` | Unit and component tests. |
| `npm run check` | ESLint and `npm test`. |
| `npm run test:e2e` | Playwright user journeys with the local test server. |
| `npm run test:extension` | A real extension in a fresh temporary browser profile. |

Install Chromium before running browser tests:

```sh
npx playwright install chromium
npm run test:e2e
npm run test:extension
```

The E2E configuration starts the test server at `127.0.0.1:4175`. The browser
harness simulates Chrome APIs for E2E journeys. The extension smoke test loads
a real extension and checks the new tab, popup, persistence and reload behavior.
Generated outputs stay outside source directories, for example in `test-results/`
and `dist/`.

GitHub Actions runs quality checks, a dependency audit, browser journeys,
packaging and a smoke test of the extracted release package. See
[ci.yml](../../.github/workflows/ci.yml).

### Choose a browser or extension package

The smoke test accepts these environment variables:

| Variable | Purpose |
| --- | --- |
| `NEWDESKTAB_BROWSER_PATH` | Browser executable to test. Also supported by the E2E configuration. |
| `NEWDESKTAB_EXTENSION_PATH` | Unpacked extension directory, including an extracted release ZIP. |
| `NEWDESKTAB_EXTENSION_CDP=1` | Use the DevTools loading path for installed Google Chrome 137 or newer. |

In a POSIX shell:

```sh
NEWDESKTAB_BROWSER_PATH="/path/to/browser" npm run test:extension
NEWDESKTAB_EXTENSION_PATH="/path/to/extracted-release" npm run test:extension
```

In PowerShell:

```powershell
$env:NEWDESKTAB_BROWSER_PATH = 'C:\path\chrome.exe'
$env:NEWDESKTAB_EXTENSION_PATH = 'D:\path\extracted-extension'
npm run test:extension
Remove-Item Env:NEWDESKTAB_BROWSER_PATH, Env:NEWDESKTAB_EXTENSION_PATH
```

Chromium, Chrome for Testing and Brave use the default extension-loading path.
When choosing an installed Google Chrome 137-or-newer executable, enable the
CDP option above. Each smoke test uses a fresh temporary profile.

## Debug console

Open DevTools in a New DeskTab tab. The configuration in
[`debug.js`](../../src/shared/diagnostics/debug.js) disables Debug by default.
These commands are available even while logging is disabled:

```js
NewDeskTabDebug.toggle()       // Enable or disable logging in this tab.
NewDeskTabDebug.enabled        // Read the current state.
await NewDeskTabDebug.report() // Produce an up-to-date report.
NewDeskTabDebug.history()      // Read the last 100 completed operations.
NewDeskTabDebug.clear()        // Clear the console, history and pending traces.
```

Filter the console by `[NewDeskTab Debug]`. Records use colored labels, initially
collapsed groups and the browser's local time. Durations are in milliseconds.
The toggle applies to the current tab and resets to the configured default
when the tab reloads.

The report includes the extension version, storage mode, Sync support, storage
usage, item counts and startup timings. Create, edit, delete and duplicate
operations separate preparation, queue wait and storage writes. Editors,
modals, search, rendering and grid gestures are also instrumented.

Startup measurements remain available for the report, but operations are only
recorded while Debug is enabled. Disabling Debug keeps its history; clearing it
also discards pending traces without disabling logging. Rendering is timed
separately from persistence. Startup does not wait for remote images, and Sync
timings measure browser storage writes rather than cross-device propagation.

To observe records beyond the bounded history:

```js
const stop = NewDeskTabDebug.subscribe(record => console.log(record));
// Reproduce the actions you want to measure.
stop();
```

## Measure performance and review source

```sh
npm run benchmark:ui -- dist/ui-performance.json
npm run audit:source
npm run audit:actions
```

Run `audit:actions` only after collecting E2E audit records as described in the
[action-audit procedure](../benchmarks/ACTION_AUDIT.md#repeat-the-audit). Pass
the recorded input directory and desired output path when using a custom run.

The UI benchmark measures thirteen actions with isolated profiles, datasets of
60 and 1,200 synthetic bookmarks, an 18-item folder, a 60-item recycle bin and
CPU throttling. Read the [UI methodology](../benchmarks/UI_PERFORMANCE.md) and
[action audit](../benchmarks/ACTION_AUDIT.md) before interpreting results,
collecting coverage or comparing changes.

The source audit identifies candidates, including modules, CSS classes and
exports without detected references. Review dynamic paths, public APIs,
compatibility and tests before removing a candidate.

Run `node scripts/benchmark-backups.mjs` to repeat the media-backup study. Its
methods and format comparison are described in [Media backups](../benchmarks/BACKUP_MEDIA.md).

## Package the extension

```sh
npm run package:store
```

Packaging requires Python 3.9 or newer. The npm command invokes `python3`.
If that alias is unavailable, use `python scripts/package-extension.py` or
`py scripts/package-extension.py` with a compatible interpreter. The Python
script uses only the standard library and already-bundled runtime resources;
packaging itself does not require `npm ci`.

The output is `dist/newdesktab-<version>.zip` and a `.zip.sha256` checksum file.
The ZIP includes the manifest, `src/`, `_locales/`, `assets/icons/`, the license
and [privacy policy](../../PRIVACY.md). Manifest and package versions must match.
Development dependencies, documentation, tests and demo media are excluded.

Extract the ZIP into a clean directory and run the smoke test with
`NEWDESKTAB_EXTENSION_PATH` pointing to it before publishing. The
[Chrome Web Store guide](../releases/CHROME_WEB_STORE.md) covers the full
procedure, listing, permissions and privacy declarations.

### Visual assets, translations and bundled libraries

| Command or file | Purpose |
| --- | --- |
| `npm run assets:store` | Generate brand icons, logos, four store screenshots and the promotional tile. |
| `npm run assets:store -- --screens-only` | Keep brand icons and regenerate screenshots and the promotional tile. |
| `npm run assets:store -- --main-only` | Refresh only the main workspace screenshot. |
| `node scripts/generate-locales.mjs` | Generate translations during development; requires network access. |
| `scripts/locale-overrides.json` | Curated corrections for the translation generator. |
| `npm run vendor:zip` | Prepare the bundled ZIP library and its license. |
| `npm run vendor:domains` | Prepare the bundled domain parser and its license. |

The original logo is `assets/icons/brand-mark.svg`. Store assets are written to
`assets/store/`; inspect them visually after regeneration. The
[localization guide](LOCALIZATION.md) covers caches, corrections and language
review. The extension uses bundled dictionaries and does not contact a
translation service when switching languages.

## Verify Sync

Cross-device synchronization requires the same extension ID on every install.
Chrome Web Store distribution provides that identity; development installs
need a stable manifest key or a consistent packaging workflow.

Automated tests exercise storage behavior, formats and change reconciliation.
Real Chrome Sync propagation must be checked using two Google Chrome profiles
or devices with synchronization configured. Brave and other Chromium browsers
use Local mode. The [user guide](../guide/USER_GUIDE.md) explains the options
and limitations.
