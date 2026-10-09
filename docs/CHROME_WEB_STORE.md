# Chrome Web Store submission

This file is the source of truth for the NewDeskTab listing and privacy answers.
Review it against the release ZIP before every submission.

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
> Data is stored locally by default. Optional Chrome Sync uses browser-managed
> storage so compatible Chrome profiles can share bookmark data and settings.
> Images uploaded from your device remain local to that browser profile. Complete
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

### Remote code

Select **No**. All executable JavaScript and CSS ships inside the extension ZIP.
Remote favicon and background-image responses are displayed as images and are
not executed as code.

### Data handling checklist

- User-entered bookmark names and URLs, workspace data and settings are stored
  by the extension to provide its single purpose.
- Files selected as local images and videos are stored locally in the browser
  profile. Complete backups explicitly exported by the user include referenced files.
- When a favicon is shown, the bookmark origin may be requested from Google's
  `t3.gstatic.com` favicon service as documented in the privacy policy.
- User-configured remote images are requested directly from their image hosts.
- NewDeskTab does not read general browsing history, website page contents,
  passwords, authentication data, personal communications or location.
- NewDeskTab has no developer-operated data collection, analytics or advertising.
- Certify compliance with the Chrome Web Store Limited Use requirements.

Match the dashboard's current data-category checkboxes to these statements and
to `PRIVACY.md`; do not claim that locally processed data is outside the policy.

## Required listing images

- `assets/store/screenshot-1280x800.png`
- `assets/store/screenshot-settings-1280x800.png`
- `assets/store/screenshot-information-1280x800.png`
- `assets/store/promo-small-440x280.png`

Regenerate them from the current UI with:

```sh
npm run assets:store
```

## Release procedure

1. Run `npm run check`.
   Run `npm audit --audit-level=high` as well; dependencies stay outside the
   extension ZIP, but development tooling should have no known high/critical issues.
2. Run `npm run test:e2e`.
3. Run `npm run assets:store` and visually inspect every generated image.
4. Run `npm run package:store`.
5. Extract `dist/newdesktab-<version>.zip` into a clean directory.
6. Run `NEWDESKTAB_EXTENSION_PATH=<clean-directory> npm run test:extension`.
7. Verify the manifest `key` matches the public key shown by the existing Store
   item. If this is a new item, decide the permanent extension ID before release.
8. Upload the ZIP and the listing images, complete the privacy answers,
   verify contact email and two-step verification, then submit for review.

Browser tests and Store screenshots use the same Node loopback server. Packaging
requires Python 3.9 or newer; if your platform calls it `python` or `py`, invoke
that interpreter with `scripts/package-extension.py` instead of the npm alias.
Before submission, verify Chrome Sync between two real browser profiles/devices
and open the unpacked ZIP in Brave. Automated tests cover data merging and browser
storage, but do not verify propagation through Google's profile service.
