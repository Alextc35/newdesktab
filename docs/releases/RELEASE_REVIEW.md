# Recorded release review — 1.0.0

[Documentation index](../README.md) · [Publishing procedure](CHROME_WEB_STORE.md) · [Checklist](RELEASE_CHECKLIST.md)

New DeskTab **1.1.2** is now published on the [Chrome Web Store](https://chromewebstore.google.com/detail/new-desktab/inafkeeciknpocbamagdmdnbbfmpdlmp).
The initial release was submitted on November 22, 2026 and accepted on November 23,
as confirmed by the project author. The publishing follow-up below preserves the
earlier historical record.

This report preserves the validation recorded for the 1.0.0 release artifacts.
Dates, browser versions, counts and hashes belong to those runs; they are not
fresh results for every later checkout. Re-run the
[release procedure](CHROME_WEB_STORE.md#release-procedure) for a new package.
Real-account Chrome Sync below is an author-reported manual check.

## Recorded closeout — November 15, 2026

The reviewed version was **1.0.0**, with public schema 1 and Chrome 123 as the
minimum. This closeout included the UI, shortcut and confirmation work in commit
`c306342`, followed by these corrections and preferences:

- Keep bookmark size preserves card geometry when switching workspaces. The
  transition uses opacity and waits for content and restored scroll. An older
  media-preparation task cannot repaint a later workspace.
- Window resizing preserves the center anchor. Each workspace's X/Y scroll
  position stays on this device, outside Sync and backups. Temporarily clamping
  one axis does not erase the saved position on the other.
- Icon and name controls align in the editor. A bookmark caption can be placed
  on the left or right, with the logo after the text on the right. This preference
  is preserved in bookmarks, appearance presets, drafts and backups.
- Deleting a workspace also deletes its widgets, with an explicit warning,
  preventing them from reappearing in Main after reload.
- Four new translation keys were added to all 52 languages. Store screenshots
  were reviewed and compatible updates addressed vulnerable development dependencies.

| Recorded check | Result |
| --- | --- |
| `npm run check` | ESLint passed; 308 unit tests and 85 DOM tests passed. Includes four render-concurrency scenarios with controlled media. |
| Full Chromium 151.0.7922.34 suite | 388 scenarios passed, with none skipped or retried. The 41 affected scenarios passed again against the final sources. |
| Chrome 123.0.6312.122 suite | 386 passed and two CDP evaluations failed with “Resulting promise was garbage collected.” The tests were changed to observe persistence without retaining an evaluation across Web Locks. The 41 favicon, shortcut, workspace and resize scenarios then passed against the final sources. |
| Installed Manifest V3 ZIP | Smoke passed in Chromium 151, Chrome 123, Google Chrome 157.0.8103.51 and Brave 157.1.99.57 using independent temporary profiles. Covers the new tab, editing, popup, reload, shortcuts, ZIP video backup, local scroll and right-hand logo position. |
| `npm audit --audit-level=high` | Zero vulnerabilities reported at the time of the run. |
| Source audit | All 202 JavaScript modules reachable from the application entry points; no disconnected module. Reachability does not establish that every function or CSS rule is used. |
| Store images | Four screenshots and the promotional tile regenerated and visually inspected. |
| Interface benchmark | All 13 journeys with 60 and 1,200 bookmarks completed without errors under 4× CPU throttling. Measurements are not a performance budget. |
| Large backups | Export and restore checked with synthetic 10, 50 and 200 MiB video payloads. The 200 MiB ZIP exported in 1.03 s and restored in 1.31 s on the recorded machine. |

The smoke tests used the extracted ZIP with external requests blocked. The
packager compared every entry and its bytes with the source files. After the
full suites, protection against concurrent media preparation was added and
checked with the four DOM tests and the Chromium/Chrome 123 journeys above.
Real-account Google Sync was not repeated in this closeout; the author report
in the October record remains a separate historical manual check.

The local supporting outputs were stored under the ignored `dist/release-audit/`
directory: `check-final.log`, `chromium-release-final.log`,
`chrome123-release-final.log`, the `*-final-focused.log` files, four smoke logs,
`source-audit-final.json`, `ui-performance-final.json` and
`backup-performance-final.json`. These generated outputs are not distributed
with the source documentation.

Recorded artifact: `dist/newdesktab-1.0.0.zip`, **3,703,900 bytes and 439 files**.
The hash identifies that artifact, not a future regenerated package.

SHA-256:

```text
7cefeea691680b4f52aeae0f0a50115307b27930750d913811127fd4e1d49cc7
```

## Historical record — October 2026

The remaining sections preserve October's checks and measurements. Their counts,
browsers and package hash describe that earlier artifact and do not replace the
November record above.

The October 12 closeout distinguished automated checks from checks requiring
real profiles and accounts. It recorded the author's confirmation of Chrome
Sync between real profiles/devices; automated storage doubles cannot establish
that propagation. The initial public schema was 1; development schemas 2–21
were discarded before the public release.

## Changes included in the October review

- **Logo.** A globe with a plus sign, based on the author's selected design. The
  transparent SVG supplies extension icons, Information, release notes, welcome
  guide, manual, demos, popup and README. A cropped viewBox makes better use of
  the available size; PNG and WebP exports retain transparency. The popup frame
  was removed and Store images regenerated.
- **Local-image references.** Import/export omits references to unavailable files
  while retaining alternative URLs and appearance. JSON/ZIP backups restore
  included images before cleanup; invalid included images remain rejected.
  Storage is rechecked to avoid cached references to deleted files. Missing
  selections and empty personal wallpapers are cleaned only on this device;
  shared data and other devices' images are preserved.
- **Editor undo/redo.** Local draft history covers bookmarks, default styles,
  folders, recycle bin and clock settings. Shortcuts and two SVG arrows restore
  complete changes, with localized notices and disabled controls when no step is
  available. Text undo, local images, automatic contrast and open color pickers
  follow restored state. Header height stays stable; history resets on reopen.
  Active or suspended dialogs block keyboard workspace undo. Saving a folder
  with a different property order no longer resets workspace history.
- **Favicons.** Missing icons fall back through parent hosts to the registrable
  domain without changing the saved URL. Valid subdomain icons and suffix
  boundaries such as `.co.uk` are preserved. Cookie-free HEAD requests check
  response status, with an origin cache, to detect Google's generic missing-icon
  image returned with HTTP 404. The new host permission is limited to `t3.gstatic.com`.
- **Help.** A dedicated Settings section contains a book icon, manual search,
  common questions, quick guide and daily-tip preference. The four languages
  supported at that point and the manual link to Help. Information retains the
  product introduction, version and release history.
- **Release notes.** Once-per-version/profile notices precede the welcome guide;
  Information provides history. The 1.0.0 entry describes the author's story and
  thanks and states that the clock remains in development. Daily tips follow
  the dialogs at the bottom right, with interaction-aware timing. List mode
  hides these helpers with a notice; pending introductions wait for a wider
  window. Web Locks protects the cross-tab claim. Its marker stays outside Sync
  and backups. History preserves pending settings, focus and reading position
  rules. The four-language count here is historical; the extension later added
  52 shipped interface languages.
- **Initial public schema.** New profiles, persisted data and backups use
  `schemaVersion: 1`. Development schemas 2–21 are not migrated. Normalization
  tests use unversioned data; protection against higher schemas remains active,
  including the former development schema 21.
- **Invalid imports.** Backup structure is checked before migration can normalize
  malformed data into an empty workspace. Future outer/inner versions and
  duplicate IDs are rejected, including collisions across bookmarks, folders
  and widgets. Valid legacy files and folder relationships are retained. Tests
  verify rejected imports do not alter storage or media, including after reload.
- **Final clock deletion.** Confirmed editor deletion does not retain an undo
  operation that could recreate the clock. Its journey and write-failure retry
  were recorded as passing three consecutive times in Chrome 123.
- **Portable tests.** Folder scenarios check saved caption colors and contrast in
  both themes. Resize tests observe persistence state without holding a
  Playwright evaluation across Web Locks. Concurrency tests honor the selected
  browser and use Chrome-123-compatible headless mode. The smoke test supports
  DevTools loading for installed Google Chrome.
- **Version and listing.** Manifest, package, package-lock and the then-current
  README showed 1.0.0. Chrome 123 was declared as the minimum; E/B/F/W/S defaults
  were documented. Four Store screenshots were regenerated and inspected,
  including the 1.0.0 Information panel.
- **Failed writes.** The store retains the base of pending changes until saved.
  Another tab's update does not discard them; a retry merges them with persisted
  data. Tests cover consecutive failures and remote updates.
- **Save confirmation.** Bookmark, folder, recycle-bin and clock editors,
  settings and imports await persistence before announcing success. Editors stay
  open on failure. Retrying creation reuses the same item. Quick save and clock
  deletion also retry without duplicating or recreating items.
- **Bulk/destructive actions.** A common controller retains the command result
  and reports success after write confirmation. It covers duplication, styling,
  moves, deletion, restoration, workspaces and undo/redo. A persistent notice
  retries persistence without rerunning mutations and also handles direct grid
  writes. It follows the active dialog for keyboard access.
- **Ownership boundaries.** Storage, wallpaper settings and grid gestures use
  focused modules while preserving APIs, schema and placement algorithms. The
  appearance editor and CSS live in `src/features/item-editor/`; `shared/ui`
  remains generic. Architecture tests enforce this separation and keep the
  domain independent of the DOM and browser APIs.
- **Portable tooling.** Browser tests and Store-image generation share a Node
  loopback server with path validation, no directory listing and no cache.
  Browser journeys no longer depend on a platform's Python command name.
- **Dependencies.** Compatible updates addressed vulnerable development
  dependencies and added auditing to CI.
- **UI regressions.** Settings scroll survives suspension and window resizing.
  Tests wait for controls before measuring them. Modal focus restoration respects
  a field focused later by the user; keyboard navigation excludes hidden controls.
  Cancelling settings after a recovered write retains local files already used
  by saved state.
- **Backups/privacy.** Export, deletion, import and reload were checked with local
  images and video. Privacy documentation covers included media and `activeTab`.
  Synthetic 10, 50 and 200 MiB videos, plus two 200 MiB videos, were measured.
  Local videos use a multipart binary ZIP; backups without them retain JSON.
  Older base64-video JSON files remain importable. ZIP validation precedes restore.
- **Publication material.** Store images were regenerated and inspected. The ZIP
  was prepared and its extracted contents tested as a real extension in a fresh
  Chromium profile.

## Recorded October validation

| Check | Recorded result |
| --- | --- |
| ESLint, unit and DOM tests | ESLint passed; 271 unit tests and 69 DOM tests passed. |
| Local images | 32 Chromium import/export, JSON/ZIP, device-selection, wallpaper and fallback scenarios passed; 16 image/backup scenarios passed in Chrome 123. Includes deleted-file cache, partially included images, invalid-image rejection and per-device cleanup without altering Sync or the source file. |
| Editor history | 79 related Chromium scenarios; the 22 final editor/history scenarios passed again. Headers inspected at 601, 720 and 1280 pixels, with four translations and both themes. |
| `npm run test:e2e` | Before the Help split: 268 passed in Chromium in 12.1 minutes, with no failures, skips or retries. |
| Help | 83 scenarios covered help, guide, demos, navigation, wallpapers, notes and list mode. An old Information entry point was corrected in a test; seven wallpaper scenarios passed on rerun. Layout inspected at 601, 720 and 1280 pixels; four translations checked. |
| Favicon fallback | 35 related Chromium scenarios and five Chrome 123 favicon scenarios passed. A separate real Google-service check used the installed ZIP in Chrome 123, Chrome 155 and Brave 155: SharePoint loaded and the saved URL remained unchanged. |
| Chrome for Testing 123.0.6312.122 | 26 editor/history/concurrency scenarios passed. Before the Help split, 37 notes/help/welcome/concurrency scenarios passed. The reviewed ZIP passed smoke. Earlier schema-1 validation covered 23 backup/wallpaper scenarios; the full pre-reset suite recorded 252 passes. |
| ZIP validation | 13 format/invalid-entry tests and four browser journeys passed, including legacy JSON, the ZIP picker and damaged-video rejection. An independent Python ZIP reader checked the downloaded file. |
| Backup benchmark | Export/restore recorded for 10, 50 and 200 MiB, plus two 200 MiB videos, with sizes, timings and memory samples. |
| Dependency audit | Zero vulnerabilities reported after development-tool updates at that time. |
| Store images/logo | Four generated screenshots inspected. Transparent 48/128/512-pixel PNGs and a 512-pixel WebP checked, including small sizes in light/dark themes and Information. |
| Extracted-extension smoke | Passed in Chromium, Google Chrome 155.0.8059.40, Brave 155.1.97.56 and Chrome for Testing 123.0.6312.122. Covers new tab, editor buttons/shortcuts/notices, missing-image import with URL retained, Help/manual/settings, Information, popup, reload and ZIP video backup under Manifest V3, with no page errors. |
| Real Chrome Sync | Author-reported check between real profiles/devices, separate from automated storage doubles. |
| Public listing links | Privacy and support returned HTTP 200 at the recorded check. |
| `git diff --check` | No whitespace or conflict-marker errors recorded. |

Recorded October artifact: `dist/newdesktab-1.0.0.zip`, **2,494,061 bytes and 281 files**.
It contained extension resources, license and privacy policy. The packager checked
every entry and its bytes against the source.

SHA-256:

```text
1c369ecefba0e3dc61f7d7885db693bec905181ba3f0df1a8e9fbb94ac18a206
```

The large-video and performance measurements above came from the October 10
closeout; detailed results are retained under `docs/benchmarks/`. The 1.0.0 package
was checked again on October 12 using new temporary profiles. General smoke tests
blocked external requests to avoid depending on media providers; the separate
SharePoint check allowed only Google's favicon service to test the real fallback
and permission. Windows packaging used Python directly because the `python3`
alias was unavailable.

## Architecture decisions recorded in the closeout

The [checklist](RELEASE_CHECKLIST.md) records the completed work and criteria:

- `src/features/persistence/persistedAction.js` confirms and retries commands.
- Storage is split into `storageIO`, `storageCoordination`, `storageUsage` and
  `concurrentPlacement`, with the facade retaining its contract.
- Wallpaper behavior uses `wallpaperLibrary`, `wallpaperFiles` and
  `wallpaperPreview`; the main editor still coordinates its draft.
- Grid gestures use `gridDragSession`, `gridResizeGesture`, `gridPointerGeometry`
  and `gridGestureState`, separating geometry/planning from drag/drop commands.

The [backup study](../benchmarks/BACKUP_MEDIA.md) compares the former JSON format
with ZIP. A 200 MiB video changed from a 266.67 MiB backup to 200.00 MiB, while
the largest sampled JavaScript memory fell from 1,070.9 to 79.5 MiB. Two 200 MiB
videos also restored, with an 80.0 MiB sample. These checks cover storage and
transport, not playback or whole-process RAM. Sampling frequencies differ and
do not guarantee the absolute peak or validate every browser library/private mode.

## Publishing follow-up recorded in October

1. Push final changes and check GitHub Actions for the exact release commit.
   Commit `176ccfe` had a [recorded successful run](https://github.com/Alextc35/newdesktab/actions/runs/38236420523);
   that run does not cover later changes. Relevant later commits were `12760ea`
   (release notes), `c0ca046` (Help), `70595a3` (favicon fallback) and `d170fd7`
   (editor history).
2. Verify that the manifest key matches the Store item, then review listing copy,
   privacy, contact email and two-step verification. Regenerate screenshots if
   the interface changes before submission.
3. Upload the ZIP and images, complete declarations and submit for review.

The historical record established local/package checks and recorded the author's
Sync confirmation. It did not establish completion of Store dashboard submission
or review. Use the current [publishing procedure](CHROME_WEB_STORE.md) for another submission.
