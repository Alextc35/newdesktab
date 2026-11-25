# Technical release checklist

[Documentation index](../README.md) · [Publishing procedure](CHROME_WEB_STORE.md) · [Release review](RELEASE_REVIEW.md)

This file records publication status and completed release work. Checked items
and test counts describe the dated records below; they do not certify a later checkout.
Use the [release procedure](CHROME_WEB_STORE.md#release-procedure) for a new build.

## Chrome Web Store publication

- [x] Submit the initial release on November 22, 2026.
- [x] Receive Store approval on November 23, 2026.

New DeskTab **1.1.2** is published on the [Chrome Web Store](https://chromewebstore.google.com/detail/new-desktab/inafkeeciknpocbamagdmdnbbfmpdlmp).
The project author confirmed these dates and the current published version.
The release validation records below retain their original scope.

## Release 1.1.2 — November 24, 2026

This patch corrects how open pages apply Chrome Sync storage updates: startup
changes are retained, obsolete reads are discarded, temporary read failures are
retried, and returning to a tab checks storage again. Public schema 2, permissions
and the minimum Chrome version remain unchanged.

Validated on Windows with Node.js 24.14.0 and bundled Chromium 151.0.7922.34.

- [x] Pass ESLint, all 384 unit tests and all 98 DOM tests (`npm run check`).
  Regression coverage includes startup notifications, overlapping reads,
  transient initial and background read errors, focus/visibility recovery,
  concurrent successful and failed saves, mode changes, incomplete chunks,
  payload integrity, legacy formats and future-version compatibility.
- [x] Pass all 437 Playwright scenarios with eight workers, without failures,
  retries or skips. Existing bookmark, folder, widget, workspace, settings,
  backup, keyboard, layout and local-media behavior remains covered.
- [x] Pass both Python packaging tests. Verify all 446 entries in each final ZIP
  against current runtime sources and verify their SHA-256 sidecars. The Store
  manifest omits `key`; the developer manifest retains the stable public key.
- [x] Extract and smoke-test both ZIPs in independent temporary Chromium
  profiles. Also smoke-test the Store ZIP in installed Google Chrome
  158.0.8127.88 and Brave (product version 158.1.100.59), using isolated profiles.
  These checks cover startup, folder editing, popup save, reload, shortcuts,
  ZIP video backup, local grid scroll and caption positioning.
- [x] Include v1.1.2 release notes in all 52 interface languages. Regenerate
  and visually inspect the four Store screenshots and the promotional tile.
- [x] Audit source reachability: all 208 JavaScript modules are reachable.
  Remove two unused workspace CSS rules and an unused selector. Preserve the
  remaining CSS candidate because it is generated dynamically, and retain the
  documented import APIs. No confirmed orphan remains in the audit candidates.
- [x] Complete the UI benchmark with 60 and 1,200 bookmarks at 4× CPU throttling,
  without page errors. The run overlaps other release checks and is recorded
  as a functional workload check, without a before/after speedup claim.
- [x] Pass the promotional video's TypeScript check. Both npm dependency audits
  report zero vulnerabilities. Check local documentation links and whitespace.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Store ZIP](../../dist/newdesktab-1.1.2.zip) | 3,841,033 | `284d276ac6b463995c2c96b60a062af0829a8caa8fb7defdce2dcceb2b3bc185` |
| [Developer ZIP](../../dist/newdesktab-1.1.2-dev.zip) | 3,841,373 | `a9a23f3484d6d3529fe424f17ae3d80ca5af8053348fa02ae124e861223f39bf` |

The [Store checksum](../../dist/newdesktab-1.1.2.zip.sha256) and
[developer checksum](../../dist/newdesktab-1.1.2-dev.zip.sha256) accompany the ZIPs.
`dist/` retains only these four release artifacts. Supporting logs, raw benchmark
results and extracted packages were removed after validation. The initial
sandboxed server attempt and the browser run interrupted before completion are
not counted as validation. The successful complete run was recorded in
`e2e-final.log` before cleanup.

These checks verify local storage behavior and simulated remote updates. Real
Google-account Sync propagation between two devices, Chrome 123, GitHub Actions
for a final commit, and Chrome Store submission were not verified or performed
as part of this local release preparation.

## Release 1.1.1 — November 24, 2026

Validated on Windows with Node.js 24.14.0 and bundled Chromium 151.0.7922.34.
The release keeps public schema 2, the existing permissions and Chrome 123 as
the declared minimum; valid saved resizing preferences are preserved.

- [x] Pass ESLint, all 357 unit tests and all 98 DOM tests (`npm run check`).
  The new DOM coverage verifies empty folder trees, populated descendants,
  confirmation cancellation, bulk selections, persistence and restoration.
- [x] Run all 437 Playwright scenarios with `CI=1` and four workers: 436 passed;
  the remaining assertion still expected a confirmation for an empty folder.
  Update that expectation and pass all seven scenarios in the affected
  `gridDropPrecision.spec.js` file on the final rerun. No runtime change was
  needed after the full run.
- [x] Verify startup panel visibility before bootstrap, browser-root counts,
  initial bookmarks-bar expansion, import progress, the new resizing default,
  daily-tip layout and saved feedback, folder-tree recycling, and v1.1.1
  release history and Spanish workspace names.
- [x] Pass both Python packaging tests. Build both release ZIPs, compare every
  packaged runtime entry with its source and verify the SHA-256 sidecars.
  Each ZIP contains 446 files. The Store manifest omits `key`; the developer
  manifest retains the source's stable public key.
- [x] Extract and smoke-test each ZIP in an independent temporary Chromium
  profile, including folder editing, popup saving, reload, shortcuts, ZIP video
  backup restoration, local grid scroll and caption positioning.
- [x] Include translated v1.1.1 notes in all 52 interface languages and keep
  the historical release entries available inside the extension.
- [x] Regenerate and visually inspect the four Store screenshots and promotional
  tile; also inspect Spanish import, release notes, daily-tip feedback and
  window-resizing controls.
- [x] Pass source reachability audit: all 208 JavaScript modules are reachable
  from the application entry points. This does not certify unused CSS candidates.
- [x] Pass the promotional video's TypeScript check. Both npm dependency audits
  report zero vulnerabilities.
- [x] Check local documentation links and whitespace; keep only the four
  v1.1.1 release ZIP/checksum files at the top level of `dist/`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Store ZIP: `newdesktab-1.1.1.zip` | 3,831,590 | `3ea43599be9f40df5597d1f59265f37106b195d95d8072a194679d455c1dd579` |
| Developer ZIP: `newdesktab-1.1.1-dev.zip` | 3,831,932 | `39f116bc02c936fe6583c5df575d0b5376e59f40bbdd5d55d3451c6d6ebbba97` |

The Store checksum `newdesktab-1.1.1.zip.sha256` and developer checksum
`newdesktab-1.1.1-dev.zip.sha256` accompanied these ZIPs. The older archives,
checksums, supporting logs and visual captures were removed during the 1.1.2
cleanup; sizes and hashes above remain as the historical release record.
These are local checks; the final commit's GitHub Actions result and any Store
submission are separate from this record. Chrome 123, installed Brave/Google
Chrome and real-account Sync were not reverified for this patch.

## Release 1.1.0 — November 24, 2026

The local validation below covers the 1.1.0 runtime and CI-test alignment at
`ac5bd8b`, before the subsequent documentation and translation refresh.

- [x] Align backup schema assertions with public schema 2, including rejection
  of future schemas, and accept more than 18 bookmarks in a folder.
- [x] Pass ESLint, 352 unit tests and 88 DOM tests (`npm run check`).
- [x] Pass all 430 Playwright scenarios using bundled Chromium on Windows with
  `CI=1` and four workers, including backup restoration and folder capacity.
- [x] Pass two Python packaging tests and the source extension smoke test.
- [x] Extract and smoke-test both the Store and developer 1.1.0 packages in
  bundled Chromium, including backup restoration.

These local results do not establish a successful GitHub Actions run, Store
submission, or a new Chrome 123, Brave or real Chrome Sync verification. Check
the final commit and final package again using the submission procedure below.

Documentation and localization refresh, also validated on November 24:

- [x] Update the README, changelog, privacy policy, user/developer guides and
  release procedures for 1.1.0/schema 2 while preserving dated historical reports.
- [x] Refresh import messages in all 52 interface catalogs and the affected
  manual passages in all 51 manual files (Latin American Spanish shares Spanish).
- [x] Pass ESLint, all 352 unit tests and 88 DOM tests again.
- [x] Pass all 15 Help/language Playwright scenarios in bundled Chromium,
  including offline loading of every language and manual.
- [x] Pass both Python packaging tests, regenerate the two 1.1.0 ZIPs and their
  SHA-256 files, and smoke-test each extracted package in bundled Chromium.
- [x] Check local documentation links and whitespace; keep only the four current
  release ZIP/checksum files in `dist/`.

## Architecture closeout — October 10, 2026

- [x] Confirm persistence for bulk and other destructive operations.
  - `src/features/persistence/persistedAction.js` waits for the write before reporting success.
  - Retries retain the command result and do not duplicate, move or delete items again.
  - Covers bulk actions, the recycle bin, item/folder/workspace deletion, and undo/redo.
  - A persistent retry notice remains accessible inside or outside dialogs.
  - Ten bulk/destructive write-failure scenarios checked the result after reload.
- [x] Split `src/platform/storage/storageFacade.js`.
  - Extract `storageIO`, `storageCoordination`, `storageUsage` and `concurrentPlacement`.
  - Preserve the public facade and schema; check quotas, migrations and cross-tab merging.
- [x] Split `src/features/settings/themeSection.js`.
  - Extract `wallpaperLibrary`, `wallpaperFiles` and `wallpaperPreview`.
  - Check cancellation, file cleanup, rotation, video and device-specific state.
  - Cancelling after a global retry retains files already used by the saved state.
- [x] Measure backups containing large videos.
  - Measure export and restore with synthetic 10, 50 and 200 MiB video payloads.
  - Record timings, JSON expansion and JavaScript memory samples in persistent profiles.
  - Preserve the [data, methodology and format decision](../benchmarks/BACKUP_MEDIA.md).
  - Use binary ZIP when local videos are present; retain JSON otherwise and support older imports.
  - Verify 200 MiB and two 200 MiB videos, with sampled JavaScript memory near 80 MiB.
- [x] Separate responsibilities in `src/features/grid/gridPointerController.js`.
  - Extract `gridDragSession`, `gridResizeGesture`, `gridPointerGeometry` and `gridGestureState`.
  - Preserve placement and animation algorithms.
  - Check selection, folders, recycle bin, widgets, movement, resizing and window-size changes.

The recorded October 10 validation passed ESLint, 222 unit tests, 57 DOM tests
and 191 browser scenarios. The extracted package also passed the Chromium
extension smoke test, including ZIP video-backup restoration after local deletion.

The later 1.0.0 package review is recorded in [RELEASE_REVIEW.md](RELEASE_REVIEW.md).

## Release 1.0.0 — October 12, 2026

- [x] Remove unavailable local-image references during import/export and device
  selection cleanup while preserving included files, alternative URLs and shared
  data. Record 32 related scenarios, 16 image/backup scenarios in Chrome 123,
  and packaged-extension checks in four browsers.
- [x] Add editor-local history, shortcuts, discreet SVG controls and undo/redo
  notices while preserving text editing, images and contrast. Record 79 related
  scenarios, repeat 22 final editor scenarios, and check 26 editor/concurrency
  scenarios in Chrome 123 plus the package in four browsers.
- [x] Separate Help from Information, with a book icon and the four languages
  supported at that time; record 83 related scenarios and the updated package
  in four browsers.
- [x] Add once-per-version release notices and Information history, including the
  personal 1.0.0 note in those four languages. Sequence release notes, guide and
  tip; keep tips at the bottom right and hide introductory dialogs in list mode.
- [x] Start the public data schema at 1 and discard development schemas 2–21.
- [x] Reject malformed backups before restoring media or replacing data.
- [x] Reject future schemas in full backups and bookmark exports.
- [x] Reject duplicate IDs while preserving valid legacy files and folder relationships.
- [x] Keep confirmed clock deletion final, including persistence retries.
- [x] Update caption tests to check saved colors and contrast.
- [x] Fix resize-test readiness and the browser selected by concurrency tests.
- [x] Align manifest, package, package-lock and the then-current README at 1.0.0.
- [x] Declare Chrome 123 as the minimum and correct documented shortcuts.
- [x] Add release notes, regenerate all four Store screenshots and inspect them.
- [x] Record successful lint, 271 unit tests and 69 DOM tests.
- [x] Resolve missing favicons through parent domains without modifying bookmark
  URLs; record 35 related scenarios, five in Chrome 123 and a real-service
  SharePoint check.
- [x] Record 268 successful Chromium scenarios with schema 1 and release notes,
  with no failures or retries.
- [x] Check 23 backup/wallpaper scenarios in Chrome 123 with schema 1; the earlier
  full suite before the schema reset recorded 252 successful scenarios.
- [x] Check 37 release-note, welcome, help and concurrency scenarios in Chrome 123.
- [x] Generate and verify the 1.0.0 ZIP; test its extracted contents in Chromium,
  Google Chrome, Brave and Chrome 123.
- [x] Record the author's report of real Chrome Sync between profiles/devices.
  This is a manual report, not a result established by the storage test doubles.
- [x] Record successful responses from the public privacy and support links.
  Availability must be checked again before a later submission.

## Checks required for each submission

After pushing the final changes, check GitHub Actions for that exact commit.
Before submitting to the Store, verify the package identity, privacy declarations,
contact email and two-step verification in the dashboard. These administrative
steps were not established by local automated validation. The historical checks
above do not establish that a Store submission has been completed.
