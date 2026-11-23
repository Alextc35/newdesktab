# New DeskTab technical guide

[Documentation index](../README.md) · [Development and diagnostics](../development/DEVELOPMENT.md) · [Architecture reference](ARCHITECTURE.md)

This guide explains how New DeskTab works, how responsibilities are divided,
and where to make each kind of change. It is an onboarding walkthrough for
contributors; the [architecture reference](ARCHITECTURE.md) documents the
individual contracts in greater detail.

> **Product:** New DeskTab<br>
> **Application:** Chromium Manifest V3 extension<br>
> **Technology:** JavaScript ES modules, native HTML and CSS<br>
> **Reference release:** 1.0.0

All source paths below are relative to `src/` unless they explicitly begin with
`src/`, `tests/` or `scripts/`.

## 1. Overview

New DeskTab replaces the browser's new-tab page with a visual workspace for
bookmarks, folders and bundled widgets. Each workspace has an independent layout.
The extension has no backend of its own. Workspace data uses the browser profile's
`chrome.storage.local` or, in supported Google Chrome, `chrome.storage.sync`.
Local media and device preferences have separate device-only storage.

```text
newtab.html
    ↓
main.js
    ↓
app/bootstrap.js ─────────────── composition and initialization
    ↓
features ──────── domain ─────── use cases and deterministic rules
    ↓                 ↓
shared ───────── platform ────── reusable mechanisms and browser adapters
    ↓                 ↓
state/appStore.js ────────────── live state and ordered persistence
    ↓
app/appController.js ─────────── state-driven UI effects
    ↓
DOM
```

The main boundaries are `app`, `domain`, `features`, `platform`, `shared`, `state`
and `widgets`. The former transitional `core`, `ui`, `css` and `js` directories
have been removed. Every source module has an explicit owner under `src/`.

## 2. Design principles

### One source of live state

`state/appStore.js` owns the current application state. `getState()` returns an
isolated clone; changing that result does not save anything. Feature commands
submit updates through `setState()` instead of modifying persisted objects.

### Separate rules from effects

A rule such as finding a free grid area must work without the DOM or Chrome
APIs. Saving the resulting layout may coordinate the store and persistence.

- `domain` and pure `shared` algorithms validate and calculate.
- `features` turn user intentions into state transitions and UI behavior.
- `platform` communicates with the browser and device.
- `app` connects implementations and reacts to global changes.

### Commit one logical action atomically

Moving one bookmark and displacing another are one operation. Their positions
are committed together, creating one undo step. Intermediate pointer previews
remain outside persisted state.

### Adapt grid types through a common protocol

Bookmarks, folders, the recycle bin and bundled widgets implement the protocol
in `shared/grid/gridItemRegistry.js`. Generic rendering and interaction use the
adapter's capabilities rather than introducing a branch for each item type.

### Normalize external data at its boundary

Stored, synchronized and imported data crosses the storage schema boundary,
including `migratePersistedData()`. Validate an import before restoring its media
or replacing workspace data. Consumers can then rely on normalized state.

## 3. Application startup

The manifest declares `src/newtab.html` as the new-tab override. That document
loads `src/main.js`, which calls `startApplication()`.

`app/bootstrap.js` performs these steps:

1. Obtain the main DOM hosts and register bundled grid-item types.
2. Hydrate and migrate state, purge expired recycle-bin entries, and ensure the
   bin has a valid position. Schedule periodic expiry checks.
3. Apply the interface theme and preload required local images and videos.
4. Initialize localization from hydrated settings.
5. Create the application controller and subscribe it to store changes.
6. Subscribe to remote Sync updates and deletion notifications.
7. Initialize reusable controls, widget surfaces, modals, launcher, workspace
   controls, history, grid interaction and keyboard shortcuts.
8. Offer release notes, then the optional welcome guide, then daily tips.
9. Show a compatibility notice when newer synchronized data blocks Sync.
10. Expose diagnostics and finish the startup timing report.

State and localization are ready before feature UI initialization. Startup
errors are reported at the application boundary.

| File | Responsibility |
|---|---|
| `src/main.js` | Minimal JavaScript entry point. |
| `src/app/bootstrap.js` | Initialization order and dependency wiring. |
| `src/app/registerGridItemTypes.js` | Composition of bundled grid types. |
| `src/app/appController.js` | Global UI effects after state changes. |
| `src/app/appStateChanges.js` | Pure classification of state transitions. |
| `src/app/appShell.js` | Document resizing and edit-mode presentation. |

`src/popup.html` and `src/popup.js` form a separate entry point for saving the
active browser tab. Their quick-save policy lives in `features/quick-save`.

## 4. Layers and dependency rules

### Application composition

`app/` connects concrete features, platform services and shared components. It
must not accumulate bookmark, folder, workspace or recycle-bin business rules.

### Domain models

`domain/` contains deterministic entities, invariants, validation and defaults.
It does not access the DOM, store or Chrome APIs.

```text
domain/
├── bookmarks/      bookmark identity, URL, appearance and presets
├── folders/        folder rules and internal layout
├── recycle-bin/    entries, restoration and expiry
├── settings/       portable preferences, language catalog and media rules
└── workspaces/     workspace identity and navigation
```

### Product features

A feature owns a complete user-facing capability: its commands, UI controllers,
renderers and colocated styles. Feature actions may use the store and domain
models; reusable editors receive callbacks for application-specific operations.

```text
features/
├── bookmarks/      creation, editing, cards, previews and transfer
├── folders/        membership, cards, editor and contents modal
├── grid/           render, selection, drag, resize and keyboard interaction
├── help/           manual, search, demonstrations and daily tips
├── history/        global undo/redo controls
├── item-editor/    shared appearance experience for supported item types
├── keyboard/       runtime shortcut coordination
├── launcher/       expandable creation and settings dock
├── onboarding/     optional animated welcome guide
├── persistence/    durable command feedback and retry UI
├── quick-save/     current-tab saving policy
├── recycle-bin/    deletion, restoration and presentation
├── release-notes/  bundled release history and arrival notice
├── search/         global search and compact-list filtering
├── settings/       settings draft, modal and preference sections
└── workspaces/     commands, selectors, toolbar and workspace settings
```

### Platform adapters

`platform/` isolates browser- and device-dependent behavior:

```text
platform/
├── backup/         ZIP backup container and bundled ZIP library
├── browser/        browser capabilities and extension metadata
├── i18n/           translation runtime
├── images/         favicons and local image/video storage
├── storage/        persistence, schema and device-only records
└── sync/           versioned chrome.storage.sync serialization and chunking
```

Domain code never imports this layer.

### Shared mechanisms

`shared/` contains stable mechanisms reused across features:

- `grid`: geometry, placement, resize, movement and type registry.
- `ui`: modal lifecycle, alerts, notices, controls, themes and visual primitives.
- `keyboard`: shortcut normalization and matching.
- `data`: value comparison, draft history and concurrent-data reconciliation.
- `images`: portable image-reference helpers.
- `icons`: bundled symbol catalog, paths and local recommendations.
- `urls`: the bundled domain parser.
- `diagnostics`: bounded, reusable operation tracing.

Two callers alone do not justify moving code here. The abstraction must have a
generic contract without feature-owned policy.

### Bundled widgets

`widgets/` defines statically shipped widgets; it is not a remote plugin loader.

| Module | Responsibility |
|---|---|
| `widgetModel.js` | Persisted envelope and normalization. |
| `widgetRegistry.js` | Definition validation, lifecycle and grid adapters. |
| `widgetCatalog.js` | Creation flow for registered, creatable widgets. |
| `widgetCatalogView.js` | Catalog DOM without application-state ownership. |
| `widgetActions.js` | Instance creation, updates and removal. |
| `builtin/index.js` | Catalog of implementations shipped in this build. |
| `builtin/clock/` | Clock model, rendering, grid interaction and settings. |

### Application state

`state/` is a specific boundary, not a general home for business logic:

- `appStore.js`: live state, hydration, subscriptions and persistence queue.
- `gridHistory.js`: bounded transient grid undo/redo snapshots.
- `stateChangeDescription.js`: safe diagnostic labels for state changes.

Entity defaults belong in their domains.
`platform/storage/persistedDataDefaults.js` composes an isolated complete
persisted-data value. Application-shell effects belong in `app`; domain-specific
presentation belongs in its feature.

## 5. State model

```text
AppState
├── data                         application data
│   ├── schemaVersion
│   ├── bookmarks[]
│   ├── folders[]
│   ├── widgets[]
│   ├── recycleBin
│   ├── trash[]
│   └── settings
└── ui                           transient session state
    ├── isEditing
    ├── persistence
    └── history
```

The storage layer persists `data`; `ui` is excluded. The synchronized
representation omits device-only contents such as `trash`, while complete
backups can include them. The Local/Sync choice is also device-specific.

Public release 1.0.0 uses `schemaVersion: 1`. The development schemas 2–21 were
discarded before publication and are not migrated. New profiles start with empty
bookmark, folder and widget collections. Future versioned schemas are rejected
or handled by the Sync compatibility fallback rather than silently overwritten.

### Bookmarks and folders

A bookmark owns identity, URL, appearance, workspace and a grid rectangle.
`folderId` represents folder membership. A contained bookmark keeps its saved
main-grid dimensions but does not reserve space in the top-level grid.

Folders are independent `data.folders` entities. They cannot contain folders,
and their bookmarks must belong to the same workspace. The ordinary contents
grid has six columns and three rows, for 18 bookmarks. Legacy overflow remains
accessible through additional scrollable rows.

Appearance presets contain visual fields only. They never carry identity,
URL, timestamps, membership or placement.

### Widget instances

Every widget uses a common conceptual envelope:

```js
{
  id,
  type,
  version,
  gx, gy, w, h,
  groupId,
  config,
  createdAt,
  updatedAt
}
```

The widget implementation owns the meaning and versioning of `config`. Valid
unknown types are retained even if the current build cannot render them. Widget
adapters are selectable by default; the generic layer can move them between
workspaces without interpreting their configuration.

### Recycle bin

The visible bin has its own position and appearance. `trash` holds deleted
bookmarks or complete folder-and-bookmark groups with deletion timestamps.
Retention is configurable: 1, 7, 14 or 28 days, or zero for no automatic expiry.
The default is 28 days. Contents remain device-local when Sync is active.

The current trash schema has no widget-entry format. User-facing widget deletion
asks for confirmation and removes the widget permanently without a trash entry.
Those permanent-removal flows clear grid history to prevent undo from restoring
it accidentally. The lower-level widget action also supports undoable removal
when a caller explicitly chooses that policy.

### Settings and workspaces

Workspaces currently use the legacy persisted keys `settings.bookmarkGroups`
and `settings.activeBookmarkGroupId`. The main workspace is represented by
`null`. Feature selectors adapt those keys; consumers should not independently
interpret the legacy representation.

Settings include language, interface theme, drag and resize policies, shortcuts,
appearance presets, panel visibility and recycle-bin retention. Personal
wallpaper collections and device image choices have separate device-local
storage rather than relying on a shared binary payload.

## 6. Store, history and update cycle

`state/appStore.js` maintains live state, delegates grid history and coordinates
persistence plus subscriber notification.

For `setState()`:

1. Retain the previous state and detect a relevant grid-data update.
2. Record an undo snapshot and clear redo when history recording applies.
3. Merge the supplied `data` and `ui` branches into state.
4. For persisted collection/settings changes outside hydration, mark saving and
   enqueue a snapshot in operation order.
5. Commit through the storage facade. Reconcile a rebased result with any local
   changes queued since that snapshot.
6. Mark the write saved or failed, then notify subscribers.

The grid history keeps at most 50 undo snapshots, covering bookmarks, folders,
widgets, bin appearance and trash. Settings and the persistence-mode choice are
excluded, so undo cannot switch Local to Sync. Diagnostic descriptions are
calculated separately in `state/stateChangeDescription.js`.

A failed optimistic write retains its base for later retries and merges.
Controllers must confirm durability through the persistence API before showing
success; awaiting a state mutation alone is not a substitute for that check.
`features/persistence/persistedAction.js` provides command feedback and retries
without running the mutation twice.

`appController` receives the previous and current state.
`appStateChanges.js` classifies theme, language, grid and edit-mode effects.
Leaving edit mode clears selection; transient-only changes avoid unnecessary
rebuilding of the workspace.

## 7. Grid system

The main logical grid is 12 columns by six rows, defined in
`shared/grid/gridGeometry.js`. Every grid item has `gx`, `gy`, `w` and `h`.

### Type registry

A definition supplies at least:

```js
{
  type,
  selector,
  getElementId,
  select,
  render
}
```

Optional capabilities include `enableEditing`, `selectable`,
`clearKeyboardOnOpen`, `open`, `edit`, `remove`, `getRemovalConfirmation`,
`getRemovalSuccessMessage` and independent grid/list ordering.

Feature adapters live in `features/bookmarks/bookmarkGridItem.js`,
`features/folders/folderGridItem.js` and
`features/recycle-bin/recycleBinGridItem.js`; the widget registry supplies
widget adapters. `gridRenderer.js` iterates visible entries and delegates
rendering and edit controls to each definition.

### Drag and resize

`features/grid/gridPointerController.js` coordinates gestures, using
`gridDragSession`, `gridResizeGesture`, `gridPointerGeometry` and
`gridGestureState` for their respective responsibilities. It distinguishes short
clicks from drags, previews layouts, detects folder/bin targets, handles eight
resize directions and commits one atomic update. Invalid gestures restore the
original rectangle.

Pure geometry and layout policies live in `shared/grid/resizeGeometry.js`,
`smartDragLayout.js`, `gridPlacement.js` and `gridGeometry.js`.

| Persisted mode | Policy |
|---|---|
| `none` | Accept free areas only. |
| `relocate` | Relocate blocking items into available space. |
| `cascade` | Shift a sequence toward a gap; exposed as experimental Sequence. |

Bookmark drags do not displace folder targets. Folder and widget movement can
use a broader movable-item set; the bin stays fixed.

### Selection and keyboard interaction

Selection is transient in `features/grid/gridSelection.js`, outside application
persistence. Bulk operations receive `{ kind, id }` pairs and apply only to
supported capabilities. For example, widgets can move between workspaces, but
bookmark/folder appearance presets do not interpret widget configuration.

`gridKeyboardController.js` owns explicit grid focus: `Tab` enters/leaves,
arrows choose a spatial route, `Enter` opens or edits, and `S` selects eligible
items. Pure route calculation lives in `shared/grid/gridKeyboardRoute.js`.

`gridKeyboardMovement.js` has a separate role: in edit mode, plain arrows move
one selected top-level grid item when explicit grid navigation is inactive.
It discovers the item through the registry and supports bookmarks, folders and
widgets with their appropriate movement policy. Text controls and open modals
retain their own keyboard handling.

## 8. Representative feature flows

### Create a bookmark

```text
launcher / shortcut
    → bookmarkModal
    → bookmarkEditorPanel validates the draft
    → bookmarkActions finds free placement
    → store.setState
    → storageFacade commits
    → appController detects changed grid data
    → gridRenderer updates the view
```

The reusable editor does not know persistence or placement. It returns a valid
draft to the controller that owns the command.

### Drag an item

```text
pointerdown
    → gridPointerController
    → smartDragLayout plans a reversible preview
    → pointerup confirms the result
    → gridItemActions updates all affected items together
    → store records one undo step
```

### Delete and restore

A bookmark/folder deletion builds a trash entry and removes the live entities
in one transition. Restoration calculates valid placement and membership,
restores the entities and removes that trash entry. A folder travels with its
contained bookmarks. Widget removal follows its separate permanent policy.

### Save Settings

The modal edits an isolated `settingsDraft`. Confirmation constructs final
settings and invokes the relevant actions. Cancellation discards pending edits
and cleans up newly staged local files rather than leaving partial changes.

## 9. Persistence, Sync and concurrency

Local is the initial mode and uses `chrome.storage.local`. Sync is enabled only
when `platform/browser/browserCapabilities.js` recognizes supported Google
Chrome. `platform/sync/syncTransport.js` serializes versioned data into
quota-safe `chrome.storage.sync` chunks.

The persistence-mode choice, local files, personal wallpaper collection, image
selections and trash contents remain device-specific. Shared bookmark data,
portable settings and configurable shortcuts follow the synchronized payload.
See the [privacy policy](../../PRIVACY.md) for external-media requests and
storage details.

### Local and remote deletion

The General-settings local reset removes this device's workspace, settings,
trash, personal image choices, wallpapers and stored image/video files. With
Sync active, it first switches to Local with an empty state. It never overwrites
or deletes the cloud payload. Sync deletion is a separate confirmed operation.

On remote deletion, an open device preserves the synchronized state it was
showing as a local copy and leaves Sync. A closed device discovers the missing
payload on its next read and uses its last local snapshot. The implementation
does not automatically recreate the removed cloud payload.

### Future versions and simultaneous edits

An older installation encountering a newer schema or Sync transport format
falls back to compatible Local data and displays an update notice instead of
overwriting the remote value. The compatibility marker is device-specific.

Writes are queued. When a more recent persisted base is discovered,
`shared/data/mergeChanges.js` reconciles the original base, local changes and
latest persisted data. This reduces lost updates between tabs on the same
device. It does not provide guaranteed distributed conflict recovery across
different devices.

## 10. UI, styles, localization and media

`src/newtab.html` supplies the main hosts and static modal markup; features own
dynamic components. `shared/ui/modalManager.js` centralizes registration,
stacking, open/close lifecycle, focus trapping, background isolation, focus
restoration and compact-viewport policy. Feature modals own their content and
commands rather than duplicating those mechanisms.

`src/styles/main.css` is the new-tab document's CSS entry. `styles/popup.css` is
its separate popup counterpart. Global reset, variables, document canvas and
scrollbar rules live in `styles/base`; cross-cutting states in
`styles/utilities`; shared component styles in `shared/ui`; feature and widget
styles beside the code that owns their DOM. Project-health tests ensure every
source stylesheet is reachable from the entry sheets and detect broken imports
or cycles.

`src/lang/` contains bundled interface dictionaries and localized manuals.
`platform/i18n/i18n.js` resolves the active language, interpolates text and
updates translated DOM attributes. Add new visible text to every supported
catalog and consume it through `t()` or translation attributes. The runtime
loads bundled dictionaries and does not call translation services.

`platform/images/localImages.js` and `localVideos.js` resolve device-local media.
Shared state can retain references, but local binary files are not sent through
Chrome Sync. Complete backups carry referenced media when exported; their ZIP
container belongs to `platform/backup/backupArchive.js`.

## 11. Add a bundled widget

1. Create a widget-owned folder and choose a stable kebab-case `type`.
2. Implement `render()` and any required editing/interaction hooks.
3. To support creation, expose `catalog: { nameKey, descriptionKey, icon }` and
   `create({ onCancel })`. The generic catalog supplies picker presentation and
   return navigation.
4. For an editor or other support surface, expose synchronous
   `initialize({ modalHost })` and mount only that widget's UI.
5. Add the definition to `widgets/builtin/index.js`.
6. Create instances through `addWidget()` with the required grid bounds.
7. Normalize and version `config` within the implementation.
8. Cover the model, registry/actions, component lifecycle and visible journey
   at the appropriate test layers.

A bundled widget should not need widget-specific imports in `bootstrap.js`,
static modal markup in `newtab.html`, or a type branch in generic rendering and
keyboard navigation. If it does, design the missing generic capability first.

## 12. Where to make a change

| Need | Primary owner |
|---|---|
| Bookmark validation | `domain/bookmarks/` |
| Bookmark creation behavior | `features/bookmarks/bookmarkActions.js` |
| Bookmark dynamic markup | `features/bookmarks/bookmarkCard.js` |
| Folder rules and local placement | `domain/folders/` |
| Folder contents UI | `features/folders/` |
| Collision and placement algorithms | `shared/grid/` |
| Pointer gesture interpretation | `features/grid/gridPointerController.js` and its helpers |
| Shared grid command | `features/grid/gridItemActions.js` |
| Persistence or data migration | `platform/storage/` |
| Sync chunking and codec | `platform/sync/` |
| Global state-driven UI effect | `app/appController.js` |
| Reusable modal primitive | `shared/ui/` |
| New preference | Settings domain, Settings feature and schema as needed |
| New visual grid type | Feature adapter or `widgets/`, registered at composition |
| New visible text | Owning feature plus every supported language catalog |

## 13. Verification and diagnostics

The complementary verification layers are ESLint, Node's test runner,
Vitest/jsdom and Playwright. `tests/projectHealth.test.mjs` additionally checks
architectural boundaries, module/style reachability and literal DOM-id contracts.

```sh
npm run check          # lint, unit and DOM tests
npm run test:e2e       # browser journeys
npm run test:extension # a real unpacked extension in a temporary profile
npm run package:store  # verified distribution ZIP; requires Python
npm run package:dev    # developer ZIP with the source public identity key
npm run package:all    # both ZIP variants and SHA-256 checksums
npm run test:packaging # verify both variants and unchanged source manifest
```

Use unit tests for pure rules and schema/migration behavior, DOM tests for
component lifecycle, and E2E tests for visible interactions across modules.
Manifest, startup and real persistence changes also need the extension smoke
check. See the [development guide](../development/DEVELOPMENT.md) for setup,
browser selection, package verification and reproducible performance tools.

In a New DeskTab tab's DevTools console:

```js
NewDeskTabDebug.toggle()
await NewDeskTabDebug.report()
NewDeskTabDebug.history()
NewDeskTabDebug.clear()
```

The report includes version, active storage, Sync support, quota usage, counts
and startup timings. Operation traces separate preparation, queue wait and
storage write. `shared/diagnostics/debug.js` owns bounded tracing without knowing
application state; `app/applicationDiagnostics.js` composes the live report.

## 14. Invariants and common mistakes

Preserve these invariants:

- Domain code does not access the DOM or Chrome APIs.
- External data crosses the schema boundary before use.
- A bookmark and its folder belong to the same workspace.
- Folders cannot nest; contained bookmarks do not occupy the main grid.
- Multi-item movement commits atomically.
- Grid selection, pointer previews and focus are not persisted.
- Local/Sync selection is device-specific.
- An older version never overwrites a newer remote schema.
- Valid unknown widget types are retained even when not rendered.
- Modals restore focus through the shared manager.
- Visible text is localized.

Avoid importing a feature from domain code, calculating collisions in a modal,
writing Chrome storage directly from a feature, mutating `getState()` results,
adding type branches to a generic renderer, duplicating modal focus logic, or
splitting one user action across unrelated state commits.

## 15. Current limitations and extension points

The clock exercises the bundled-widget contract end to end and is still under
development. Useful future work includes stronger cross-device conflict
recovery and a versioned widget trash-entry format if widgets should become
restorable. These are extension points, not capabilities to assume today.

Any further extraction from the store should have a clear contract and its own
verification. Keep `state/` focused on live orchestration rather than turning it
into a general collection of feature rules. Continue with the
[architecture reference](ARCHITECTURE.md) for detailed module contracts.
