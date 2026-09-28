# NewDeskTab architecture

NewDeskTab is a Manifest V3 new-tab extension written in vanilla JavaScript. Its
architecture is being migrated incrementally from technical folders
(`core/`, `ui/`) toward explicit application, domain, feature, platform and
shared boundaries. The legacy folders remain valid transition points: files
move only when a tested boundary exists for them.

## Direction and dependency rules

```text
newtab.html -> main.js -> app (composition)
                           |
                           v
               features / bundled widgets ---> domain
                        |                         |
                        v                         v
                      shared <------------- platform adapters
                        |
                        v
                 browser DOM / Chrome APIs
```

The intended responsibilities are:

- `app/`: bootstrap and dependency composition. It may register features but
  must not contain bookmark, folder, workspace or recycle-bin rules.
- `domain/`: deterministic entities, normalization, validation and rules. It
  must not access the DOM or Chrome APIs.
- `features/`: complete user-facing capabilities and their adapters. A feature
  may use domain and shared code and receive platform services through its
  application boundary.
- `platform/`: Chrome storage, synchronization, browser capabilities, local
  images and i18n loading. Domain code must not import it.
- `shared/`: proven cross-feature mechanisms. It must stay small; feature rules
  do not move here merely because several files call them.
- `widgets/`: statically bundled grid-item types, their common persisted
  envelope and lifecycle commands. It is not a remote plugin loader.

During migration, `core/` contains a mixture of domain and platform code and
`ui/` contains shared UI plus feature UI. New dependencies should follow the
direction above. Existing files are moved only as part of a behavior-preserving
feature phase, not to make the tree look finished.

## Current migration status

Phases 1 through 17 establish the first application, domain, feature, platform
and widget seams, including the first visible bundled widget:

```text
src/js/
├── app/
│   ├── appController.js
│   ├── appStateChanges.js
│   ├── bootstrap.js
│   └── registerGridItemTypes.js
├── domain/
│   ├── bookmarks/
│   │   ├── bookmarkDefaults.js
│   │   └── bookmarkModel.js
│   ├── folders/
│   │   ├── folderDefaults.js
│   │   ├── folderGrid.js
│   │   └── folderModel.js
│   ├── recycle-bin/
│   │   ├── recycleBinDefaults.js
│   │   ├── recycleBinEntries.js
│   │   └── recycleBinModel.js
│   ├── settings/
│   │   └── interfacePreferences.js
│   └── workspaces/
│       └── workspaceModel.js
├── features/
│   ├── bookmarks/
│   │   ├── bookmarkActions.js
│   │   ├── bookmarkCard.js
│   │   ├── bookmarkEditor.js
│   │   ├── bookmarkEditorPanel.js
│   │   ├── bookmarkGridItem.js
│   │   ├── bookmarkModal.js
│   │   └── bookmarkPreview.js
│   ├── folders/
│   │   ├── folderActions.js
│   │   ├── folderCard.js
│   │   ├── folderCardActions.js
│   │   ├── folderController.js
│   │   ├── folderEditorModal.js
│   │   ├── folderGridItem.js
│   │   ├── folderModal.js
│   │   └── folderVisual.js
│   ├── grid/
│   │   ├── gridBulkActions.js
│   │   ├── gridItemActions.js
│   │   ├── gridItemLayout.js
│   │   ├── gridKeyboardController.js
│   │   ├── gridKeyboardMovement.js
│   │   ├── gridLayout.js
│   │   ├── gridPointerController.js
│   │   ├── gridRenderer.js
│   │   ├── gridSelection.js
│   │   └── gridSelectors.js
│   ├── history/
│   │   └── historyControls.js
│   ├── recycle-bin/
│   │   ├── recycleBinActions.js
│   │   ├── recycleBinAppearance.js
│   │   ├── recycleBinEditorModal.js
│   │   ├── recycleBinGridItem.js
│   │   └── recycleBinModal.js
│   ├── search/
│   │   ├── listSearch.js
│   │   ├── searchBookmarks.js
│   │   └── searchModal.js
│   ├── settings/
│   │   ├── settingsActions.js
│   │   ├── settingsDraft.js
│   │   ├── settingsModal.js
│   │   └── *Section.js
│   └── workspaces/
│       ├── workspaceActions.js
│       ├── workspaceSelectors.js
│       └── workspaceToolbar.js
├── platform/
│   ├── browser/
│   │   └── browserCapabilities.js
│   ├── images/
│   │   └── localImages.js
│   ├── i18n/
│   │   └── i18n.js
│   ├── storage/
│   │   ├── chromeStorage.js
│   │   ├── dataSchema.js
│   │   ├── deviceImageSelections.js
│   │   ├── deviceTrashStorage.js
│   │   ├── schemaVersion.js
│   │   └── storageFacade.js
│   └── sync/
│       └── syncTransport.js
├── shared/
│   ├── data/
│   │   └── mergeChanges.js
│   ├── grid/
│   │   ├── gridGeometry.js
│   │   ├── gridItemRegistry.js
│   │   ├── gridKeyboardRoute.js
│   │   ├── gridPlacement.js
│   │   ├── resizeGeometry.js
│   │   └── smartDragLayout.js
│   ├── images/
│   │   └── backgroundImage.js
│   ├── keyboard/
│   │   └── keyboardShortcuts.js
│   └── ui/
│       ├── alertModal.js
│       ├── flash.js
│       ├── interfaceTheme.js
│       ├── localImageUpload.js
│       ├── lockableInput.js
│       ├── modalManager.js
│       ├── surfaceContrast.js
│       ├── svgIcons.js
│       └── tabs.js
└── widgets/
    ├── builtin/
    │   ├── index.js
    │   └── clock/
    │       ├── clockGridItem.js
    │       ├── clockModel.js
    │       ├── clockSettings.js
    │       ├── clockSettingsView.js
    │       ├── clockView.js
    │       └── index.js
    ├── widgetActions.js
    ├── widgetModel.js
    └── widgetRegistry.js
```

The recycle-bin slice now has an explicit split. Pure entry creation,
expiration, restoration and collision rules live in `domain/recycle-bin`.
Store-backed use cases live in `features/recycle-bin`, alongside the card and
modal UI. Device-only trash persistence lives under `platform/storage`.
Time and id generation remain in the feature action layer and are injected
into the pure domain operations, keeping their tests deterministic.

Bookmark, folder and recycle-bin defaults and normalization now live in
`domain/`. Their shared background-image value rules are separate from the
device image cache, Chrome Storage and Canvas processing under `platform/`.
Store-backed bookmark, folder and mixed-grid commands live in their feature
slices. `core/defaults.js` temporarily composes and re-exports domain defaults
so compatibility callers can migrate without a persisted-data change. CSS
remains under `css/features/` because its loading lifecycle has not changed.

Workspace identity, naming, normalization and cyclic navigation now live in
`domain/workspaces`. Store-backed creation, activation, deletion and bookmark
movement live in `features/workspaces`; selectors adapt the legacy persisted
field names for UI and other feature consumers.

## Platform and shared runtime boundaries

Browser-brand detection and the translation runtime live under `platform/`
because they read browser capabilities, Chrome runtime URLs, device locale and
translation assets. Portable preference normalization remains deterministic in
`domain/settings`, while `shared/ui/interfaceTheme.js` owns the small DOM
effect that applies the normalized interface theme. The bootstrap injects the
hydrated settings into i18n, so the platform service does not read the store.

Keyboard shortcut parsing and spatial grid routing are pure cross-feature
mechanisms under `shared/keyboard` and `shared/grid`. Their consumers import
those modules directly; no compatibility re-export remains in `core/`.
`core/store.js` deliberately stays in place until its remaining consumers can
move as a separate, tested phase.

## Shared UI primitives

Modal stacking, alerts, flash messages, tabs, local-image inputs, lockable
inputs, surface contrast and SVG factories live under `shared/ui`. Each is a
proven cross-feature mechanism with no feature ownership; feature controllers
import the primitive they use directly. The obsolete generic modal index has
been removed, so application composition names each feature modal explicitly.

The remaining `ui/` modules coordinate the application shell, backup flows and
bookmark-oriented presentation helpers that do not yet have a final owner.
They remain transitional until those responsibilities have their own tested
boundary. This move changes no HTML, CSS, persisted data or modal behavior.

## Grid interaction boundary

The complete top-level interaction layer lives in `features/grid`: rendering,
DOM layout, transient mixed-item selection, bulk actions, pointer gestures,
keyboard focus and keyboard movement. Feature-owned GridItem adapters opt into
those controllers without duplicating interaction logic. The selection API is
generic and represents `{ kind, id }` pairs; bookmark-only compatibility aliases
have been removed.

Keyboard navigation discovers visible items through the registry instead of
enumerating feature collections or DOM data attributes. Definitions may expose
`open`, `edit`, removal-confirmation and `remove` callbacks plus selection
capability. Those feature-owned hooks keep bookmark, folder, recycle-bin and
future widget behavior out of the grid controller.

Deterministic resize geometry and smart-movement planning live in
`shared/grid`. They receive plain rectangles and policies and do not access the
DOM, store or feature controllers. The feature layer supplies current state and
commits the resulting positions atomically. This keeps reusable policy separate
from browser event coordination and avoids introducing item-type branches into
the renderer.

## Application bootstrap and state reactions

`main.js` is deliberately a minimal browser entry point. It delegates startup
to `app/bootstrap.js`, which owns initialization order, bundled feature
registration, store hydration and the wiring of UI controllers. Startup
failures and diagnostics are handled at that same application boundary.

Store transitions are coordinated by `app/appController.js`. It translates
immutable state-reference changes into theme, localization, grid-render and
edit-mode effects without containing domain rules. The deterministic change
classification lives in `app/appStateChanges.js`, making the routing contract
testable without a DOM or Chrome API. Feature commands remain the only place
that decides how bookmarks, folders, workspaces, the recycle bin or widgets
change.

## Settings feature boundary

The settings capability is owned by `features/settings`. Its store-backed
command, modal controller, isolated draft and section controllers now live in
one vertical slice. The application bootstrap composes that feature directly;
the generic modal index no longer acts as a feature registry. Reusable modal,
tab, flash, upload and icon primitives live in `shared/ui` while storage and
sync operations remain behind the existing store/platform boundary.

This move is intentionally schema-neutral. The persisted `settings` object,
live-preview behavior, storage-mode workflow and HTML/CSS contracts are
unchanged. Feature-action tests protect partial updates and the recycle-bin
placement side effect when its visibility is enabled.

## Search feature boundary

The global bookmark search and compact-list filter are owned by
`features/search`. The global modal delegates matching, recency ordering and
result limits to the pure `searchBookmarks()` query, while workspace and folder
labels remain presentation context assembled by the modal. The application
bootstrap imports the feature entry points directly; the generic modal index is
no longer a registry for Search. The search modal also owns its toolbar trigger,
so workspace controls do not depend on Search.

Reusable modal coordination lives in `shared/ui/modalManager.js`. Existing HTML ids
and CSS under `css/features/searchModal.css` are intentionally unchanged, so
this move does not alter the DOM, styling, keyboard shortcut or persisted data
contracts. Unit tests protect the query behavior and the existing Playwright
journeys protect both search surfaces.

## Bookmark editor feature boundary

The complete bookmark editing flow is owned by `features/bookmarks`: its modal
coordinates create, edit and preset use cases; the reusable editor panel owns
draft validation and lifecycle; and the editor plus preview keep form state and
the production bookmark card synchronized. The application bootstrap, bookmark
actions, keyboard navigation, folder modal and Settings import that feature
entry point directly. The generic modal index is no longer a registry for the
bookmark editor.

Reusable tabs, modal management, alerts and local-image input controllers live
in `shared/ui`. Viewport checks remain transitional shell coordination in
`ui/`; grid selection, drag/resize and keyboard movement belong to the Grid
feature. Existing HTML templates, CSS, persistence and bookmark draft contracts
are unchanged.

## Folder feature boundary

The folder capability is owned by `features/folders`. Store-backed membership
and layout commands, the GridItem adapter, card and action rendering, shared
folder visual, create/edit modal and compact folder workspace now form one
vertical slice. The application bootstrap composes its controller and modals
directly, and the generic modal index no longer exposes folder-specific entry
points.

The folder slice consumes the Grid feature for top-level layout, drag/resize,
selection and keyboard behavior. Transitional bookmark-card actions and compact
list rows remain in `ui/`, while generic modal, tab and local-image primitives
come from `shared/ui`. Its modal also invokes the bookmark editor through the
bookmark feature entry point. Moving these modules changes neither folder data,
internal 6 × 3 layout, HTML templates, CSS nor keyboard behavior.

## Workspace and history control boundaries

`features/workspaces/workspaceToolbar.js` owns workspace selection, creation,
deletion and animated cyclic navigation. It consumes the workspace commands and
selectors from its own slice and clears transient grid selection when switching
contexts. Search activation and undo/redo are no longer mixed into that
controller.

Global undo and redo buttons plus the `Ctrl/Cmd + Z` shortcut live in the small
`features/history` slice, which adapts the existing store history API to the
DOM. Search owns its own toolbar button. The application bootstrap composes all
three controllers explicitly. Existing toolbar markup, CSS, history semantics
and workspace persistence remain unchanged.

## GridItem and the item-type registry

`GridItem` is a structural contract: `id`, `gx`, `gy`, `w`, `h` and `groupId`.
Bookmarks, folders and the recycle bin already satisfy it. The type is supplied
by a feature adapter rather than persisted on every item, so this phase needs no
schema migration and old synchronized data remains compatible.

`shared/grid/gridItemRegistry.js` knows only the adapter protocol. A definition
provides:

- a stable `type`;
- `select(state)` to expose visible feature items;
- `render({ view, ... })` for grid and compact-list views;
- a DOM selector plus `getElementId()` for generic resize lookup;
- optional `enableEditing()` behavior;
- optional `open()`, `edit()`, removal and selection capabilities;
- independent grid and list ordering.

`features/grid/gridRenderer.js` iterates registered definitions. It does not
branch on bookmark, folder, recycle-bin or future widget types. The application
composition root registers bundled definitions through
`app/registerGridItemTypes.js`. The registry is static local code and does not
load remote scripts, keeping it compatible with Manifest V3 CSP.

The registration seam also removed the two static ES-module cycles that used
to pass through `ui/bookmark/renderer.js`. Bookmark visuals now live in
`features/bookmarks/bookmarkCard.js`, so previews and folder contents reuse the
card without importing the grid orchestrator.

## Recycle-bin flow

```text
recycle-bin UI / grid adapter
             ↓
features/recycle-bin/recycleBinActions.js → core/store.js
             ↓
domain/recycle-bin/recycleBinEntries.js

core/store.js
     ↓
platform/storage/storageFacade.js
     ↓
platform/storage/deviceTrashStorage.js → chrome.storage.local
```

The domain module receives plain data and returns new data. It does not read
the store, DOM, clock, random ids or Chrome APIs. Feature actions decide when a
command happens, create ids and timestamps, and commit one store transition so
undo behavior remains unchanged. The platform adapter owns the device-local
record used to recover data that was permanently removed from the application.

## Workspace as a domain entity

Persisted workspaces remain represented by `settings.bookmarkGroups` and
`activeBookmarkGroupId` for backward compatibility. The explicit `Workspace`
entity owns identity, naming, normalization, active-workspace resolution and
navigation without knowing about the store or browser APIs. Feature selectors
are the adapter between those concepts and the legacy settings keys, so UI code
does not edit the persisted collections directly. This phase deliberately does
not change `schemaVersion` or synchronized data.

## Store, persistence and synchronization

Chrome-specific persistence is now behind a platform boundary:

```text
UI / feature commands
        ↓
core/store.js (live state, subscriptions, history, persistence queue)
        ↓
platform/storage/storageFacade.js (mode, quotas, compatibility, events)
        ├── platform/storage/dataSchema.js (migration and envelopes)
        ├── platform/storage/device*Storage.js (device-only records)
        ├── platform/sync/syncTransport.js (pure versioned codec/chunking)
        └── platform/storage/chromeStorage.js → Chrome Storage

stale page snapshot + latest persisted data
        ↓
shared/data/mergeChanges.js
        ↓
platform/storage/storageFacade.js
```

`store.js` retains live state, subscriptions, undo/redo and the ordered
persistence queue. It depends on the facade, but does not know Chrome keys,
callbacks, quotas, chunks or sync wire format. The facade owns local/sync mode,
compatibility fallback and Chrome change events. The sync module is pure: it
encodes and decodes the existing versioned chunk format and can be tested
without browser globals. Schema version 17 adds the generic `widgets`
collection; all stored/imported migrations remain together under
`platform/storage`. Visual components continue to call feature actions rather
than the storage facade directly.

The destructive General-settings reset is explicitly device-local. In Local
mode it replaces persisted app data with an empty default state; in Sync mode
it first switches the device to Local using that empty state. It then clears
device trash, image selections and every owned local-image blob. It never
writes to or deletes the synchronized payload; remote deletion remains the
separate action in the Sync section.

Remote Sync deletion is a distributed mode transition. Open devices detect the
empty synchronized area, persist the last synchronized state they were showing
as their local copy and switch to Local. Devices which were closed make the
same mode transition on their next read and use their last local snapshot.
None of them recreates the deleted cloud payload automatically.

## Bundled-widget API

`WidgetInstance` is the common persisted envelope: grid identity and geometry,
a stable bundled `type`, a per-widget `version`, timestamps and an opaque
`config` object. The schema preserves valid unknown types so data is not lost
when a bundled implementation is temporarily unavailable. Widgets participate
in backup, local/sync storage, concurrent merge, grid collision, undo/redo and
the normal render subscription without adding widget branches to the store.

`widgets/widgetRegistry.js` adapts a widget to `GridItem`: it selects instances
of the registered type in the active workspace and owns the common DOM identity
attributes. Widget adapters are selectable by default and share the `widget`
selection kind, so the generic bulk layer can move every widget between
workspaces without interpreting its configuration. A definition supplies a
stable `type`, `render()` and any optional editing or interaction capabilities
it needs. It may also expose `initialize({ launcher, modalHost })` to mount its
own creation control and editor exactly once. Registration and initialization
are synchronous local-module composition and are compatible with Manifest V3
CSP; no code is downloaded or evaluated.

The current recycle-bin schema stores bookmarks and complete folders only.
Dropping a widget on the bin, deleting it from a bulk selection or using the
grid deletion shortcut therefore asks for confirmation and removes it
permanently without creating a misleading trash entry. This policy can change
when a versioned widget trash-entry contract exists.

The first bundled implementation uses this shape:

```text
widgets/builtin/clock/
├── clockModel.js
├── clockGridItem.js
├── clockSettings.js
├── clockSettingsView.js
├── clockView.js
└── index.js
```

`widgets/builtin/index.js` is the single catalog of included implementations.
Application composition registers that catalog and initializes the generic
widget lifecycle; it does not import the clock. The clock creates its launcher
button and settings modal from its own view module, so adding another bundled
widget requires no widget-specific bootstrap code or static page markup.
Creation, configuration updates and removal use `widgetActions`; the clock opts
into the shared drag/resize controller with `kind: 'widget'`. Its visible time
is transient DOM state aligned to the next second or minute and never produces
store writes. Only its versioned configuration and grid rectangle are persisted.
The widget owns config normalization, grid/list rendering and its settings
surface without adding clock branches to the generic renderer, store or storage
facade. It participates in local/sync persistence, backups, selection,
cross-workspace movement, keyboard navigation and collision handling through
the existing contracts. Remote executable plugins remain out of scope.

## Incremental roadmap

1. ✅ Establish the GridItem registry and feature-owned rendering.
2. ✅ Complete the recycle-bin slice: separate pure domain
   restoration/retention rules, feature actions and modal UI; move device
   trash to platform storage.
3. ✅ Move bookmark and folder models/actions behind feature boundaries while
   retaining the tested store commands.
4. ✅ Introduce the explicit workspace domain entity without changing persisted
   `bookmarkGroups` data in the same step.
5. ✅ Split store state/history from Chrome persistence, sync transport and
   schema migration.
6. ✅ Add the minimal bundled-widget API and versioned generic widget envelope,
   without shipping a visible widget or changing current UX.
7. ✅ Reduce `main.js` to the browser entry point and move bootstrap composition
   and store-to-UI coordination behind the application boundary.
8. ✅ Encapsulate settings commands, draft state, modal coordination and section
   controllers as a complete feature while retaining reusable UI primitives.
9. ✅ Move browser/i18n runtime services and reusable keyboard/grid policies out
   of transitional `core/`; split pure interface preferences from their DOM effect.
10. ✅ Encapsulate global bookmark search and compact-list filtering as a Search
    feature, with the reusable query policy covered independently from its DOM UI.
11. ✅ Encapsulate the bookmark modal, editor panel, form controller and preview
    as one vertical feature while retaining proven cross-feature UI primitives.
12. ✅ Encapsulate folder cards, visual actions, create/edit flow and compact
    folder workspace alongside the existing folder commands and GridItem adapter.
13. ✅ Complete the workspace UI slice and separate Search activation and global
    history controls from workspace-specific behavior.
14. ✅ Consolidate proven cross-feature UI primitives under `shared/ui`, remove
    the generic modal index and keep feature composition explicit.
15. ✅ Encapsulate mixed-item grid interaction under `features/grid` and move
    deterministic resize and smart-layout policies into `shared/grid`.
16. ✅ Ship the first visible bundled widget: a local-time clock with 12/24-hour
    and seconds controls, compact-list rendering, drag/resize, persistence,
    keyboard actions and undoable removal.
17. ✅ Centralize bundled-widget composition and let each definition initialize
    its own launcher and editor without widget-specific bootstrap imports or
    static `newtab.html` markup.

Each phase must finish with lint, unit and DOM tests, relevant E2E journeys and
the unpacked-extension smoke/package checks.

## Existing implementation details

The remaining sections describe the current behavior that every migration must
preserve.

```text
Reusable UI components and renderers
        ↓
Feature actions and selectors
        ↓
Domain models + core/store.js
        ↓
Browser persistence
```

## Domain and transitional core

`src/js/domain/bookmarks/bookmarkModel.js` owns bookmark drafts, presets,
normalization and validation. `src/js/domain/folders/folderModel.js` owns the
equivalent folder rules, including its name contract. Their functions do not
read global state, making them deterministic.

`src/js/platform/storage/dataSchema.js` is the boundary for stored,
synchronized and imported data. `schemaVersion` changes only when a persisted
shape changes; the current value is isolated in `schemaVersion.js`. Old data is
migrated before entering the store. Schema 3 adds `folders` and the nullable
`bookmark.folderId` reference; schema 0–2 data migrates with an empty folder
collection.

Schema 9 adds folder appearance controls: `outerBackgroundColor` is a nullable
hex color, where null retains the automatic tile gradient. `showFolder`,
`showPreviews`, `showName` and `showCount` default to true so existing folders
keep their appearance. `normalizeFolderStyle()` disables previews whenever
the folder graphic is hidden, including when importing or restoring data.

Schema 10 adds the four configurable keyboard shortcuts under
`settings.keyboardShortcuts`. Missing, invalid or conflicting legacy values
fall back to the safe default combinations.

`features/bookmarks/bookmarkActions.js`, `features/folders/folderActions.js`,
`features/grid/gridItemActions.js` and `features/workspaces/workspaceActions.js`
implement store-backed application commands. Batch operations make one store
transition, so undo treats them as a single user action. Workspace UI reads the
legacy persisted fields only through `workspaceSelectors.js`.

`src/js/core/bookmarkDragModes.js` owns the persisted drag-mode contract and
normalizes missing or unknown values to None.
`src/js/platform/browser/browserCapabilities.js` keeps browser detection out of
Settings and only enables synchronized storage for tested, branded Google
Chrome environments.

`src/js/core/store.js` owns live state, the persistence queue and grid-content
undo/redo history. A history snapshot contains bookmarks and folders together.
Synchronization settings are deliberately excluded from undo, preventing a
shortcut from changing where data is stored.

## Folder invariants

Folders are independent entities in `data.folders`. They have an id, name,
workspace, timestamps and a resizable `gx`, `gy`, `w`, `h` grid rectangle. New
folders start at `1 × 1`. Bookmark membership is represented by nullable
`bookmark.folderId`.

The schema and commands enforce these rules:

* A folder and its bookmarks always belong to the same workspace.
* Folders cannot contain other folders.
* A contained bookmark does not reserve grid space.
* A top-level folder reserves its complete `w × h` rectangle.
* New folder membership is capped at 18 bookmarks in a fixed 3-row ×
  6-column grid. Legacy overflow remains accessible in scrollable extra rows.
* Contained bookmarks occupy one local cell while preserving their main-grid
  `w × h` size for a later removal.
* Moving onto an occupied local cell swaps both bookmark positions atomically.
* Removing a bookmark requires a free area matching its saved `w × h` size.
* Deleting a folder deletes its contained bookmarks in the same state change.
* Deleting a workspace deletes its folders and all bookmarks in that workspace.

## Bookmark editor

`features/bookmarks/bookmarkEditorPanel.js` exposes
`createBookmarkEditorPanel()` with three modes:

* `create`: blank identity combined with the current appearance preset.
* `edit`: an existing bookmark, including identity and appearance.
* `preset`: appearance sections only; identity and layout cannot leak out.

The panel manages fields, tabs, validation, dirty state, preview and lifecycle.
It does not know about modals, grid placement, persistence or the store.

Create mode opens as a compact name-and-URL form. Its advanced-options control
animates the same panel to full size, preserving the draft while exposing the
appearance tabs and live preview. Edit and preset modes always open expanded.

Settings opens the same panel in `preset` mode to configure the default bookmark
appearance. The settings tab owns only the button and draft preset; it does not
embed a second editor implementation.

## Grid interaction

`features/grid/gridPointerController.js` is the shared pointer controller for
registered grid items. It owns drag gesture thresholds, folder drop targeting,
eight-direction resize handles, previews and atomic commits through
`updateGridItemsByIds()`. Resize geometry lives in the pure
`shared/grid/resizeGeometry.js` module. An invalid gesture restores the original
rectangle, not the last valid intermediate preview.

`shared/grid/smartDragLayout.js` is a pure layout planner. Persisted state
remains the baseline while pointer previews are reversible:

* `none` rejects occupied pointer targets.
* `relocate` maps blockers into the vacated area or nearest free rectangle.
* `cascade` shifts a chain toward the gap and is exposed as experimental.

Bookmarks are the movable set during a bookmark drag, so a folder is never
displaced and remains available as a drop target. A folder drag includes every
top-level grid item in its movable set, allowing folders to participate in the
same planner without a separate drag implementation. Folder size is always
included in collision checks.

Selection lives in `features/grid/gridSelection.js` and is intentionally
transient. A short
primary click toggles a bookmark, while a held primary click becomes a drag.
Middle click delegates to the same editor entry point as the direct pencil and
prevents the bookmark link from opening a tab.

`features/grid/gridKeyboardController.js` owns explicit top-level grid focus. `Tab` enters
or leaves the mode, and arrows select the nearest visible bookmark, folder or
recycle bin in the requested direction while carrying the row or column used
to enter resized cards. Horizontal arrows choose the closest candidate using
that row as the cross-axis. A diagonal candidate is ignored across zero or one
empty cell, but can fill a route after two or more empty cells; vertical arrows
stay in the remembered column and are no-ops when the column is empty. Outside
edit mode, `Enter` opens the focused item. In
edit mode, `Enter` opens its editor when there is no selection or when the
focused item is the sole selected item; `S` toggles bookmark or folder selection
and gives the recycle bin a transient unavailable-state signal. The active item is
transient UI state rendered as a keyboard-focus affordance. Reversing the last
arrow movement returns to its origin, preserving the route used to enter a
folder or bookmark. Opening an in-app folder, editor or recycle-bin modal keeps
that state and lets the modal manager restore focus to the same card on close;
bookmark URLs are the one exception because they navigate away from the page.

`features/grid/gridKeyboardMovement.js` moves one visible, top-level selected
bookmark or folder in edit mode when keyboard grid navigation is not active.
None mode scans to the next free rectangle; the smart modes exchange bookmarks
one keypress at a time and skip fixed folder rectangles. The resulting bookmark
and displacement updates use one state transition and therefore one undo entry.

## Persistence

Local mode uses `chrome.storage.local`. Sync mode serializes the complete
versioned payload and divides it into quota-safe `chrome.storage.sync` chunks.
The local storage-mode choice remains device-specific.

Custom keyboard shortcuts live inside the versioned `settings` object. They
therefore use the same migration, backup and Sync paths as visual preferences;
only the persistence-mode choice remains device-specific.

`browserCapabilities.js` currently permits Sync only in Google Chrome. Brave
and unverified Chromium browsers stay in Local mode because exposing
`chrome.storage.sync` does not guarantee that their profile service propagates
NewDeskTab data. The storage facade exposes quota usage for both areas through
`getBytesInUse`, with a byte estimate fallback for compatible implementations.
Settings displays used/total/available capacity for the currently selected mode,
persistence status and synchronized update metadata. Confirmed deletion removes
only NewDeskTab's synchronized keys; if Sync is active, it preserves the working
data in Local first.

Future sync schemas and transport formats are treated as a recoverable
compatibility state rather than a fatal hydration error. The storage facade
records a device-local compatibility marker, selects compatible Local data and
never writes to the newer remote payload. Settings reads that marker to disable
Sync and explain the required update. The marker expires automatically when the
installed schema/format catches up, and explicit remote-data deletion also
clears it.

Complete backups use the `newdesktab-backup` format; bookmark-only files use
`newdesktab-bookmarks`. Both versioned formats preserve folders and membership.
Legacy raw bookmark arrays remain importable without folders.

## UI coordination

Modal controllers translate user actions into feature or transitional core
commands. Recycle-bin modals now call their colocated feature actions. The
modal manager owns stacking, focus trapping, background isolation and focus
restoration.

The renderer displays top-level bookmarks and folders in the active workspace.
`features/folders/folderCard.js` owns the folder card and previews, while
`features/folders/folderModal.js` reuses the production bookmark renderer in a
compact 3 × 6 workspace. The modal starts in a link-only view with no action or
drag listeners. Its local edit mode, toggled by the header control or the
configured edit shortcut (`Ctrl + E` by default),
re-renders controls and enables a pointer controller that previews empty-cell
moves and occupied-cell displacement through the same
`calculateSmartDragLayout()` modes as the main grid. Preview positions are
rendered as smooth transforms from each item's persisted cell; on release the
transform remains visible until
`updateFolderBookmarkPositions()` atomically commits that exact layout, avoiding
a source/destination flash. `src/js/domain/folders/folderGrid.js` owns the pure
local layout contract and normalizes legacy or colliding positions
deterministically. Main-grid bookmark drag logic detects folder hit targets and
delegates membership changes to the folder feature actions.

`features/search/searchModal.js` indexes all workspaces and contained bookmarks,
showing folder context when present. `features/search/listSearch.js` filters the
already-rendered compact view without changing saved data. Selection is pruned
when bookmarks disappear and is cleared when edit mode closes.

`features/workspaces/workspaceToolbar.js` owns cyclic workspace navigation.
`Alt/Option` with the up or down arrow resolves the adjacent workspace through
the workspace domain and feature selectors,
animates the current grid out and the next grid in, and skips the transition
when the operating system requests reduced motion. Shortcuts are ignored while
typing or while a modal is open.

## Verification

The project has four complementary checks:

1. ESLint for static mistakes and undefined/unused symbols.
2. Node tests for domain, schemas, storage and history.
3. Vitest/jsdom for editor and modal lifecycles.
4. Playwright journeys plus an optional unpacked-extension smoke test.
