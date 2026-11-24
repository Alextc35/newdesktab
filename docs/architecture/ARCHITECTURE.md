# NewDeskTab architecture

[Documentation index](../README.md) · [Development](../development/DEVELOPMENT.md) · [Technical walkthrough](PROJECT_GUIDE.md)

NewDeskTab is a Manifest V3 new-tab extension written in vanilla JavaScript. Its
source is organized around explicit application, domain, feature, platform,
state, widget and shared boundaries. The former `ui/`, `core/`, `css/` and `js/`
transition directories have been retired; every remaining module has an
explicit tested owner directly under `src/`.

This reference describes release 1.1.1 and public data schema 2. The refactoring
milestones below are historical records; they do not override current contracts.

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
- `domain/`: entities, normalization, validation and deterministic rules. It
  must not access the application DOM or Chrome APIs. The bookmark HTML parser
  reads an inert document and never attaches imported markup to the application.
- `features/`: complete user-facing capabilities and their adapters. A feature
  may use domain and shared code and receive platform services through its
  application boundary.
- `platform/`: Chrome storage, synchronization, browser capabilities, local
  images and i18n loading. Domain code must not import it.
- `shared/`: proven cross-feature mechanisms. It must stay small; feature rules
  do not move here merely because several files call them.
- `state/`: live application state, transient history and persistence
  orchestration. Domain rules and browser storage implementations stay outside.
- `widgets/`: statically bundled grid-item types, their common persisted
  envelope and lifecycle commands. It is not a remote plugin loader.

New dependencies follow the direction above. Structural changes must preserve
these boundaries and remain behavior-preserving unless a feature explicitly
requires otherwise.

## Current source layout

The application, domain, feature, platform, state and widget boundaries define
the current ownership map. This is an abridged layout; colocated styles follow
the same directories:

```text
src/
├── app/
│   ├── appController.js
│   ├── applicationDiagnostics.js
│   ├── appStateChanges.js
│   ├── appShell.js
│   ├── bootstrap.js
│   └── registerGridItemTypes.js
├── domain/
│   ├── bookmarks/
│   │   ├── bookmarkDefaults.js
│   │   ├── bookmarkModel.js
│   │   ├── browserBookmarkImport.js
│   │   └── browserBookmarkSelection.js
│   ├── folders/
│   │   ├── folderDefaults.js
│   │   ├── folderContents.js
│   │   ├── folderGrid.js
│   │   ├── folderModel.js
│   │   └── folderTree.js
│   ├── recycle-bin/
│   │   ├── recycleBinDefaults.js
│   │   ├── recycleBinEntries.js
│   │   └── recycleBinModel.js
│   ├── settings/
│   │   ├── gridInteractionModes.js
│   │   ├── interfacePreferences.js
│   │   └── settingsDefaults.js
│   └── workspaces/
│       └── workspaceModel.js
├── state/
│   ├── appStore.js
│   ├── gridHistory.js
│   └── stateChangeDescription.js
├── features/
│   ├── onboarding/
│   │   ├── assets/
│   │   ├── onboarding.js
│   │   ├── onboarding.css
│   │   ├── onboardingAnimation.js
│   │   ├── onboardingAnimation.css
│   │   ├── onboardingEditAnimation.js
│   │   ├── onboardingEditAnimation.css
│   │   ├── onboardingFolderAnimation.js
│   │   ├── onboardingFolderAnimation.css
│   │   ├── onboardingFolderPreview.js
│   │   ├── onboardingReadyAnimation.js
│   │   ├── onboardingReadyAnimation.css
│   │   ├── onboardingReadyPreview.js
│   │   ├── onboardingTimeline.js
│   │   ├── onboardingStylePreview.css
│   │   ├── onboardingPreview.js
│   │   └── onboardingPreview.css
│   ├── bookmarks/
│   │   ├── bookmarkActions.js
│   │   ├── bookmarkCard.js
│   │   ├── bookmarkCardActions.js
│   │   ├── bookmarkEditor.js
│   │   ├── bookmarkEditorPanel.js
│   │   ├── bookmarkFavicon.js
│   │   ├── bookmarkGridItem.js
│   │   ├── bookmarkImportExport.js
│   │   ├── bookmarkListItem.js
│   │   ├── bookmarkModal.js
│   │   ├── bookmarkPreview.js
│   │   ├── browserBookmarkImport.js
│   │   └── browserBookmarkImportUI.js
│   ├── folders/
│   │   ├── folderActions.js
│   │   ├── folderAppearance.js
│   │   ├── folderCard.js
│   │   ├── folderCardActions.js
│   │   ├── folderController.js
│   │   ├── folderEditorModal.js
│   │   ├── folderGridItem.js
│   │   ├── folderListItem.js
│   │   ├── folderModal.js
│   │   └── folderVisual.js
│   ├── grid/
│   │   ├── gridBulkActions.js
│   │   ├── gridItemAppearance.js
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
│   ├── keyboard/
│   │   └── keyboardShortcutController.js
│   ├── launcher/
│   │   ├── floatingMenu.js
│   │   └── launcherVisual.js
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
│   │   ├── backupActions.js
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
│   │   ├── browserCapabilities.js
│   │   └── extensionMetadata.js
│   ├── images/
│   │   └── localImages.js
│   ├── i18n/
│   │   └── i18n.js
│   ├── storage/
│   │   ├── chromeStorage.js
│   │   ├── dataSchema.js
│   │   ├── deviceImageSelections.js
│   │   ├── deviceTrashStorage.js
│   │   ├── persistedDataDefaults.js
│   │   ├── schemaVersion.js
│   │   └── storageFacade.js
│   └── sync/
│       └── syncTransport.js
├── shared/
│   ├── data/
│   │   └── mergeChanges.js
│   ├── diagnostics/
│   │   └── debug.js
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
│       ├── itemActionButton.js
│       ├── jsonDownload.js
│       ├── localImageUpload.js
│       ├── lockableInput.js
│       ├── modalManager.js
│       ├── pageTheme.js
│       ├── surfaceContrast.js
│       ├── svgIcons.js
│       ├── tabs.js
│       └── viewportMode.js
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
    ├── widgetCatalog.css
    ├── widgetCatalog.js
    ├── widgetCatalogView.js
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
slices. Settings defaults live with the Settings domain, while
`platform/storage/persistedDataDefaults.js` composes a fresh complete persisted
value from the domain defaults and current schema version. There is no defaults
aggregator or compatibility re-export. `styles/main.css` is the single document
entry for global tokens and stylesheet composition; feature CSS lives beside
its explicit visual owner without changing that loading contract.

Workspace identity, naming, normalization and cyclic navigation now live in
`domain/workspaces`. Store-backed creation, activation, deletion and bookmark
movement live in `features/workspaces`; selectors adapt the legacy persisted
field names for UI and other feature consumers.

## Platform and shared runtime boundaries

Browser-brand detection, manifest metadata and the translation runtime live
under `platform/` because they read browser capabilities, Chrome runtime APIs,
device locale and translation assets. Portable preference normalization remains
deterministic in `domain/settings`, while `shared/ui/interfaceTheme.js` and
`shared/ui/pageTheme.js` own the DOM effects that apply interface colors and the
configured page background. The bootstrap injects the hydrated settings into
i18n, so the platform service does not read the store.

Keyboard shortcut parsing and spatial grid routing are pure cross-feature
mechanisms under `shared/keyboard` and `shared/grid`. Their consumers import
those modules directly; no compatibility re-export or transitional directory
remains.

The bounded console tracer lives in `shared/diagnostics` and has no knowledge
of application state. `app/applicationDiagnostics.js` composes it with the
store, browser capabilities, image cache and startup lifecycle to expose
`NewDeskTabDebug`. State-specific labels are classified by
`state/stateChangeDescription.js`, keeping the reusable tracer independent from
application data shapes.

Optional timing subscribers receive isolated copies of completed traces without
changing the bounded console history. The E2E action audit enables this collector
only when `NEWDESKTAB_AUDIT_DIR` is set; normal tests and production keep Debug
disabled. See [the audit procedure](../benchmarks/ACTION_AUDIT.md) for the measured
boundaries, coverage limits and source-reachability checks.

## Shared UI primitives

Modal stacking, alerts, flash messages, tabs, local-image inputs, lockable
inputs, action buttons, JSON downloads, viewport policy, surface contrast and
SVG factories live under `shared/ui`. Each is a proven cross-feature mechanism
with no feature ownership; feature controllers import the primitive they use
directly. Their modal, shared-editor, flash, item-action and local-image styles
are colocated in the same boundary. The obsolete generic modal index has been
removed, so application composition names each feature modal explicitly.

The former `ui/` directory has no compatibility re-exports. Application-shell
effects live in `app/appShell.js`; runtime shortcuts and the expandable edge
launcher are small feature slices; backup behavior belongs to Settings; and bookmark cards,
favicons, compact rows and transfer controls belong to Bookmarks. Folder rows
remain in the Folder feature because their visual and open behavior are
folder-specific.

Workspace navigation is owned by `features/workspaces/workspaceToolbar.js`.
Its bottom dock renders an integrated, expandable workspace list while keeping
a hidden native select as a state mirror for simple compatibility and tests.

## Grid interaction boundary

The complete top-level interaction layer lives in `features/grid`: rendering,
DOM layout, transient mixed-item selection, bulk actions, pointer gestures,
keyboard focus and keyboard movement. Feature-owned GridItem adapters opt into
those controllers without duplicating interaction logic. The selection API is
generic and represents `{ kind, id }` pairs; bookmark-only compatibility aliases
have been removed. GridItem interaction, compact presentation, the viewport,
editing overlay and responsive geometry are colocated with this interaction
layer.

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

The launcher and workspace toolbar carry `hidden` in `newtab.html`, with
`display: none` supplied by the shared visibility utility. The application
controller applies the hydrated preferences before revealing enabled panels;
disabled panels are never painted during the asynchronous startup work.

Store transitions are coordinated by `app/appController.js`. It translates
immutable state-reference changes into theme, localization, grid-render and
edit-mode effects without containing domain rules. The deterministic change
classification lives in `app/appStateChanges.js`, making the routing contract
testable without a DOM or Chrome API. Feature commands remain the only place
that decides how bookmarks, folders, workspaces, the recycle bin or widgets
change.

Window resizing defaults to `WINDOW_RESIZE_MODES.RELATIVE` (Keep bookmark size)
both in settings defaults and when normalizing missing or invalid preferences.
The radio group places it first. Valid persisted `fit` and `relative` values are
preserved; no data migration or schema change is needed for this default.

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
remain stable, while `features/search/search.css` now sits beside the controller
that owns them. This does not alter the DOM, styling, keyboard shortcut or
persisted data contracts. Unit tests protect the query behavior and the existing
Playwright journeys protect both search surfaces.

## Bookmark editor feature boundary

The common appearance experience lives in `features/item-editor`: its looks,
reset behavior, content grouping and preview styling know about bookmarks,
folders and the recycle bin. It is composed by each item editor and is not a
generic Shared UI primitive. `shared/ui` still owns color pickers, tabs,
lockable inputs and modal coordination. Project-health tests protect this
ownership and follow domain imports transitively to keep runtime adapters out.
Image controls use `shared/ui/animatedDisclosure` for reversible height and
opacity transitions. The summary retains native keyboard activation, hidden
controls become inert, and reduced-motion preferences bypass animation.

The complete bookmark editing flow is owned by `features/bookmarks`: its modal
coordinates create, edit and preset use cases; the reusable editor panel owns
draft validation and lifecycle; and the editor plus preview keep form state and
the production bookmark card synchronized. The application bootstrap, bookmark
actions, keyboard navigation, folder modal and Settings import that feature
entry point directly. The generic modal index is no longer a registry for the
bookmark editor.

Reusable tabs, modal management, alerts, local-image input controllers and
viewport policy live in `shared/ui`; grid selection, drag/resize and keyboard
movement belong to the Grid feature. Existing HTML templates, CSS, persistence
and bookmark draft contracts are unchanged.

## Folder feature boundary

The folder capability is owned by `features/folders`. Store-backed membership
and layout commands, the GridItem adapter, card and action rendering, shared
folder visual, create/edit modal and compact folder workspace now form one
vertical slice. The application bootstrap composes its controller and modals
directly, and the generic modal index no longer exposes folder-specific entry
points.

The folder slice consumes the Grid feature for top-level layout, drag/resize,
selection and keyboard behavior. Bookmark presentation remains owned by the
Bookmark feature, folder compact rows remain owned by Folders, and generic
action-button, modal, tab and local-image primitives come from `shared/ui`.
Its modal also invokes the bookmark editor through the bookmark feature entry
point. Moving these modules changes neither folder data, internal 6 × 3 layout,
HTML templates, CSS nor keyboard behavior.

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

Editors use a separate, unsaved history through `shared/ui/editorHistory.js`
and the pure `shared/data/draftHistory.js`. Complete draft snapshots restore
coupled appearance fields together; repeated input gestures share a step and
the history keeps up to 100 steps per editor session. Header SVG buttons and
Ctrl/Cmd + Z / Shift + Z share this history and translated flash feedback.
Text inputs retain native keyboard undo; their input events reconcile the
button stacks and report the same feedback. After a button restores text,
keyboard undo follows the draft stack until new typing starts a native edit.
Restoring refreshes open color pickers without
creating another edit. Reopening resets the draft history, new edits discard
redo, and active or suspended modals block workspace keyboard undo. Drafts and
their history are never persisted by these controls; Save remains the commit
boundary for bookmarks, folders, recycle-bin appearance and clock configuration.
Store refreshes compare JSON data by value through `shared/data/valuesEqual.js`,
so reordered object properties cannot clear workspace history; array order and
real field changes remain significant.

## GridItem and the item-type registry

`GridItem` is a structural contract: `id`, `gx`, `gy`, `w`, `h` and `groupId`.
Bookmarks, folders and the recycle bin satisfy it. Their type is supplied by a
feature adapter rather than persisted on every item. Widget instances additionally
persist their bundled widget `type` in their own envelope.

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
features/recycle-bin/recycleBinActions.js → state/appStore.js
             ↓
domain/recycle-bin/recycleBinEntries.js

state/appStore.js
     ↓
platform/storage/storageFacade.js
     ↓
platform/storage/deviceTrashStorage.js → chrome.storage.local
```

The domain module receives plain data and returns new data. It does not read
the store, DOM, clock, random ids or Chrome APIs. Feature actions decide when a
command happens, create ids and timestamps, and commit one store transition so
undo behavior remains unchanged. The platform adapter owns device-local
recycle-bin contents. They are omitted from the shared Sync payload and can
restore supported deleted items.

## Workspace as a domain entity

Persisted workspaces remain represented by `settings.bookmarkGroups` and
`activeBookmarkGroupId` for backward compatibility. The explicit `Workspace`
entity owns identity, naming, normalization, active-workspace resolution and
navigation without knowing about the store or browser APIs. Feature selectors
are the adapter between those concepts and the legacy settings keys, so UI code
does not edit the persisted collections directly. This adapter boundary preserves
the persisted workspace field names.

## Store, persistence and synchronization

Chrome-specific persistence is now behind a platform boundary:

```text
UI / feature commands
        ↓
state/appStore.js (live state, subscriptions and persistence queue)
        ↓
state/gridHistory.js (bounded transient undo/redo snapshots)
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

`state/appStore.js` retains live state, subscriptions, undo/redo and the ordered
persistence queue. It depends on the facade, but does not know Chrome keys,
callbacks, quotas, chunks or sync wire format. The facade owns local/sync mode,
compatibility fallback and Chrome change events. The sync module is pure: it
encodes and decodes the existing versioned chunk format and can be tested
without browser globals. Public schema 2 retains the generic `widgets`
collection introduced in schema 1 and adds nested folders and recoverable folder
trees; stored/imported normalization and migrations remain together under
`platform/storage`. Visual components continue to call feature actions rather
than the storage facade directly.

Storage notifications are buffered before hydration. Refreshes run one at a time,
discard snapshots invalidated by newer events or local edits, and retry transient
read errors with bounded delays. Focus and visibility restoration reconcile Sync
without polling. Initial hydration uses the same retry delays. Normal Sync
metadata checks read only the transport header; legacy or incomplete payloads
fall back to inspecting all owned keys.

Sync reads capture the header and chunks together and confirm that the header
has not changed before accepting the result. New writes include an optional
payload checksum so readers reject mixed generations even if their combined JSON
is valid. Older payloads without a checksum remain readable, and the wire format
version stays at 1.

The destructive General-settings reset is explicitly device-local. In Local
mode it replaces persisted app data with an empty default state; in Sync mode
it first switches the device to Local using that empty state. It then clears
device trash, personal wallpapers, image selections and every owned local-image
and local-video file. It never
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
it needs. A creatable definition also supplies catalog metadata and
`create({ onCancel })`; the generic widget catalog turns those fields into its
picker UI and provides the return navigation when creation is abandoned. An
optional `catalog.statusKey` shows a translated development-tool tooltip
and accessible status without changing the widget's saved configuration. A definition may expose
`initialize({ modalHost })` to mount widget-owned support surfaces, such as an
editor, exactly once. Registration and initialization are synchronous
local-module composition and are compatible with Manifest V3 CSP; no code is
downloaded or evaluated.

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
widget lifecycle; it does not import the clock. `widgets/widgetCatalog.js`
renders every creatable registry definition behind the single static “Widgets”
launcher entry. The clock owns only its settings modal and creation command, so
adding another bundled widget requires no widget-specific bootstrap code,
launcher button or static modal markup.
Creation, configuration updates and removal use `widgetActions`; the clock opts
into the shared drag/resize controller with `kind: 'widget'`. Its visible time
is transient DOM state aligned to the next second or minute and never produces
store writes. Only its versioned configuration and grid rectangle are persisted.
The widget owns config normalization, grid/list rendering and its settings
surface without adding clock branches to the generic renderer, store or storage
facade. It participates in local/sync persistence, backups, selection,
cross-workspace movement, keyboard navigation and collision handling through
the existing contracts. Remote executable plugins remain out of scope.

## Historical refactoring milestones

This list records intermediate steps that led to the current boundaries. It is
not a future roadmap or a description of every current behavior. For example,
the initial widget scaffold preceded the visible clock, and user-facing widget
deletion now follows the permanent-removal policy documented above.

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
    its own editor without widget-specific bootstrap imports or static modal
    markup.
18. ✅ Retire the transitional `ui/` directory by assigning application-shell,
    launcher, shortcut, backup and bookmark presentation code to explicit owners
    and extracting only proven cross-feature UI primitives.
19. ✅ Begin retiring transitional `core/`: move persisted grid-interaction
    contracts to `domain/settings`, manifest metadata to `platform/browser` and
    page-theme effects to `shared/ui`; keep only state, composed defaults and
    diagnostics deferred there.
20. ✅ Extract observability from `core/`: keep reusable bounded tracing under
    `shared/diagnostics`, compose browser/store reports at the application
    boundary and leave state-specific trace labels private to the store.
21. ✅ Retire the defaults aggregator: keep entity and settings defaults in
    their domains, compose isolated persisted values at the storage boundary and
    leave `store.js` as the only transitional `core/` module.
22. ✅ Retire transitional `core/`: move the live orchestrator to
    `state/appStore.js`, extract tested grid history and diagnostic change
    classification, and update every consumer without a compatibility re-export.
23. ✅ Establish the stylesheet boundary: move the single entry, reset, tokens,
    document canvas and global utilities to `styles/`, and protect the complete
    CSS import graph against missing files, cycles and orphan stylesheets.
24. ✅ Colocate shared visual infrastructure and grid structure with their
    `shared/ui` and `features/grid` owners.
25. ✅ Colocate bookmark, folder, search, recycle-bin and workspace styles with
    their vertical feature slices.
26. ✅ Colocate Settings, launcher and bundled-widget styles, then remove the
    empty transitional `css/` directory.
27. ✅ Lift the architectural directories out of the temporary `js/` wrapper,
    audit selectors and documentation, then run the complete browser,
    unpacked-extension and store-package verification.

Future structural changes should use lint, unit and DOM tests, relevant E2E
journeys and the unpacked-extension smoke/package checks described in the
[development guide](../development/DEVELOPMENT.md).

## Existing implementation details

The remaining sections describe the current behavior that future evolution must
preserve.

```text
Reusable UI components and renderers
        ↓
Feature actions and selectors
        ↓
Domain models + state/appStore.js
        ↓
Browser persistence
```

## Domain and application state

`src/domain/bookmarks/bookmarkModel.js` owns bookmark drafts, presets,
normalization and validation. `src/domain/folders/folderModel.js` owns the
equivalent folder rules, including its name contract. Their functions do not
read global state, making them deterministic.

`src/platform/storage/dataSchema.js` is the boundary for stored,
synchronized and imported data. `schemaVersion` changes only when a persisted
shape changes; `schemaVersion.js` currently exports `DATA_SCHEMA_VERSION = 2`.
Release 1.1.0 migrates public schema 1 data from releases 1.0.0 and 1.0.1, adding
nullable `BookmarkFolder.parentId` and the descendant `folders` collection in
`FolderTrashEntry`. Public schema 2 is distinct from the discarded pre-release
development schema numbers 2–21, which are unsupported snapshots. New profiles
start with empty bookmark, folder and widget collections. Unversioned input is
normalized before entering the store; versioned data above the supported schema
is rejected.

The current schema retains the folder appearance controls from schema 1:
`outerBackgroundColor` is a nullable
hex color, where null retains the automatic tile gradient. `showPreviews` and
`showName` default to true. The legacy `showFolder` field is normalized to true,
including imports and restores: the folder silhouette is always visible.
Folder category symbols stay centered inside the folder silhouette and replace
bookmark previews. Their nullable `iconColor` selects automatic contrast when
unset. The recycle bin always uses its shared SVG, with an open lid in its modal
and on hover, keyboard navigation or a valid drop target. Its `animateIcon`
preference disables interaction animation without hiding the glyph. Its obsolete
`iconId` and `showIcon` fields are ignored;
`settings.showRecycleBin` controls workspace visibility. Legacy `showCount`
values are ignored: item counts appear inside the open folder or recycle bin.

It also retains the five configurable keyboard shortcuts under
`settings.keyboardShortcuts`. Missing, invalid or conflicting values fall back
to the safe default combinations.

`features/bookmarks/bookmarkActions.js`, `features/folders/folderActions.js`,
`features/grid/gridItemActions.js` and `features/workspaces/workspaceActions.js`
implement store-backed application commands. Batch operations make one store
transition, so undo treats them as a single user action. Workspace UI reads the
legacy persisted fields only through `workspaceSelectors.js`.

`src/domain/settings/gridInteractionModes.js` owns the persisted drag and
resize contracts and normalizes missing or unknown values to safe defaults.
`src/platform/browser/browserCapabilities.js` keeps browser detection out of
Settings and only enables synchronized storage for tested, branded Google
Chrome environments.

`src/state/appStore.js` owns live state, subscriptions and the persistence
queue. `src/state/gridHistory.js` owns bounded grid-content undo/redo
snapshots, while `stateChangeDescription.js` classifies diagnostic labels. A
history snapshot contains bookmarks, folders, widgets, recycle-bin appearance
and trash together. Synchronization settings are deliberately excluded from
undo, preventing a shortcut from changing where data is stored.

## Folder invariants

Folders are independent entities in `data.folders`. They have an id, name,
workspace, timestamps and a resizable `gx`, `gy`, `w`, `h` grid rectangle. New
folders start at `1 × 1`. Bookmark membership is represented by nullable
`bookmark.folderId`; folder membership uses nullable `folder.parentId`. A null
parent places the folder on its workspace desktop. `folderTree.js` identifies
complete descendant trees and roots for commands, while `folderContents.js`
provides mixed reading order, bounded pages, ancestor navigation and paths.

The schema and commands enforce these rules:

* A folder and its bookmarks always belong to the same workspace.
* Folders can contain subfolders through `parentId`; cycles and cross-workspace
  references are repaired during normalization.
* Contained bookmarks and subfolders do not reserve desktop grid space.
* A top-level folder reserves its complete `w × h` rectangle.
* Folder membership has no fixed item cap. The 3-row × 6-column editing grid is
  used for small collections; larger folders and subfolder navigation use search
  and compact pages of 54 items, limiting DOM work independently of collection size.
* Contained bookmarks occupy one local cell while preserving their main-grid
  `w × h` size for a later removal.
* Moving onto an occupied local cell swaps both bookmark positions atomically.
* Removing a bookmark requires a free area matching its saved `w × h` size.
* Deleting a folder retains its complete descendant tree as one recoverable
  recycle-bin entry in the same state change: the root is `entry.folder`,
  descendants are `entry.folders`, and all contained links are `entry.bookmarks`.
  Duplicate, move and restore commands preserve the tree; copies use new ids
  and restoration remaps ids that collide with live entities.
* Moving a folder to the recycle bin requires confirmation only when the folder
  or any descendant contains bookmarks. A complete tree with no bookmarks,
  including empty subfolders, can be recycled without confirmation. Permanent
  deletion retains its confirmation for every folder tree.
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
appearance, with Library as the first tab, selected and focused. Users can choose
a saved preset there or switch to Style to customize it. The settings tab owns
only the button and draft preset; it does not embed a second editor implementation.

## Grid interaction

`features/grid/gridPointerController.js` is the shared pointer controller for
registered grid items. It owns drag gesture thresholds, folder drop targeting,
eight-direction resize handles, previews and atomic commits through
`updateGridItemsByIds()`. Resize geometry lives in the pure
`shared/grid/resizeGeometry.js` module. An invalid gesture restores the original
rectangle, not the last valid intermediate preview.
Dragging stays aligned to grid cells, including rejected targets. The dragged
card stays above occupied cells with red feedback and preserves its own
appearance, including transparency. Underlying cards remain visible and
stationary. Releasing an invalid drop returns the dragged card smoothly to its
original cell, keeping it above its neighbors throughout that return.
Leaving a folder or trash landing pose
revalidates the cell even when its snapped coordinates have not changed.

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
grid item in edit mode when keyboard grid navigation is not active. It discovers
bookmarks, folders and widgets through the registry. None mode scans to the next
free rectangle. Bookmark movement limits displacement to top-level bookmarks,
so it skips fixed folder rectangles; folder and widget movement use the broader
movable-item set while the recycle bin stays fixed. All affected positions use
one state transition and therefore one undo entry.

## Persistence

Local mode uses `chrome.storage.local`. Sync mode serializes the versioned shared
representation, omitting device-only data, into quota-safe `chrome.storage.sync` chunks.
The local storage-mode choice remains device-specific.

Custom keyboard shortcuts live inside the versioned `settings` object and follow
the same migration, backup and Sync paths as portable visual preferences.
The persistence-mode choice, recycle-bin contents, local media, personal
wallpaper collections, device image selections, scroll positions and introductory
notice preferences remain device-specific. Complete backups include the supported
workspace data, referenced media and the daily-tip enabled/disabled preference,
not every device-only preference.

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

Complete backups without local videos use the `newdesktab-backup` JSON format;
bookmark-only files use `newdesktab-bookmarks`. Both preserve folders and membership.
When referenced local videos exist, Settings exports a ZIP whose `backup.json`
manifest uses `newdesktab-backup-zip`, archive version 1. Its `backup` property
contains the existing JSON envelope and optimized local images; its `videos`
map links local references to binary `videos/<number>.<extension>` entries,
MIME types and original filenames. Video URLs alone do not switch the format.

The complete JSON envelope, including the one nested in a ZIP, optionally carries
`devicePreferences.dailyTipsEnabled`. Import validates this boolean and restores
it through device-local storage after application-data persistence. Older backups
without the flag retain the current choice. Daily-tip history and the last offered
day stay out of backups; neither the flag nor history enters application data or
Chrome Sync.

`platform/backup/backupArchive.js` owns this container. Videos use ZIP STORE and
256 KiB streams rather than base64. Blob output is browser managed; no entire
video is read into a JavaScript array or string. Import bounds both declared and
actual decoded bytes, verifies CRCs and archive structure, and validates every
video before any persistence operation. Entries are read sequentially. Local
video storage accepts the resulting Blobs directly; legacy JSON video decoding
remains available. Legacy raw bookmark arrays remain importable without folders.

`platform/images/localImages.js` cleans unavailable image references on a cloned
import/export snapshot. It refreshes referenced storage entries and evicts stale
image/name caches, retains available files and URL fallbacks, and drops unusable
personal image wallpapers. Complete JSON/ZIP imports restore provided images
before cleanup; absent image entries are skipped, while invalid provided image
data still rejects the import. Bookmark-only imports never presume that a file
exists just because its reference is well formed. Device selection and wallpaper
restoration persist cleanup in `chrome.storage.local`, leaving the shared Sync
payload and the sender's own files untouched.

The locally shipped zip.js core is generated from pinned development dependencies
with `npm run vendor:zip`. Its BSD license is shipped beside the bundle. The
runtime disables workers and uses no external code or WASM. The
[zip.js documentation](https://gildas-lormeau.github.io/zip.js/) describes its stream
and ZIP64 support. Manifest V3 ZIP export/restore is exercised by the extension
smoke check.

The store retains the base of failed optimistic writes until a commit succeeds.
Later writes include those unsaved changes; storage refreshes merge them with
incoming data instead of replacing them. Save and import controllers call
`requirePersistence()` before announcing success. Item editors retain failed
drafts, and create flows reuse the pending record's id when retrying.

## Native and HTML bookmark import

Browser import appends to Main (`groupId: null`) and activates that workspace.
It is separate from the existing DeskTab bookmark JSON import and complete
JSON/ZIP restore flows. `features/bookmarks/browserBookmarkImport.js` owns the
Chrome adapter and persistence transaction:

| Entry point | Contract |
| --- | --- |
| `detectChromeBookmarks()` | Reads `chrome.bookmarks.getTree()` and returns `{ available, tree, bookmarkCount, folderCount, skippedCount }`. It never edits Chrome bookmarks. |
| `importChromeBookmarks({ tree?, workspaceName? })` | Imports a supplied snapshot or detects one first. |
| `importBrowserBookmarksHtml(fileOrText, { workspaceName? })` | Accepts a selected File or HTML text and parses the Chrome/Netscape bookmark format. |
| `importBrowserBookmarkTree(tree, { source, workspaceName? })` | Imports a selected tree for source `chrome` or `html`. |

Successful imports return `{ bookmarkCount, folderCount, skippedCount,
duplicateCount, workspaceId: null }`. `workspaceName` labels an overflow folder;
it does not create a workspace. The service waits for outstanding writes, runs
schema normalization and Sync quota preflight, then requires persistence before
reporting success. A failed write rolls back the imported delta with
`mergeChanges()`, preserving independent concurrent edits. Both success and
rollback clear grid history so undo cannot resurrect an intermediate import.

`domain/bookmarks/browserBookmarkImport.js` validates absolute URLs against its
protocol allowlist, parses HTML with an inert `DOMParser`, and prepares the
import without mutating existing application data. It copies names, dates,
links and folder structure; exported HTML is never rendered as app markup.
The parser accepts omitted closing `DT` tags and recognizes
`PERSONAL_TOOLBAR_FOLDER` as the bookmarks bar.

Toolbar children appear directly on Main. Empty native browser roots are
omitted; other nonempty native roots remain folders. If there is no populated
toolbar and the only populated browser root contains links without subfolders,
those links are promoted directly to Main. User folders retain their hierarchy
and mixed bookmark/folder order. Imported folders start with
`noOuterBackground: true`, leaving their silhouettes visible without an outer
tile background.

New desktop entries fill free cells left to right, then top to bottom, avoiding
existing bookmarks, root folders, widgets and the visible recycle bin. Stable
source identities avoid duplicating unchanged entries and preserve existing
Main positions and appearance on reimport. Legacy import workspaces are moved
to Main without deleting unrelated contents. If root entries cannot all fit,
one overflow folder contains the imported roots. If no cell is available even
for that folder, `MAIN_WORKSPACE_FULL` aborts preparation before mutation.

`domain/bookmarks/browserBookmarkSelection.js` indexes the detected tree once.
It exposes creation, subtree/all selection, tri-state checkbox state, selected
counts and `filterSelectedBrowserBookmarks()`. Empty branches stay visible and
start unselected; selecting them explicitly, their parent or Select all can
include them. Filtering retains required ancestors and the original mixed order.
Detected and selected folder counts exclude browser-provided root containers
recognized by native root IDs or `folderType`, only at the root level. Their
descendants still count, and the roots remain in the tree so import identity and
hierarchy are preserved. Counts returned after saving describe folders actually
created by import preparation, which may retain a populated Other bookmarks root.
The nonpersisted `BROWSER_BOOKMARK_SOURCE` symbol carries sibling index and
occurrence metadata so partial reimports retain stable source identities.

`features/bookmarks/browserBookmarkImportUI.js` shares one dialog between the
first welcome and Settings. Its expandable preview supports search, selection,
empty-folder badges, favicon previews and 100-row increments. Import first
opens the shared confirmation alert. Cancellation retains the selection;
persisted success closes the dialog and emits translated flashes with imported,
skipped and duplicate counts. Errors leave the dialog available for retry.
Selection initialization expands the bookmarks-bar root once for native and
recognized HTML imports. Later rendering does not reopen a manually collapsed
folder. The show/hide disclosure is styled separately from the bulk selection
buttons. Busy progress stays in the import button; the status block is reserved
for errors and results instead of adding a redundant loading message.
`shared/ui/flash.js` accepts translation variables through
`flash(message, type = 'info', duration = 3000, params = {})`; its `flashSuccess`,
`flashError` and `flashInfo` helpers accept `(message, duration, params)`.

The manifest declares `bookmarks` for native tree access and `unlimitedStorage`
for large Local collections, alongside `storage` and `activeTab`. It retains the
favicon host permission `https://t3.gstatic.com/*`. `unlimitedStorage` does not
raise Chrome Sync's approximately 100 KB total quota; an oversized synchronized
import fails before committing and asks the user to use Local mode.

## UI coordination

Modal controllers translate user actions into feature or application-state
commands. Recycle-bin modals call their colocated feature actions. The
modal manager owns stacking, focus trapping, background isolation and focus
restoration.

The renderer displays the active workspace's registered grid items, including
top-level bookmarks, folders, the visible recycle bin and bundled widgets.
`features/onboarding/` owns a five-step optional welcome and its illustrative
workspace, with live localization and the existing modal focus lifecycle. Its
inert desktop preview reuses the production bookmark, folder and recycle-bin
visuals with bundled example icons; it never adds items or fetches site favicons.
It starts with the shared default wallpaper palette and installed version, then
fades to a bundled example wallpaper for the settings step and the final screen.
The settings illustration uses a scoped colorful layout of one-by-one,
two-by-one and one-by-two cards, with a clock in the grid and a bundled landscape
inside the shared Multimedia folder artwork. Icons and captions keep the main
grid's vertical alignment. These shapes and colors remain
preview-only; the guide explains Chrome profile synchronization there.

Bookmark favicon candidates are computed in `features/bookmarks/faviconOrigins.js`
with a locally bundled public-suffix parser. Missing icons try parent origins down
to the registrable domain; the navigation URL remains intact. `platform/images/faviconService.js`
checks HTTP status with cached, cookie-free HEAD requests to `t3.gstatic.com`,
using a host permission limited to that provider. This detects decoded generic
404 images as well as normal image errors. Unreadable status preserves a loaded
image; exhausted candidates use the existing initials fallback.
The opening step loops a cursor demonstration over an inert copy of the real launcher,
using its shared component styles and localized labels. The edit step activates its
pencil, reveals the shared grid pattern, moves the example Gmail to a free cell and
resizes it with the production corner handles, then returns to the edit toggle and
turns editing off. The cursor disappears and the changed result remains visible for
two seconds before fading back to the initial layout. The organize step opens the
Multimedia example, showing the real neutral contents palette and six-by-three grid.
It enables folder editing, moves YouTube to a free cell and disables editing before
holding the result and closing. The nested surface stays inert and never registers
a modal or calls application actions; localized control widths are measured again
when the language changes.
The final step starts with the clean desktop, deletes YouTube by dragging it to
the recycle bin in edit mode, restores it using Undo, and types a query in an
inert search surface using the real modal and results classes. It holds the
filtered result, clicks Close, then fades the search surface and its backdrop
together while the restored desktop stays visible for the next loop. Toolbar states and the query
belong only to this preview; no search, history or trash action runs in the app.
Each sequence synchronizes pointer, clicks and demo states on one clock, fading
before resetting. Responsive geometry is measured inside the preview;
demonstrations stop when hidden or on another step. Reduced-motion mode shows
static examples, including the filtered search result. The
application supplies the action that opens the first-bookmark editor. Settings →
Help contains the manual search, guide replay and daily-tip preference. It can
reopen the guide over a settings draft without discarding it. Information keeps
the project details and release history.
`platform/storage/deviceOnboarding.js` atomically claims the first welcome with
a Web Lock and stores offered/completed/dismissed status in a device-only key;
it never enters application data, Chrome Sync or backups. This optional storage
read does not block startup. At widths of 600px or less, release notes, the guide,
the manual and daily tips stay hidden, with a flash asking the user to widen the
window. Pending introductions remain unclaimed and suspended panels resume when
there is enough space. Arrival follows release notes and the optional guide.
Only the first guide starts native bookmark detection; its completion or dismissal
can offer the import dialog when links are detected. Replaying the guide does
not offer it again. Daily tips wait until the modal stack is available and appear
in the bottom-right corner.
Its **Turn off daily tips** button immediately saves the device-local preference
and closes the card; a saved-settings success flash appears after persistence
completes. The Help toggle reflects the same value and can re-enable it. The
manual action is aligned at the card's lower right beside the disable control.

`features/folders/folderAppearance.js` applies saved appearance to cards, artwork,
previews and open contents without accessing the store. The contents surface is
neutral gray in the active light or dark interface theme: `noBackground` enables
a matching gray veil, local blur and a faint neutral border. Otherwise,
`backgroundColor` accents only the outer border. Accent borders are adjusted to
stay visible while retaining their hue. `noOuterBackground` and
`outerBackgroundColor` remain launcher-card settings. Display contrast is derived
without changing saved folder or bookmark colors. Browsing and editing share the
same contents surface and geometry.
`shared/ui/surfaceContrast.js` derives foreground, secondary text and control
states from the neutral contents surface, targeting 4.5:1 text contrast and 3:1 control
boundaries. Paired colors use `light-dark()` so explicit and system theme changes
update open folders and tutorial previews immediately. Transparent contents use
the darkest light veil or brightest dark veil as their contrast baseline, so any
wallpaper stays readable. Grid lines remain neutral, decorative and intentionally
faint within each theme, independently of the saved color or transparency.
`features/folders/folderCard.js` owns the folder card and previews, while
`features/folders/folderModal.js` chooses the presentation from the contents.
Small collections without subfolders use the production bookmark renderer in
a 3 × 6 editing grid. Larger collections, nested folders, searches and compact
viewports use a mixed list with at most `FOLDER_PAGE_SIZE = 54` entries per page.
`getFolderContentsPage()` returns the normalized layout, total and match counts,
clamped page and page count. Breadcrumbs and Back navigate the same modal;
the scroll shell and breadcrumbs reuse the shared `custom-scrollbar` styling.
There is no fixed membership limit.

The modal starts in browsing mode. Its local edit mode, toggled by the header
control or the configured edit shortcut (`E` by default), re-renders controls.
In the small grid it enables a pointer controller that previews empty-cell
moves and occupied-cell displacement through the same
`calculateSmartDragLayout()` modes as the main grid. Preview positions are
rendered as smooth transforms from each item's persisted cell; on release the
transform remains visible until
`updateFolderBookmarkPositions()` atomically commits that exact layout, avoiding
a source/destination flash. `src/domain/folders/folderGrid.js` owns the pure
local layout contract and normalizes legacy or colliding positions
deterministically. Main-grid bookmark drag logic detects folder hit targets and
delegates membership changes to the folder feature actions.
In the compact list, edit mode provides row selection and aligned Edit, Delete
and Move out actions. The selected-row toolbar moves an entry up or down;
`Alt+ArrowUp` and `Alt+ArrowDown` provide the same action from a focused row.
`moveFolderEntry(folderId, itemId, direction)` accepts `-1` or `1`, swaps adjacent
bookmark/subfolder positions in one undoable state change and returns
`{ moved, index? }`. The UI awaits persistence, disables pending reorder controls,
clears search and reveals the selected entry's resulting page. Moving a
subfolder out places its intact tree on the workspace desktop when space allows.
Clicking the contents title once starts inline renaming in the current surface;
Enter or the confirmation control saves, and Escape or Cancel restores the name.

`features/search/searchModal.js` indexes all workspaces and contained bookmarks,
showing folder context when present. `features/search/listSearch.js` filters the
already-rendered compact view without changing saved data. Selection is pruned
when bookmarks disappear and is cleared when edit mode closes.

The grid's saved X/Y scroll positions are owned by
`platform/storage/deviceGridScroll.js` and keyed by workspace in browser-local
storage. They stay outside the persisted application payload, Sync and backups.
Grid layout restores and clamps them when entering preserved-size mode; absent
positions retain the centered default.
Saved offsets also retain each axis's scroll range, allowing resize to preserve
the viewport's offset from the canvas center without overwriting a clamped pan.

`features/workspaces/workspaceToolbar.js` owns cyclic workspace navigation.
`Ctrl` with the up or down arrow resolves the adjacent workspace through
the workspace domain and feature selectors,
animates the current grid out and the next grid in, and skips the transition
when the operating system requests reduced motion. Shortcuts are ignored while
typing or while a modal is open.
In preserved-size mode, transitions animate opacity only. The outgoing fade
stays hidden until the latest tracked asynchronous grid render finishes, so the
incoming DOM and its device-local viewport are ready before the fade starts.

The workspace navigation handler runs during event capture so focused dock
controls cannot consume its arrow keys. Adding Control to the configured
Settings shortcut opens the active workspace's editor when that combination is
available; explicitly assigned shortcuts retain priority.

The `showLauncher` and `showWorkspaceToolbar` settings control each dock's
visibility independently. The settings draft owns these preferences until Save,
and `appController` applies their `hidden` attributes when settings change.
Keyboard actions remain available while docks are hidden. Hiding the launcher
requires an assigned Settings shortcut so the preferences remain reachable.

## Verification

The project has four complementary checks:

1. ESLint for static mistakes and undefined/unused symbols.
2. Node tests for domain, schemas, storage and history.
3. Vitest/jsdom for editor and modal lifecycles.
4. Playwright journeys plus an optional unpacked-extension smoke test.

Project-health tests also protect the source boundaries, import graphs and
literal DOM id contracts used by JavaScript and CSS. This keeps path and
selector drift visible before browser journeys run.

The Playwright harness and Store artwork generator use
`scripts/lib/staticServer.mjs`, with a loopback listener, explicit MIME types,
uncached responses and no directory listing. The test server requires Node only;
Python remains an explicit dependency of Store ZIP packaging. ESLint includes
the Node tooling scripts as well as runtime and test modules.

## Publication hardening: command and module ownership

`features/persistence/persistedAction.js` owns durable UI command feedback.
Bulk commands, recycle-bin actions, workspace deletion, item removal and history
controls announce success only after the store confirms the write. A failed
command retains its result and retries persistence without executing its mutation
again. Each acknowledgement belongs to its own command, including concurrent
commands. The persistent retry control follows the active modal through the
generic `subscribeModalChanges` lifecycle, preserving its accessibility and
focus boundary. Unannounced writes such as pointer movement also expose a retry
when storage fails.

The storage facade composes `storageIO` for local/sync representations,
`storageCoordination` for device locks and notifications, and `storageUsage`
for quota measurement. `concurrentPlacement` handles collisions between new
items committed by different tabs. These modules keep the existing `storage`
API and persisted schema unchanged.

Theme settings compose `wallpaperLibrary`, `wallpaperFiles` and
`wallpaperPreview`. The section retains draft orchestration; file tracking and
cleanup, list editing and video readiness belong to their individual controllers.

Grid pointer controls compose `gridDragSession` for movement planning and
preview ownership, `gridResizeGesture` for resize lifecycle,
`gridPointerGeometry` for visual coordinates, and `gridGestureState` for the
single active gesture. Placement algorithms remain in `shared/grid`.
The cursor chooses the logical grid cell, including the gaps between cards, and
preserves the grabbed cell within larger items. Folder and recycle-bin landing
feedback requires the cursor to enter their actual card bounds or, for the bin,
one of its visible resize handles. Handle bounds are cached at drag start. An overlapping
snap outside those bounds retains the last valid layout. A 2px margin at grid
junctions retains the previous destination until the cursor makes a clear choice.
Edit controls and
Shift-middle-click share `gridItemRemoval` for confirmed, persisted recycling of
bookmarks and folders. Trash rows include the deletion date for both types.

Large-backup measurements run separately from the test suite using
`scripts/benchmark-backups.mjs`; see
[the methodology and format decision](../benchmarks/BACKUP_MEDIA.md).
