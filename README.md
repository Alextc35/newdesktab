# NewDeskTab

Minimalist Chrome/Brave new-tab extension for organizing bookmarks in a visual
grid workspace.

![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript)
![version](https://img.shields.io/badge/version-0.22.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)

https://github.com/user-attachments/assets/f57533bd-2499-4ff1-9c20-4afb5c9d9c94

NewDeskTab replaces the browser's default new tab with a private, customizable
visual bookmark workspace. Bookmarks can be placed, resized and styled like
items on a desktop without relying on a NewDeskTab account or backend.

## Features

* Smooth eight-direction drag and resize on a collision-aware grid
* Configurable drag behavior: None (default), Relocation and experimental
  Sequence
* Direct bookmark editing plus short-click selection and a middle-click editor
* Keyboard grid navigation across bookmarks and folders with `Tab` and arrows
* Arrow-key movement for a single selected bookmark outside grid navigation
* Compact bookmark creation that expands into the shared full style editor
* Toolbar popup to save the current web page into a workspace or folder, with
  an existing-favorite indicator and automatic popup close after a successful save
* Named appearance presets
* Independent bookmark workspaces with smooth `Alt/⌥ + ↑/↓` navigation
* Resizable folders with a clean link view and an editable 3 × 6 workspace
* Bundled resizable clock widget with 12/24-hour and seconds controls
* Global search palette (`/`)
* Multi-select, bulk styling, moving, duplication and deletion
* Bookmark duplication plus atomic undo/redo for bookmark and folder changes
* Solid, image and muted-video themes with ordered wallpaper rotation; local
  media or remote URLs, plus favicon previews and four interface locales
* Versioned bookmark import/export and complete backups
* Optional Google Chrome profile synchronization with status and data
  management
* Accessible modal focus management and keyboard navigation

## Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/Alextc35/newdesktab.git
   ```

2. Open `chrome://extensions` or `brave://extensions`.
3. Enable **Developer Mode**.
4. Choose **Load unpacked** and select the `newdesktab` folder.

## Bookmark and grid model

Each bookmark owns identity, grid layout and appearance:

```js
{
  id: "…",
  name: "GitHub",
  url: "https://github.com",
  gx: 0,
  gy: 0,
  w: 1,
  h: 1,
  groupId: null,
  folderId: null,
  backgroundColor: "#000000",
  backgroundImageUrl: null,
  showFavicon: true
}
```

An appearance preset never contains bookmark identity, timestamps, workspace or
grid coordinates. New bookmarks combine an empty identity with the active
preset and are placed in the first available cell of the current workspace.

Folders are first-class, resizable grid items. They start at `1 × 1`, then keep
their own position and dimensions just like bookmarks:

```js
{
  id: "…",
  name: "Reading",
  gx: 0,
  gy: 1,
  w: 1,
  h: 1,
  groupId: null
}
```

A bookmark inside a folder keeps its appearance and saved `w × h` size but no
longer reserves cells in the main workspace. Each folder exposes a compact
3-row × 6-column grid for up to 18 bookmarks. Internal cards always occupy one
compact cell. The configured None, Relocation or Sequence behavior also applies
inside the folder, with smooth reversible cell transitions. The local order
persists across reopens and reloads.

Dragging a top-level bookmark onto the folder assigns the first free local
cell. Taking it out places it in the first free main-grid area that fits its
saved dimensions. Deleting a folder asks for confirmation and deletes the
bookmarks it contains.

## Editing and grid behavior

Edit mode exposes a direct pencil button on each bookmark. A middle click opens
the same editor without opening the bookmark in a tab. A short primary click
toggles selection, while holding the primary button starts dragging instead.
Selected bookmarks can be styled, moved to another workspace, duplicated or
deleted from the bulk toolbar.

Bookmarks and folders have eight resize handles. Drag a handle for continuous
resizing, click it to grow one grid cell in that direction, or `Shift + click`
to shrink. Invalid resize attempts restore the complete rectangle that existed
before the gesture.

**Settings → Bookmarks → Drag behavior** controls occupied-cell handling:

* **None** (default) keeps other items still. It only accepts free cells;
  occupied targets return the dragged item to its source on release.
* **Relocation** moves blockers into the vacated area or nearest free
  space.
* **Sequence** shifts the bookmark chain toward an available gap. This mode is
  experimental and may contain minor edge-case bugs.

A bookmark never displaces a folder: dropping it onto a folder adds it to that
folder. Folders themselves use the same smart drag and resize system as other
grid items.

## Debug console

The default in `src/shared/diagnostics/debug.js` is disabled. Open the DevTools console
of a NewDeskTab tab and run `NewDeskTabDebug.toggle()` to enable live diagnostics
without reloading. Run it again to disable them. Filter by `[NewDeskTab Debug]`
to find the output. Startup prints a short activation hint. Enabling Debug lists
the available commands and their purpose; run `NewDeskTabDebug.report()` when you
want the report.

Messages use colored labels, grouped details and the browser's local time as
`HH:mm:ss`. The history table also shows when each operation started; elapsed
durations remain in milliseconds.
All groups start collapsed and can be expanded when needed.

The report includes the extension version, active storage mode, Sync
support, local/sync quota usage, item counts and startup timings. Bookmark
creation, editing, deletion, duplication and state changes report preparation,
queue wait and storage-write durations in milliseconds. Grid rendering is
reported separately; startup readiness does not wait for remote images, and
Sync timings measure browser storage writes rather than remote propagation.

```js
NewDeskTabDebug.toggle()       // Toggle live operation logging; returns true/false
NewDeskTabDebug.enabled        // Read the current state
await NewDeskTabDebug.report() // Fresh general information and storage usage
NewDeskTabDebug.history()      // Last 100 completed operations and their phases
NewDeskTabDebug.clear()        // Clear console + history and confirm the result
```

The commands remain available while Debug is off. Initial load metrics are
retained for the report, but operations are only recorded while Debug is on.
Disabling keeps the existing history; clearing also discards pending traces
and reports without disabling Debug. The toggle applies to the current tab
and resets to the configured default on reload.

## Architecture

NewDeskTab uses vanilla JavaScript modules with explicit architectural boundaries:

```text
Application composition
        ↓
Feature actions and adapters → Pure domain models
        ↓                         ↓
Application state/schema → Platform and shared mechanisms
        ↓
UI controllers and reusable views
```

Important modules:

```text
src/app/bootstrap.js                   application startup and dependency wiring
src/app/appController.js               store-to-UI effect coordination
src/app/applicationDiagnostics.js      application debug console and reports
src/app/appStateChanges.js             pure state-transition classification
src/app/registerGridItemTypes.js       bundled grid-item composition
src/domain/bookmarks/                  bookmark model and defaults
src/domain/folders/                    folder model and internal layout
src/domain/recycle-bin/                pure trash and restoration rules
src/domain/settings/                   portable preferences and grid-interaction modes
src/domain/workspaces/workspaceModel.js workspace identity and navigation

src/features/bookmarks/                  bookmark commands, cards and editor UI
src/features/folders/                     folder commands, cards and modal UI
src/features/grid/                        grid rendering, layout, selection and interactions
src/features/history/                     global undo/redo UI coordination
src/features/keyboard/                    runtime shortcut coordination
src/features/launcher/                    expandable edge creation dock
src/features/quick-save/                  toolbar popup placement and save flow
src/features/recycle-bin/                 recycle-bin actions and UI
src/features/search/                      global and compact-list search UI
src/features/settings/                    settings actions, draft and modal UI
src/features/workspaces/                  workspace actions, selectors and toolbar

src/state/appStore.js           live state, subscriptions and persistence queue
src/state/gridHistory.js        bounded grid undo/redo snapshots
src/state/stateChangeDescription.js safe diagnostic change labels
src/platform/browser/           browser capabilities and extension metadata
src/platform/images/            local image/video storage and browser processing
src/platform/i18n/              locale resolution and translation runtime
src/platform/storage/           schema, Chrome persistence and device data
src/platform/sync/              versioned, quota-safe sync transport
src/shared/data/mergeChanges.js concurrent persisted-data reconciliation
src/shared/diagnostics/         bounded reusable console tracing
src/shared/grid/                generic placement, resize, movement and keyboard policies
src/shared/keyboard/            shortcut normalization and event matching
src/shared/ui/                  reusable modal, tabs, notices, image and visual primitives
src/widgets/widgetModel.js      generic persisted widget envelope
src/widgets/widgetRegistry.js   bundled-widget lifecycle and GridItem adapter
src/widgets/widgetCatalog.js    generic picker for creating bundled widgets
src/widgets/widgetActions.js    generic widget lifecycle commands
src/widgets/builtin/index.js    enabled bundled-widget catalog
src/widgets/builtin/clock/      first bundled visible widget
src/styles/main.css             single global CSS entry and composition root

```

Feature and shared-component styles are colocated beside the JavaScript that
owns their DOM. `src/styles/` contains only document-wide foundations; the old
horizontal `src/css/` directory and the temporary `src/js/` wrapper have been
retired.

The bookmark panel does not import the store, calculate grid placement or
perform persistence. Controllers decide what saving means. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the complete boundary guide or
the Spanish [project guide](docs/GUIA_DEL_PROYECTO.md) for a detailed walkthrough
of the runtime, modules and extension points.

## Local and synchronized storage

NewDeskTab starts in **Local** mode. In Google Chrome, **Settings → Sync** offers:

* **Only on this device** — data uses `chrome.storage.local`.
* **Synchronized** — data uses the browser-managed `chrome.storage.sync` area.

Synchronization is currently enabled only in branded Google Chrome, where it
follows the Chrome profile / Google Account configuration. Brave and other
Chromium browsers remain fully usable in Local mode, but the synchronized
option is disabled because cross-device propagation has not been reliable; see
[issue #1](https://github.com/Alextc35/newdesktab/issues/1). NewDeskTab does not
operate an OAuth client, account system or server and cannot access synchronized
user data.

When Sync is enabled for the first time, local data is uploaded if the profile
does not already contain NewDeskTab data. Existing synchronized data wins to avoid
accidental overwrites. Returning to Local mode creates a local copy and leaves
the synchronized copy untouched.

If an older NewDeskTab installation encounters synchronized data written by a
newer schema or sync format, startup remains usable: that device automatically
returns to its compatible Local data, leaves the cloud payload untouched and
locks the Sync option with an update notice. The lock is device-specific and
disappears after installing a compatible version (or explicitly deleting the
synchronized NewDeskTab data).

Chrome's sync quotas are handled by splitting the versioned payload into safe
chunks. NewDeskTab reports quota/persistence errors and shows the current save
status in Settings. The Sync panel shows live used, total and available capacity
for the currently selected mode, reports the latest synchronized update and can
delete all synchronized NewDeskTab data after confirmation. Deleting sync data first
keeps the working data locally when necessary. An open NewDeskTab page also shows
a flash message when its data is updated by another synchronized device; writes
made on the current device do not trigger that message locally.

In **Settings → Theme**, the image or video URL appears only in Sync mode and
provides a shared fallback. **My own wallpapers** is a device-only collection of
URLs and local image or MP4/WebM/Ogg video files. You can reorder them, choose
a color behind transparent media, preview each one and set a rotation interval
for this device. The fallback appears only in Sync mode when no personal
wallpaper is available; it does not join the rotation. The first wallpaper stays
fixed by default; short rotation presets can be enabled when wanted.
Previews use the desktop's aspect
ratio and cover crop. Videos play muted and loop. Local video files can be up
to 200 MB and are stored separately from Chrome Sync. Existing shared
wallpaper lists are copied once into each device's personal collection when
upgrading, then subsequent edits stay independent.

> Cross-device sync requires the same extension ID on every installation. A
> Chrome Web Store release provides this automatically. Development installs
> need a stable manifest key or consistent packaging workflow.

## Keyboard and pointer shortcuts

* `Ctrl + E` toggles the main edit mode; inside an open folder it toggles that
  folder's edit controls and reordering.
* `Ctrl + B` opens the create-bookmark panel.
* `Ctrl + F` opens the create-folder dialog.
* `Ctrl + S` opens Settings.
* `/` opens global search.
* `Middle click` opens that bookmark's editor while editing the grid.
* `Alt/⌥ + ↑/↓` cycles through workspaces.
* `Ctrl/Cmd + Z` undoes the latest bookmark operation.
* `Ctrl/Cmd + Shift + Z` redoes it.

The first four shortcuts are configurable under **Settings → Keyboard
shortcuts**. They are part of the versioned settings payload, so custom values
are included in complete backups and follow the user between Chrome profiles or
devices when Sync is enabled.

Press `Tab` while the page is focused to enter keyboard grid navigation; press
`Tab` again to leave it. The first visible top-level item receives focus and
an informational flash confirms both mode changes. `↑/↓/←/→` moves to the
nearest bookmark, folder or recycle bin in that direction while keeping the
remembered row or column used to enter resized cards. Horizontal arrows keep
the closest item on that row; with at most one empty cell, a diagonal candidate
is ignored, while two or more empty cells allow the nearest diagonal route.
Vertical arrows stay in the remembered column and do nothing when that lane is
empty. While this navigation is active, `Enter` opens the focused bookmark,
folder or recycle bin outside edit mode. In edit mode, `Enter` opens the
focused bookmark, folder or recycle bin editor when there is
no selection or when that item is the sole selected item; `S` toggles the
focused bookmark or folder's selection.
Opening a folder, an editor or the recycle bin keeps Tab navigation active and
returns focus to the same card when the modal closes; only opening a bookmark
URL leaves the page and ends the mode.
The recycle bin is excluded from `S` selection.
When reversing the last arrow movement, navigation returns to the item from
which that movement started before looking for another candidate.

Outside keyboard grid navigation, `↑/↓/←/→` moves exactly one selected
top-level bookmark while editing. A bookmark that is already selected remains
stationary while `Tab` navigation is active and becomes movable again after
leaving that mode. Arrow movement follows the configured drag behavior. In None mode it skips
occupied cells until the next free rectangle. Relocation and Sequence exchange
bookmarks one step at a time and jump over the complete rectangle of a folder
without moving it. Arrow shortcuts are ignored with zero or multiple
selections, while typing, and while a modal is open.

Selection uses a short primary click. Holding the primary button starts a drag
and therefore does not alter selection.

Workspaces maintain independent layouts. Folders cannot cross or nest between
workspaces. Search covers every workspace and includes the containing folder in
each result; moving selected bookmarks finds free target cells before making
changes.

## Development and tests

Install exact development dependencies and run the standard quality gate:

```sh
npm ci
npm run check
```

Run browser journeys:

```sh
npx playwright install chromium
npm run test:e2e
```

The unpacked-extension smoke test uses Playwright Chromium and a fresh temporary
profile. It checks new-tab replacement, popup persistence and reload:

```sh
npm run test:extension
```

You can override the browser executable or test an extracted release ZIP:

```sh
NEWDESKTAB_BROWSER_PATH="/path/to/browser" npm run test:extension
NEWDESKTAB_EXTENSION_PATH="/path/to/extracted-release" npm run test:extension
```

Create the Store ZIP with `npm run package:store` (Python 3 required). It includes
runtime code, locales, icons and license, and excludes development dependencies,
tests and demo media.

Generate the required Chrome Web Store screenshot and small promotional tile
with `npm run assets:store`. The versioned files are written to `assets/store/`.
The public [privacy policy](PRIVACY.md) is included in the release ZIP and can be
used as the policy URL from the repository's public GitHub page.
See the complete [Chrome Web Store submission guide](docs/CHROME_WEB_STORE.md)
for listing copy, privacy answers and the release checklist.

Pull requests run lint, Node/Vitest tests and Playwright journeys through GitHub
Actions. Read [CONTRIBUTING.md](CONTRIBUTING.md) before structural changes.

## Languages

The interface ships with English (`en`), Spanish from Spain (`es`), Latin
American Spanish (`es_419`) and Brazilian Portuguese (`pt_BR`) in
`src/lang/`.

## Roadmap

* Revision and conflict recovery for simultaneous edits across devices
* Shareable preset packs
* More import sources
* Chrome Web Store release and feedback-driven improvements

## Privacy

See the complete [NewDeskTab Privacy Policy](PRIVACY.md).

* No tracking or analytics
* No NewDeskTab-operated backend
* Local mode saves workspace data inside the browser profile
* Sync mode delegates storage and transport to the browser
* The developer cannot access synchronized data
* Displayed favicons request site origins from Google's favicon service
* Remote images load from their hosts, including the initial example image
* Uploaded image files and filenames stay local; JSON backups do not embed them

Changes from tabs on the same device are combined before saving. This does not
provide a distributed lock or guaranteed conflict recovery across devices.

## License

NewDeskTab is released under the [MIT License](LICENSE).
