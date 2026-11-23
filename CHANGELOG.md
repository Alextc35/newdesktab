# Changelog

## 1.0.1 — 2026-11-23

- Preserve the daily-tip preference when exporting and restoring JSON or ZIP backups.
- Keep the current daily-tip preference when restoring older backups without that setting.
- Add a discreet button on each daily tip to turn off future tips immediately.

## 1.0.0 — 2026-11-16

First stable release of New DeskTab, a customizable new-tab workspace.

- Arrange, resize and style bookmarks, folders and a bundled clock widget.
- The clock is the first bundled widget and remains a work in progress.
- Organize independent workspaces, search saved items and reuse appearance presets.
- Customize each workspace's theme and reuse the wallpaper library with live previews.
- Choose searchable bundled SVG icons, independent icon colors and left- or right-aligned bookmark captions.
- Personalize folder covers, colors and icons, and preserve the order of their contents.
- Save the current page from the browser toolbar and use configurable keyboard shortcuts.
- Identify existing bookmarks in the quick-save popup and apply the default bookmark appearance to new saves.
- Select, move, duplicate and style multiple supported items together.
- Navigate the grid with the keyboard, switch workspaces with Ctrl + Up/Down and open the current workspace's settings with Ctrl + the Settings shortcut when available.
- Show or hide the action panel and workspace panel independently while retaining keyboard shortcuts.
- Recover deleted bookmarks with the recycle bin and undo/redo controls.
- Configure recycle-bin retention and use a compact recycle bin in list view.
- Undo and redo pending editor changes with keyboard shortcuts or discreet header arrows, with brief feedback after each action.
- Preserve workspace undo history when saved folder properties are reordered during normalization.
- Clear unavailable local-image references during import/export and device restoration, preserving included files and URL fallbacks without changing other devices.
- Keep confirmed clock deletion permanent, including after a failed-save retry.
- Keep data locally or enable Google Chrome profile synchronization.
- Customize light/dark appearance, backgrounds and device-local wallpaper rotation.
- Add local or remote image and video wallpapers, preview them and rotate the device's personal collection.
- In Keep bookmark size mode, keep card sizes fixed during workspace transitions, preserve the visible center on window resize and remember each workspace's horizontal and vertical scroll position only on this device, outside Sync and backups.
- Export and restore JSON or ZIP backups, including referenced local images and videos.
- Confirm backup exports and workspace deletion, including permanent removal of widgets belonging to a deleted workspace.
- Use 52 bundled interface languages, browser-language detection and a searchable language picker, with localized onboarding, manual, release notes and optional daily tips.
- Find the manual, quick guide and daily-tip preference in a dedicated Help section.
- Read the author's first-release introduction and revisit release history from Information.
- See each update notice once per profile, followed by the optional welcome guide and daily tip.
- Protect existing data by rejecting malformed imports, future schemas and duplicate IDs.
- Start the public data schema at version 1; development schemas 2–21 are discarded.
- Preserve custom caption colors with readable backgrounds and consistent on/off controls.
- Retry missing favicons on parent domains, including SharePoint tenants, while keeping bookmark URLs intact.
- Improve responsiveness when editing, dragging, opening Settings and using the recycle bin.
- Improve editor previews, grid-line contrast, folder visibility, scrollbars and keyboard focus after closing quick-create dialogs.

Requires Chrome/Chromium 123 or newer, or a compatible Brave version. Chrome
Sync is available only in supported Google Chrome; Brave and other Chromium
browsers use Local mode. Local media and personal wallpaper collections stay
on the device. Sequence drag behavior is optional and remains experimental.
