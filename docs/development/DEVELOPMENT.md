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
| `npm run test:packaging` | Store/developer ZIP contents, identity fields, checksums and source preservation; requires Python. |

Install Chromium before running browser tests:

```sh
npx playwright install chromium
npm run test:e2e
npm run test:extension
```

The E2E configuration starts the test server at `127.0.0.1:4175`. The browser
harness simulates Chrome APIs for E2E journeys. The extension smoke test loads
a real extension and checks the new tab, popup, persistence and reload behavior.
Generated outputs stay outside source directories. Keep test reports, temporary
scripts and screenshots in `test-results/` or the system temporary directory.
Keep `dist/` limited to the current Store/developer release ZIPs and their
SHA-256 files; remove translation caches and capture outputs before delivery.

GitHub Actions runs quality checks, a dependency audit, browser journeys,
packaging and smoke tests of both extracted Store and developer packages. See
[ci.yml](../../.github/workflows/ci.yml).

### Bookmark import, folder trees and schema changes

Release 1.1.0 uses public data schema 2, defined by `DATA_SCHEMA_VERSION` in
[`schemaVersion.js`](../../src/platform/storage/schemaVersion.js). Public schema 1
data migrates on load. Use the constant for current-schema fixtures and
`DATA_SCHEMA_VERSION + 1` for future-schema rejection checks; retain explicit
older versions only when a test intends to exercise migration. A folder's
nullable `parentId` represents nesting, and a folder trash entry preserves its
descendants in `folders` alongside its root and bookmarks.

Relevant focused checks are the browser-import preparation, selection and service
unit tests, [`folderContents.test.mjs`](../../tests/folderContents.test.mjs),
[`folderNavigation.test.js`](../../tests/dom/folderNavigation.test.js) and the
browser-import/selection E2E journeys. The
[`capacity-limits journey`](../../tests/e2e/capacityLimits.spec.js) verifies that
a folder can exceed the small grid's 18 visible cells; membership has no fixed
item cap. Compact contents are bounded to 54 rows per page with search and
breadcrumb navigation. Preserve the original performance benchmark's 18-item
folder dataset when comparing its recorded measurements; it is a test fixture,
not the current capacity limit.

For changes to this flow, verify native detection after the first guide, explicit
native/HTML import in Settings, initial empty-folder exclusion, partial subtree
selection, confirmation cancellation and success/error feedback. Check that
imports append to Main in row order, preserve existing items, keep user
subfolders and avoid duplicating unchanged source entries. Test compact folder
edit actions and selected-row reordering as well as small-grid drag behavior.
Use the real-extension smoke check for manifest or Chrome API changes; E2E
fixtures simulate native APIs and do not prove access to a real user profile.

The manifest includes `bookmarks` for read-only native import and
`unlimitedStorage` for large Local collections. Native Chrome bookmarks are never
changed. Unlimited Local storage does not increase Chrome Sync's approximately
100 KB total quota; exercise quota preflight and failed-persistence rollback
when changing import persistence. Reloads and extension updates retain profile
storage, while uninstalling removes extension-owned local data. Use exported
backups to validate restoration into a fresh profile.

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
npm run package:dev
# Or generate both:
npm run package:all
```

Packaging requires Python 3.9 or newer. The npm command invokes `python3`.
If that alias is unavailable, use `python scripts/package-extension.py` or
`py scripts/package-extension.py` with a compatible interpreter. Add `--target dev`
or `--target all` for those variants. The Python
script uses only the standard library and already-bundled runtime resources;
packaging itself does not require `npm ci`.

| Command | Output | Manifest identity |
| --- | --- | --- |
| `npm run package:store` | `dist/newdesktab-<version>.zip` | Omits the public `key` field for Store submission. |
| `npm run package:dev` | `dist/newdesktab-<version>-dev.zip` | Preserves the source public `key` for a stable unpacked ID. |
| `npm run package:all` | Both ZIPs above | Builds each variant independently. |

Each ZIP has a `.zip.sha256` checksum. The source `manifest.json` is never rewritten.
Both ZIPs include only the manifest, `src/`, `_locales/`, `assets/icons/`, the license
and [privacy policy](../../PRIVACY.md). Manifest and package versions must match.
Development dependencies, documentation, tests, private key files and promo-video
media are excluded. Packaging validates CRCs, exact entry sets, the canonical
target manifest and every other file's bytes. Run `npm run test:packaging` for
the regression checks; it creates temporary artifacts without replacing `dist/`.

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
