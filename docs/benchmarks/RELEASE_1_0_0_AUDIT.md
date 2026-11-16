# Historical release audit — New DeskTab 1.0.0

[Documentation index](../README.md) · [Audit procedure](ACTION_AUDIT.md) · [Release review](../releases/RELEASE_REVIEW.md)

This report records the audit completed on **14 October 2026 on Windows**.
Its counts, package identity and measurements describe that snapshot, not the
current checkout. The committed
[structured results](RELEASE_1_0_0_RESULTS.json) preserve the summary evidence.

The recorded automated validation passed: **283 unit tests, 76 DOM tests and
338 E2E tests**, with lint passing. The complete suite used one worker without
retries or skipped cases. The ZIP was checked byte for byte and smoke-tested as
an installed extension in Chromium, Google Chrome and Brave with fresh profiles.

## Measured performance and changes

Opening the recycle bin was the main bottleneck. Each row copied the entire
library to read retention settings and created another date formatter. The
change used a single snapshot to build the list, shared retention across rows
and reused a formatter per language. Opening the bin made two isolated copies
in total—expiration checking and rendering—instead of one per row.

With 1,200 bookmarks, 18 additional bookmarks in a folder and 60 recycle-bin
entries, median opening time fell from **987.45 to 49.60 ms (95.0% lower)**
under 4× CPU throttling. Folder and recycle-bin views retained their nodes,
selection and focus after UI changes unrelated to their data. Regression tests
checked that behavior and the removal of per-row state copies.

### Controlled benchmark

Chromium 151.0.7922.34 on Windows, 1440 × 900 viewport, external media blocked,
Debug enabled, two warm-up runs and six samples per interaction. Both profiles
had 60 visible bookmarks, a folder with 18 bookmarks and 60 recycle-bin entries;
the base library had 60 or 1,200 bookmarks.

Values are medians of **synchronous JavaScript work**, in milliseconds. Time
through two animation frames is recorded separately in the benchmark JSON;
these values do not measure Sync propagation or download duration.

| Action | Library 60, CPU 4× | Library 1,200, CPU 4× | Library 1,200, normal CPU |
| --- | ---: | ---: | ---: |
| Open settings | 10.80 | 10.65 | 1.55 |
| Open bookmark editor | 32.35 | 45.30 | 7.35 |
| Edit name | 9.75 | 5.95 | 1.40 |
| Rebuild grid | 27.55 | 42.00 | 7.05 |
| Resize grid | 4.30 | 19.10 | 3.10 |
| Open folder with 18 bookmarks | 67.25 | 97.85 | 17.70 |
| Open folder editor | 15.30 | 31.00 | 7.45 |
| Open recycle bin with 60 entries | 27.85 | 49.60 | 10.30 |
| Open recycle-bin editor | 13.90 | 28.50 | 5.35 |
| Open search | 7.25 | 17.20 | 4.15 |
| Filter search | 4.15 | 17.60 | 2.85 |
| Open widget catalog | 3.10 | 3.05 | 0.60 |
| Open clock creation | 4.25 | 4.30 | 0.85 |

Only the corrected bottleneck is assigned an improvement percentage. Small
variations in other actions are not presented as optimizations.

### Timings across the complete E2E journeys

The audit collected **2,707 Debug records**, grouped into 70 operations/contexts,
and **8,051 visual responses** across 614 controls/event types. Persisted commands
include preparation, queue wait, writing and notification; generic modal
preparation is measured separately from the complete editor.

| Operation | Successful samples | Median ms | P95 ms |
| --- | ---: | ---: | ---: |
| Create bookmark | 67 | 12 | 30.1 |
| Create folder | 77 | 12.7 | 24.5 |
| Delete bookmarks | 32 | 12.8 | 52.3 |
| Edit bookmark | 22 | 20.05 | 46.2 |
| Open bookmark editor | 88 | 6 | 9.6 |
| Open settings | 132 | 3.8 | 5 |
| Prepare grid drag | 71 | 0.4 | 0.8 |
| Render grid | 487 | 3.4 | 9.3 |
| Save daily tips preference | 4 | 18.65 | 31.6 |
| Save settings | 95 | 26.3 | 61.9 |
| Search bookmarks | 4 | 0.2 | 0.4 |
| Switch workspace | 6 | 4.05 | 5.8 |

The E2E journeys use different libraries and include simulated failures, delays
and clocks. Their percentiles describe those test journeys; performance
comparisons rely on the controlled benchmark. Debug error records from failure
and recovery tests are counted separately from E2E results.

### Backups: complete asynchronous duration

The real export/import actions ran at normal CPU speed in a fresh persistent
Chromium profile for each size. Video files contained synthetic bytes with a
WebM MIME type. Restoration checked each file's size, boundary bytes and local
URL availability in IndexedDB. Timings cover download Blob generation and
restoration, excluding disk download and video playback.

There was one run per scenario; these are not medians or guaranteed limits.

| Videos | Export ms | Import ms | ZIP MiB |
| --- | ---: | ---: | ---: |
| 1 × 10 MiB | 69.60 | 72.40 | 10.00 |
| 1 × 50 MiB | 250.10 | 263.60 | 50.00 |
| 1 × 200 MiB | 804.90 | 1064.40 | 200.00 |
| 2 × 200 MiB | 1538.50 | 2946.80 | 400.00 |

## Coverage and cleanup at the audit date

- **199 JavaScript modules and 47 stylesheets** were connected to their entries.
  The static analysis found no orphan modules or classes/exports awaiting
  justification in that snapshot.
- **12 older functions or constants** were removed. Duplication, movement and
  deletion were tested through the same actions used by the interface and
  shared by bookmarks, folders and widgets.
- Eight dynamically generated CSS classes had reviewed references. Rules,
  controls and translations for hiding the folder silhouette were removed
  because that behavior was no longer offered.
- The public widget registry API and compatible legacy JSON video-backup
  exporter were retained with their tests. Coverage alone was not used to
  remove APIs, error paths or accessibility rules.
- Primary E2E pages exercised **82.42% of observed V8 functions** and
  **90.64% of CSS source text**. These are not line or branch percentages,
  or guarantees about unvisited states. Excluding vendored dependencies,
  exercised V8 functions reached **90.84%** in application modules loaded by
  those pages. Much of the remaining total belonged to ZIP-library options;
  absence from a journey was not grounds for removal.
- A separate unit-coverage run reported **91.45% of lines**, **76.39% of branches**
  and **74.54% of functions** across the **77 source modules loaded by Node**.
  It excluded DOM/E2E execution and unloaded modules. It is not combined with
  Chromium coverage or presented as whole-application coverage.
- The recorded `npm audit` result contained **zero known vulnerabilities** in
  production and development dependencies. This is a dated result; rerun the
  audit to assess current dependency advisories.

The audit covered creation/editing, presets, local and remote images, color and
inversion, history, single/multiple selection, all drag and resize modes, handles
and recycle-bin drop targets, folders and contents, restoration/deletion,
workspaces, clock, search, settings, languages, shortcuts, Sync failures,
JSON/ZIP backups, popup, concurrency, welcome guide, manual and daily tips.

### Historical E2E inventory

The complete suite included three capacity journeys added for this audit.

| Journey file | Passed cases |
| --- | ---: |
| backupMedia.spec.js | 10 |
| behaviorPreviews.spec.js | 8 |
| bookmarkIconColor.spec.js | 2 |
| bookmarkJourneys.spec.js | 68 |
| bulkPersistence.spec.js | 10 |
| capacityLimits.spec.js | 3 |
| clockWidget.spec.js | 8 |
| compactView.spec.js | 22 |
| concurrentTabs.spec.js | 4 |
| dailyTipsSettings.spec.js | 3 |
| debug.spec.js | 5 |
| defaultWallpaper.spec.js | 7 |
| deviceImageSelections.spec.js | 1 |
| deviceTrash.spec.js | 1 |
| editorHistory.spec.js | 14 |
| favicon.spec.js | 5 |
| folderAppearance.spec.js | 14 |
| gridDropPrecision.spec.js | 7 |
| help.spec.js | 8 |
| interfacePreferences.spec.js | 11 |
| inversionControls.spec.js | 1 |
| itemAppearanceEditor.spec.js | 31 |
| keyboardShortcuts.spec.js | 5 |
| listArtwork.spec.js | 2 |
| localImageFallback.spec.js | 2 |
| manualDemos.spec.js | 10 |
| missingLocalImages.spec.js | 6 |
| onboarding.spec.js | 11 |
| recycleBin.spec.js | 8 |
| releaseNotes.spec.js | 14 |
| saveFailures.spec.js | 11 |
| settingsGeneral.spec.js | 2 |
| syncSettings.spec.js | 7 |
| themeWallpapers.spec.js | 13 |
| uiPerformance.spec.js | 4 |

## Verified interface fixes and separate commits

- `769b828`: list SVGs and thumbnails retained the saved color.
- `1f38afb`: independent SVG color below the selector, hidden for the official
  logo; preserved while switching icons, included in undo/redo and saved.
- `48350fd`: folder silhouette always visible; “None” cleared the inner symbol.
  Inversion controls were hidden when they had no applicable content.
- `61f94fd`: daily-tip changes required Save; Cancel discarded the change.
  A write failure retained the draft and allowed retry.

The suite found a focus interruption when the icon picker's animation ended.
The fix respected a keyboard selection or subsequently moved focus, with a
regression controlling the animation and reproducing that condition.

Another fix corrected a 2.27 px horizontal offset in unnamed folders inside
narrow cells: automatic margins prevented centering when the SVG exceeded the
inner width. The test waited for the new cell width and checked an offset below
0.5 px in cards and previews.

Coverage review added two journeys for the actual Delete all local data button
in Settings. They checked cancellation without changes, confirmed removal of
bookmarks, folders, widgets, trash and local files, persistence after reload,
preservation of remote data, and retry after a write failure.

### Capacity limits and notices

- The tested grid had 12 × 6 cells. A fully occupied grid was tested with drags
  toward all four outer boundaries and attempts to enlarge the last-cell item.
  Saved positions and sizes remained within bounds. Restoration without free
  space kept the item in the recycle bin and displayed a notice.
- A folder with 17 bookmarks accepted its eighteenth with a success message.
  Adding a nineteenth showed “This folder already has 18 bookmarks” and kept
  the bookmark at its previous position; the folder retained 18 after reload.
  Older backups with overflowing folders kept their existing content
  accessible; the new-item limit did not delete existing entries.
- The recycle bin had no limit of 18 or 72 entries. A list starting with
  250 entries received another bookmark and a folder containing 18 bookmarks.
  After reload, it retained 252 entries, the folder contents and success
  feedback. Persistence failures displayed a flash and retry option rather
  than being reported as completed deletion.

The full-grid restoration case uncovered a false persistence error: an unchanged
operation on already loaded data needs no write. The command could accept
`idle` after hydration; normal saves still required `saved`, and errors were
still rejected even when an unchanged command was allowed. A unit regression,
the full-grid test and failure/retry journeys checked this behavior.

## Package validated at the audit date

- File: `dist/newdesktab-1.0.0.zip`.
- Contents: **291 files**, **2,514,068 bytes**.
- SHA-256: `e9172d4298365fbbaced16fbaebad1bbdd20c0c9420e6aeafbfe63f43b49a995`.
- Extraction matched the source snapshot used by that audit.
- Installed-extension smoke checks covered new-tab replacement, popup saving,
  reload, shortcuts and a video ZIP backup in all three browsers.
  Installed Google Chrome: 155.0.8059.40; installed Brave: 155.1.97.56.

This package identity is historical. Rebuilding the same extension version after
source changes can produce a different file count, size or hash.

## Evidence and scope

The original local evidence was written under the ignored `dist/release-audit/`
directory: `final-check.log`, `final-unit-coverage.log`,
`final-unit-coverage.lcov`, `final-capacity.log`, `final-e2e.log`,
`final-actions-summary.json`, `final-actions-summary.md`,
`final-actions-summary-ui-responses.csv`, `final-cleanup-source-after.json`,
`final-ui-before.json`, `final-ui-final.json`, `final-ui-normal.json`,
`final-backup-performance.json`, `final-backup-multiple.json`,
`final-npm-audit.json`, `final-package.json` and `final-extension-*.log`.
The complete suite's audit records were in `final-actions-v7/`. These ignored
files are not distributed with a fresh checkout. The committed summary is
[RELEASE_1_0_0_RESULTS.json](RELEASE_1_0_0_RESULTS.json).

Follow [ACTION_AUDIT.md](ACTION_AUDIT.md) to collect new evidence. These results
used Windows/Chromium and installed browsers with isolated profiles. They did
not measure physical Mac hardware or real cross-device Sync propagation. A
passing release suite is not a guarantee of correct behavior across every
combination of hardware, data and network.
