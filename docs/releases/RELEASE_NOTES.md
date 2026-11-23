# Release notes

[Documentation index](../README.md) · [Localization](../development/LOCALIZATION.md) · [Publishing](CHROME_WEB_STORE.md)

The first eligible tab opened with a new version offers its release notes in a
modal. Each version is offered once per browser profile, including the first
installation. The 1.0.0 entry contains the author's story and thanks, six feature
highlights, and a note that the clock widget is still in development.
The 1.0.1 entry explains that JSON and ZIP backups preserve the daily-tip
preference and that each tip has a discreet button to turn off future tips.
Version 1.1.0 adds native Chrome and HTML bookmark import, nested folders, and
searchable, paged navigation for large folders without the previous 18-item cap.

## Arrival and history

- A new profile sees release notes before the welcome guide.
- Closing the notes offers the guide if this profile has not completed or skipped it.
- After the first guide, profiles with Chrome bookmarks receive an import offer.
- An enabled daily tip follows those dialogs when a tip is due. It stays at the
  bottom right. Its reading timer pauses for hover, focus, another open dialog,
  or a hidden tab.
- Each tip displays its topic's SVG and can open the related manual section.
- A discreet button on each tip disables daily tips immediately. JSON and ZIP
  backups include this preference; older backups without it keep the current choice.
- **Settings → Help** contains manual search, common questions, the quick guide,
  and the daily-tip preference.
- In list mode, at 600 pixels wide or less, release notes, the guide, manual and
  tips are hidden with a brief notice. Open dialogs are suspended until the
  window widens; introductory notices that have not been offered are not consumed.
- **Settings → Information → Release notes** opens entries up to the installed
  version. Returning to Settings preserves pending settings edits.
- Reading starts at the top whenever history opens or the selected entry changes.

## Add an update

1. Update the version in `manifest.json`, `package.json` and `package-lock.json`.
2. Add an entry to `src/features/release-notes/releaseCatalog.js`, with its version,
   date, translation key, paragraph names and highlight names.
3. Add those keys to every shipped language catalog under `src/lang/`. Follow
   [Localization](../development/LOCALIZATION.md) when generating and reviewing
   catalogs. The first `paragraphs` entry is the header introduction.
4. Run `npm run check`, `npm run test:e2e`, and the packaged-extension tests in
   the [publishing procedure](CHROME_WEB_STORE.md#release-procedure).

The tests in `tests/releaseCatalog.test.mjs` require an entry for the manifest
version and non-empty translated controls, paragraphs and highlights in every
supported language. History uses numeric version ordering and excludes entries
newer than the installed version. A generic fallback describes the installed
version if a development environment simulates a version without a catalog entry.

## Device-local persistence

`newdesktabReleaseNotes` records the latest offered version in
`chrome.storage.local`. Web Locks serializes the claim between tabs in the same
profile when available. A hidden tab or a tab with another dialog waits for an
eligible moment. Failed writes do not count as successfully recorded offers.

This marker is excluded from Chrome Sync and workspace backups. Importing a
backup, deleting workspace data or consulting history manually does not re-offer
an already recorded release. Downgrading does not repeat it either. The marker
is independent of the workspace data schema, currently version 2.

The notes and their translations ship inside the extension package. Displaying
them does not require an external service or additional permissions.
