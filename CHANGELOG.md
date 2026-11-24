# Changelog

## 1.1.2 — 2026-11-24

- Refresh open New DeskTab pages when Chrome Sync changes arrive, without requiring a switch to Local and back to Sync.
- Retain storage changes received during startup and prevent older asynchronous reads from replacing newer updates.
- Retry temporary storage-read failures and check for updates when returning to a tab.
- Validate synchronized payload integrity while retaining compatibility with earlier versions.
- Read only Sync metadata for normal update checks and remove unused workspace styles and a selector.
- Keep public data schema 2, the existing permissions and Chrome/Chromium 123 as the minimum browser version.

## 1.1.1 — 2026-11-24

- Keep disabled action and workspace panels hidden from the initial page render, avoiding a flash during startup.
- Count only user folders in detected and selected browser bookmarks, excluding browser-provided root containers.
- Move folders to the recycle bin without confirmation when their complete tree contains no bookmarks, including trees of empty subfolders; keep confirmation when any descendant contains bookmarks or deletion is permanent.
- Expand the bookmarks bar by default in the import preview, distinguish its show/hide control from selection actions, and keep progress in the import button without an extra loading block.
- Use “Principal” consistently for Main in Spanish import text, release notes and the manual.
- Put Keep bookmark size first in window-resizing settings and make it the default for new or missing preferences; retain valid saved choices.
- Align the daily-tip action at the lower right and confirm turning off daily tips with a saved-settings flash.
- Retain public data schema 2, the current permissions and Chrome/Chromium 123 as the minimum browser version.

## 1.1.0 — 2026-11-23

- Offer native Chrome bookmark import after the first welcome guide, and provide Chrome and exported-HTML imports in Settings.
- Preview detected bookmarks and folders with search, favicons and individual selection; show empty folders and leave them unchecked by default.
- Import into Main in source order, placing toolbar contents directly on the desktop and preserving useful folders from other bookmark locations.
- Place new desktop items in row order around existing items, preserve existing positions and styles on repeated imports, and use an overflow folder when needed.
- Confirm imports before saving, close the dialog after success and report the result with a flash notification.
- Remove the 18-bookmark folder limit and support nested folders, current-folder search, breadcrumbs and pages of 54 entries for large collections.
- Improve folder editing with aligned action buttons, row selection, Move up/Move down controls and Alt + Up/Down shortcuts.
- Preserve complete folder trees when moving, duplicating, deleting or restoring them from the recycle bin.
- Advance the public data schema to 2 and migrate public schema 1 automatically.
- Add the `bookmarks` and `unlimitedStorage` permissions for native import and large local collections; Chrome Sync quotas remain unchanged.
- Align backup and folder-capacity browser tests with schema 2 and the larger folder capacity.

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
