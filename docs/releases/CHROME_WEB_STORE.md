# Chrome Web Store submission

[Documentation index](../README.md) · [Development](../development/DEVELOPMENT.md) · [Release review](RELEASE_REVIEW.md)

New DeskTab is published on the [Chrome Web Store](https://chromewebstore.google.com/detail/new-desktab/inafkeeciknpocbamagdmdnbbfmpdlmp).
Use this guide when preparing subsequent Store updates.

This file is the source of truth for the NewDeskTab listing and privacy answers.
Review it against the release ZIP before every submission.

Published release: `1.1.2`. Minimum browser engine: Chrome/Chromium `123`.

Public data schema: `2`, adding nested folders and recoverable folder trees.
Public schema `1` is migrated on load. Pre-release development snapshots are not
supported migration sources. For first-use testing,
load the extracted ZIP in a new browser profile with empty extension storage
and Sync disabled. An existing development profile is not a clean install.

The first arrival shows local release notes, then the optional guide, then an
import offer if native Chrome bookmarks exist, followed by the daily tip when
enabled. The notes and guide stay hidden in list mode (600px or less).
The release history is available from Information. Help contains the manual,
quick guide and daily-tip preference.
See [RELEASE_NOTES.md](RELEASE_NOTES.md) when preparing the notes for a new version.

## Listing

- Product name: `New DeskTab`
- Primary language: `English`
- Category: `Productivity`
- Homepage: `https://github.com/Alextc35/newdesktab`
- Support URL: `https://github.com/Alextc35/newdesktab/issues`
- Privacy policy: `https://github.com/Alextc35/newdesktab/blob/main/PRIVACY.md`

### Summary

> A customizable new tab with editable bookmarks

### Detailed description

> NewDeskTab replaces Chrome's New Tab page with a private, customizable visual
> workspace for your bookmarks.
>
> Arrange bookmarks and folders on a flexible grid, resize and style cards,
> switch between independent workspaces, search across saved items, and create
> reusable appearance presets. Import and export bookmarks or create a complete
> local backup whenever you need one.
>
> Bring your native Chrome bookmarks or select an exported HTML bookmark file.
> Preview and select links and folders before importing them into Main. Toolbar
> items appear directly on the desktop, and other bookmark locations retain
> useful folders. Browse large collections with nested folders, search,
> breadcrumbs, paged lists and controls to reorder entries.
>
> Choose bundled category icons instead of website favicons or the original
> folder and recycle-bin artwork. Search for everyday symbols and geometric shapes,
> with local suggestions for common uses. Reuse them in presets and your default bookmark style.
>
> Data is stored locally by default. Optional Chrome Sync uses browser-managed
> storage so Google Chrome profiles can share bookmark data and settings. Brave
> uses Local mode. Images and videos uploaded from your device remain local to
> that browser profile. Complete
> backups you explicitly export include optimized copies of referenced local images
> and the referenced local video files.
>
> NewDeskTab has no account system, advertising, analytics, telemetry, or
> developer-operated backend.

## Privacy answers

### Single purpose

> Replace Chrome's New Tab page with a customizable visual workspace for
> organizing and opening bookmarks supplied by the user.

### Permission justification: storage

> The storage permission saves the user's bookmarks, folders, workspaces,
> layout, appearance settings, optional local images, and synchronization
> preference. When the user explicitly enables Sync, browser-managed
> chrome.storage.sync stores the shareable workspace data; local image files
> and filenames remain in chrome.storage.local. Complete backups include copies
> of referenced local images and videos only when you explicitly export them;
> local videos are stored separately in IndexedDB.

### Permission justification: activeTab

> When the user clicks the extension's toolbar button, the quick-save popup reads
> that active tab's title and URL to prefill a bookmark. It does not read page
> contents, access general browsing history or close the source tab.

### Permission justification: bookmarks

> Read the native Chrome bookmark tree to detect existing bookmarks after the
> first welcome guide and offer an import. Explicit imports are also available
> in Settings. Imported names, URLs, folders and their order are copied into a
> Main workspace alongside existing bookmarks. Users can select individual
> links or folders before importing. Native bookmarks are never edited or deleted.

Empty folders are visible in the selector and initially unchecked. The offer is
part of the first welcome sequence; repeating the guide does not repeat it.
Settings provides explicit imports at any time.

### Permission justification: unlimitedStorage

> Large bookmark libraries can exceed the default extension local-storage
> allowance. This permission lets imported collections and their local workspace
> data grow with available disk space. It does not raise Chrome Sync quotas or
> grant access to other applications' data.

### Host permission justification: https://t3.gstatic.com/*

> This host serves the website favicons already displayed by NewDeskTab. The
> extension reads favicon response status with cookie-free HEAD requests because
> a missing icon can arrive as a valid generic image with HTTP 404. It retries
> parent domains when needed, without modifying the bookmark URL or sending its
> path, query or fragment. It does not fetch the bookmarked pages themselves.

### Remote code

Select **No**. All executable JavaScript and CSS ships inside the extension ZIP.
Remote favicons and background images or videos are displayed as media and are
not executed as extension code.

### Data handling checklist

- User-entered bookmark names and URLs, workspace data and settings are stored
  by the extension to provide its single purpose.
- Files selected as local images and videos are stored locally in the browser
  profile. Complete backups explicitly exported by the user include referenced files.
- When a favicon is shown, the bookmark origin may be requested from Google's
  `t3.gstatic.com` favicon service as documented in the privacy policy.
- User-configured remote images and videos are requested directly from their hosts.
- Personal wallpaper URLs, ordering and rotation timing stay on this device;
  the separate fallback wallpaper URL can be shared through Chrome Sync.
- NewDeskTab does not read general browsing history, website page contents,
  passwords, authentication data, personal communications or location.
- NewDeskTab has no developer-operated data collection, analytics or advertising.
- Certify compliance with the Chrome Web Store Limited Use requirements.

Match the dashboard's current data-category checkboxes to these statements and
to `PRIVACY.md`; do not claim that locally processed data is outside the policy.

## Listing images

- `assets/icons/icon-128.png` (product logo)
- `assets/store/screenshot-1280x800.png`
- `assets/store/screenshot-folder-1280x800.png`
- `assets/store/screenshot-settings-1280x800.png`
- `assets/store/screenshot-information-1280x800.png`
- `assets/store/promo-small-440x280.png`

The four screenshots are 1280×800. The overview shows a folder with a custom
local image, a transparent folder with a cloud symbol, and a folder with bookmark
previews. The folder editor screenshot shows the image controls and live preview.

Regenerate them from the current UI with:

```sh
npm run assets:store
```

Use `npm run assets:store -- --screens-only` to refresh screenshots and the
promotional tile without regenerating the brand icons, or `--main-only` to
refresh just the overview. The captures use the real interface with local demo
data and no external image requests.

The globe-and-plus logo comes from `assets/icons/brand-mark.svg`. The same command
regenerates the transparent 48px and 128px extension icons, the 512px PNG/WebP
logos, and the Store images. Edit the SVG first so every use stays consistent.
Its cropped viewBox leaves only a small transparent margin around the mark.

## Release procedure

1. Run `npm run check`.
   Run `npm audit --audit-level=high` as well; dependencies stay outside the
   extension ZIP, but development tooling should have no known high/critical issues.
2. Run `npm run test:e2e`.
   Also run it with Chrome for Testing 123 through `NEWDESKTAB_BROWSER_PATH`
   when verifying the declared minimum version.
3. Run `npm run assets:store` and visually inspect every generated image.
4. Run `npm run test:packaging`, then `npm run package:store`.
5. Extract `dist/newdesktab-<version>.zip` into a clean directory.
6. Run `NEWDESKTAB_EXTENSION_PATH=<clean-directory> npm run test:extension`.
7. Verify the packaged Store manifest has no `key` field. The source manifest keeps
   its public development key unchanged; `npm run package:dev` produces a separate
   `dist/newdesktab-<version>-dev.zip` that preserves it for unpacked development.
   When updating an existing Store item, confirm the target item in the dashboard.
8. Upload the ZIP and the listing images, complete the privacy answers,
   verify contact email and two-step verification, then submit for review.

Browser tests and Store screenshots use the same Node loopback server. Packaging
requires Python 3.9 or newer; if your platform calls it `python` or `py`, invoke
that interpreter with `scripts/package-extension.py` instead of the npm alias.
Before submission, verify Chrome Sync between two real browser profiles/devices
and open the unpacked ZIP in Brave. Automated tests cover data merging and browser
storage, but do not verify propagation through Google's profile service.

When running `test:extension` against installed Google Chrome 137 or newer, set
`NEWDESKTAB_EXTENSION_CDP=1` as well as `NEWDESKTAB_BROWSER_PATH` and
`NEWDESKTAB_EXTENSION_PATH`. The test loads the package through DevTools in a
fresh temporary profile. Chromium, Chrome for Testing and Brave use the default
loading path. Record the browsers and versions in `RELEASE_REVIEW.md`.
