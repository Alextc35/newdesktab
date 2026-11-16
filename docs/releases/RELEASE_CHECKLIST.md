# Technical release checklist

[Documentation index](../README.md) · [Publishing procedure](CHROME_WEB_STORE.md) · [Release review](RELEASE_REVIEW.md)

This is a historical record of completed release work. Checked items and test
counts describe the dated validation below; they do not certify a later checkout.
Use the [release procedure](CHROME_WEB_STORE.md#release-procedure) for a new build.

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
