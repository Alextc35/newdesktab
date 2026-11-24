# Product research and editorial boundaries

Research source: the New DeskTab **1.0.0** checkout reviewed on 22 November 2026.
This document records the basis of the existing promotional footage, independently
of production code. The current extension is **1.1.0**; see the
[changelog](../CHANGELOG.md) and [user guide](../docs/guide/USER_GUIDE.md) for its
Chrome/HTML import and nested-folder behavior. The versioned footage has not
been recaptured as part of that update.

## Product and architecture

New DeskTab replaces the browser's new-tab page with a visual bookmark workspace. It is a Manifest V3 extension requiring Chrome/Chromium 123 or newer. The production application uses native JavaScript modules, HTML and CSS; React and Remotion belong to this audiovisual project only.

`src/newtab.html → src/main.js → src/app/` composes the application. `src/domain/` owns model rules, `src/features/` owns user capabilities, `src/platform/` integrates browser APIs, media and storage, `src/state/` owns live state and persistence, and `src/widgets/` contains bundled widgets. See `../docs/architecture/ARCHITECTURE.md`, `../docs/architecture/PROJECT_GUIDE.md` and `../docs/development/DEVELOPMENT.md`.

## Implemented capabilities

| Capability shown in the 1.0.0 footage | Source references |
| --- | --- |
| Visual bookmark cards, pointer movement and resizing on a collision-aware grid | `../README.md`, `../docs/guide/USER_GUIDE.md` (Arrange your grid), `../src/shared/grid/`, `../src/features/bookmarks/` |
| Card colors, category icons, image covers and reusable appearance presets | `../docs/guide/USER_GUIDE.md` (Style bookmarks), `../src/domain/bookmarks/bookmarkDefaults.js`, `../src/shared/icons/iconCatalog.js` |
| Folders with compact internal bookmark grids | `../src/domain/folders/`, `../src/features/folders/`, `../docs/guide/USER_GUIDE.md` (Use folders and workspaces) |
| Independent named workspaces, with workspace appearance and backgrounds | `../src/domain/workspaces/`, `../src/features/workspaces/`, `../README.md` |
| Search across saved bookmarks | `../src/features/search/`, `../tests/searchBookmarks.test.mjs`, `../docs/guide/USER_GUIDE.md` |
| Image/video wallpapers and wallpaper rotation | `../src/platform/images/`, `../tests/wallpaperMedia.test.mjs`, `../docs/guide/USER_GUIDE.md` |
| Light, dark or system appearance; 52 interface languages | `../src/styles/base/variables.css`, `../src/lang/`, `../_locales/`, `../README.md` |
| Multiple selection, bulk changes, undo/redo and recycle bin | `../README.md`, `../src/state/gridHistory.js`, `../src/domain/recycle-bin/` |
| Quick-save popup for the current page | `../src/popup.html`, `../src/popup.js`, `../README.md` |
| Local storage by default; optional Google Chrome Sync | `../PRIVACY.md`, `../README.md`, `../src/platform/storage/` |
| New DeskTab bookmark export and complete local backups including referenced media | `../docs/guide/USER_GUIDE.md`, `../src/features/settings/backupActions.js`, `../tests/backupArchive.test.mjs` |

The strongest marketing sequence is: see favorite websites together → arrange the visual cards → customize the appearance → open a folder → switch to a separate workspace → appreciate the finished space.

## Fidelity boundaries

- The real installation starts with an empty bookmark grid. Promotional captures use authored example bookmarks to demonstrate what a user can build; they are not bundled productivity applications.
- “Inbox”, “Calendar”, “Notes”, “Tasks” and similar card labels describe links supplied by a user. The only bundled widget is a clock, documented as still in development. No native task manager, calendar or notes editor is claimed.
- The 1.0.0 footage demonstrates one level of folders. Version 1.1.0 supports
  nested folders, but the existing film does not demonstrate them.
- Search covers saved New DeskTab bookmarks, not general browser history.
- Optional Sync is provided through a Google Chrome profile. Brave uses Local mode. Uploaded images/videos remain on the device.
- No account is required. The product has no developer-operated backend or analytics. Remote favicon and wallpaper requests are documented in `../PRIVACY.md`; no claim of zero network requests is made.
- The public URL verified in `../docs/releases/CHROME_WEB_STORE.md` is **https://github.com/Alextc35/newdesktab**. No Chrome Web Store listing URL was found or invented. “Discover New DeskTab” links the audience to the repository.

## Visual identity

- Official master logo: `../assets/icons/brand-mark.svg`, a cyan/blue globe with a plus sign. Existing PNG/WebP variants are in `../assets/icons/` and `../assets/images/`.
- Official example wallpaper: `../src/assets/images/information-cosmos.png`.
- Current product references: `../assets/store/screenshot-1280x800.png`, the folder/settings/information screenshots, and `../scripts/generate-store-assets.mjs`.
- Production tokens use dark surfaces around `#111`, white labels, a dark-mode blue accent `#4da3ff`, rounded cards and glass docks. The default wallpaper combines cyan and magenta accents. The body font is Arial with system sans-serif used in cards and dialogs. Evidence: `../src/styles/base/variables.css` and feature CSS.
- The film's typography, colors, glow and camera treatment extend that identity around captured UI. The product interface is captured from the actual application rather than redrawn as a fictional mockup.

## Runtime and capture basis

The extension needs no production build. It can be loaded unpacked into Chromium, as demonstrated by `../tests/extension-smoke.mjs`. The existing `../scripts/generate-store-assets.mjs` additionally demonstrates a browser harness using the production DOM/CSS/modules with simulated Chrome storage, deterministic fixture data and no external asset dependencies. `scripts/capture.mjs` records which runtime was actually used and verifies interaction results in `output/capture-report.json`.

This document records product evidence. The export's measured metadata, audio analysis and representative inspection frames are recorded separately in `output/validation-report.json` after rendering.
