# UI performance — release 1.0.0

Measured on 13 October 2026, comparing commit `5e5e134` with the working-tree
optimizations prepared for the 1.0.0 release.

## Method

Playwright Chromium on Windows, 1440 × 900 viewport and 4× CPU throttling.
Synthetic profiles contain 60 or 1,200 bookmarks, with 60 visible cards and
other items in separate workspaces. Network media is blocked. Debug is enabled
for operation timings. The benchmark records synchronous JavaScript work and
time through two animation frames separately. Each interaction uses two warm-up
runs followed by six samples; the table reports the median JavaScript time.
Startup timings are single samples and are not treated as an improvement claim.

| Interaction, 1,200 saved bookmarks | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Open settings | 111.55 ms | 9.55 ms | 91% |
| Open bookmark editor | 65.90 ms | 41.60 ms | 37% |
| Edit bookmark name | 12.25 ms | 5.95 ms | 51% |
| Resize the grid view | 49.10 ms | 17.80 ms | 64% |

For settings, the median time through two frames decreased from 219.05 to
70.40 ms. The final debug sample of rendering after a position update decreased
from 113.0 to 50.8 ms; this is an individual diagnostic sample, not a median or
an end-to-end drag benchmark. Results vary by hardware and browser.

Raw measurements are saved in the ignored `dist/release-audit/` directory:
`ui-performance-before.json`, `ui-performance-after.json` and
`ui-performance-final.json`. The last sample preceded the additional removal of
full-state copies from folder/bin previews and unnecessary workspace-menu
rebuilds. Those changes are verified functionally rather than assigned another
speedup percentage.

## Changes

- Read an isolated settings snapshot instead of cloning the entire library.
  Draft getters use the existing draft when available. Keyboard shortcut lookup
  also reads settings only.
- Build a per-operation index for card lookup when entering edit mode,
  resizing or preparing a drag; measure grid dimensions once during resizing.
- Load the icon palette when it is opened. Cache normalized search terms and
  SVG templates, keeping independent SVG nodes and the existing artwork-centering
  calculation. Selection, recommendations and labels update when needed.
- Read storage quotas and Sync metadata when the Storage tab is visible,
  including keyboard activation and restored settings dialogs. Closed settings
  no longer calculate full-library breakdowns after every save.
- Use the store's current read-only bookmark references and trash count for
  folder/bin previews. Rebuild workspace choices when the choices or active
  workspace change.
- Add bounded, opt-in Debug timings for opening settings, opening the bookmark
  editor and preparing a grid drag. Runtime persistence and its error handling
  remain in place.

## Reproduce and check the Mac

```sh
npm run benchmark:ui -- dist/ui-performance.json
```

The benchmark starts its own loopback server and isolated browser profiles.
It does not read or change a personal browser profile. CPU throttling defaults
to 4×; set `NEWDESKTAB_BENCHMARK_CPU=1` for normal CPU speed.

These measurements are not from the user's Mac. For that device, open DevTools
in an updated New DeskTab tab, run `NewDeskTabDebug.toggle()`, reproduce opening
settings, editing and dragging, then inspect `NewDeskTabDebug.history()` and
`await NewDeskTabDebug.report()`. The history is limited to 100 operations and
includes preparation, persistence and grid-render timings. Disable debug after
capturing the comparison to measure everyday operation without live logging.

## Validation of this candidate

- ESLint, 278 unit tests and 72 DOM tests pass.
- All 303 E2E scenarios pass in the complete suite, without retries or skips.
- The benchmark CLI completes both datasets at normal CPU speed without page
  errors. The throttled comparison above remains the before/after evidence.
- The 1.0.0 ZIP is checked against every runtime source file and passes the
  installed-extension smoke test in Chromium, Google Chrome and Brave.
- Dependency audit reports zero vulnerabilities.

These optimizations are prepared as uncommitted changes after `5e5e134`.
The final commit needs a fresh GitHub Actions run before Store submission.
