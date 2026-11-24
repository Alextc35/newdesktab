# New DeskTab user guide

[Project home](../../README.md) · [Documentation index](../README.md) ·
[Development guide](../development/DEVELOPMENT.md)

New DeskTab turns a new browser tab into a visual workspace for your favorite
websites. This guide covers everyday use, keyboard controls, storage and moving
your workspace between browser profiles.

## Contents

- [Get started](#get-started)
- [Save and edit bookmarks](#save-and-edit-bookmarks)
- [Arrange the grid](#arrange-the-grid)
- [Use folders and workspaces](#use-folders-and-workspaces)
- [Search and widgets](#search-and-widgets)
- [Keyboard and pointer controls](#keyboard-and-pointer-controls)
- [Themes, wallpapers and languages](#themes-wallpapers-and-languages)
- [Local storage and Chrome Sync](#local-storage-and-chrome-sync)
- [Exports, backups and recovery](#exports-backups-and-recovery)
- [Help and privacy](#help-and-privacy)

## Get started

New DeskTab requires Chrome 123 or newer, or a compatible Chromium-based browser.
Brave works in Local mode. Optional cross-device synchronization is available
only in supported Google Chrome.

To install a clean extension package:

1. Download and extract the repository, or clone it with
   `git clone https://github.com/Alextc35/newdesktab.git`.
2. Open a terminal in the repository folder and run `npm run package:dev`.
   This requires Node.js/npm and Python 3.9 or newer. If Python is available as `python`
   instead of `python3`, use `python scripts/package-extension.py --target dev` instead.
   The packaging script needs no development dependency installation.
3. Extract `dist/newdesktab-<version>-dev.zip` into a permanent folder. If you already
   have a generated extension ZIP, start with this step.
4. Open `chrome://extensions` or `brave://extensions`.
5. Enable **Developer Mode**.
6. Choose **Load unpacked** and select the extracted folder containing
   `manifest.json`.
7. Open a new tab.

Keep the extracted folder in place while the browser uses it. The generated ZIP
contains the extension files, license and privacy policy; development tools and
documentation are excluded. The developer ZIP preserves the source's public
manifest key for a stable unpacked extension ID. The separate Store package
(`npm run package:store`) omits that field. Alternatively, you can load the repository folder
directly as the source extension, without packaging or installing dependencies.

Release notes appear once for each new version and browser profile. A new
profile can then follow the optional five-step welcome guide. After that first
guide finishes or is skipped, New DeskTab offers to import any supported native
Chrome bookmarks it detects. Replaying the guide later does not repeat this
offer; the import remains available in **Settings → Bookmarks**.

Start by adding a bookmark, enabling edit mode and moving or resizing its card.
Changes save automatically; check any save-error message before closing the tab.

## Save and edit bookmarks

Use the add menu or press `B` to create a bookmark. The compact form can expand
into the full style editor. Each bookmark keeps its own name, URL, position,
size and appearance. New bookmarks use the active default style and are placed
in an available area of the current workspace.

### Save the current page

Click New DeskTab's button in the browser toolbar to open the quick-save popup.
It reads the current tab's title and URL so you can choose a workspace or folder
and save the page. An existing-favorite indicator helps identify duplicates.
The popup closes after a successful save; the source page stays open.

### Change a card's appearance

Enable edit mode with `E`, then use a card's pencil button. A middle click on a
bookmark also opens its editor while editing the grid, without following the link.

The style editor supports colors, local or remote images, text visibility,
website icons and reusable category symbols. In **Style → Icon**, search the
bundled catalog for everyday symbols, interface icons or geometric shapes.
Suggestions use the saved name and site's hostname locally. Search follows the
interface language and ignores accents.

The same catalog is available for folders, the recycle bin and default bookmark
styles. Symbols follow the item's colors and appear consistently in the grid,
lists and previews. Choosing the original folder artwork restores bookmark
previews and its cover image.

For a bookmark's normal caption, **Style → Icon → Position** places its icon and
name at the bottom left or bottom right. The right-hand position puts the name
before the icon. This choice is preserved in appearance presets and backups.

Save a named appearance preset to reuse a style. Presets contain appearance
only: applying one does not copy a bookmark's URL, identity or grid position.

### Select and change several items

In edit mode, a short primary click toggles selection for bookmarks, folders and
widgets. Holding the button begins a drag and does not change selection. The
bulk toolbar can move selected items to another workspace or delete them.
Moving a folder also moves its bookmarks. Items that cannot fit at the
destination remain in their original workspace.

For selections without widgets, the toolbar also duplicates bookmarks and
whole folders or applies default styles. The style action applies the configured
bookmark default to bookmarks and the built-in folder default to folders.
Duplication and styling are disabled when a selection includes a widget.
Deleted bookmarks and folders go to the recycle bin; widget deletion is
permanent and requires confirmation.

The workspace toolbar provides undo and redo. Editors also have their own small
undo/redo arrows beside the title. Editor history starts fresh each time an
editor opens; typing fields retain the browser's native text undo.

## Arrange the grid

Bookmarks and folders can be dragged and resized on a collision-aware grid.
They have eight resize handles: drag for continuous resizing, click to grow one
grid cell in that direction, or `Shift + click` to shrink. An invalid resize
returns the item to its full previous position and size.

**Settings → Bookmarks → Drag behavior** determines what happens at occupied cells:

| Mode | Behavior |
| --- | --- |
| **None** — default | Other items stay still. Only free areas accept a drop; an occupied target returns the item to its starting position. |
| **Relocation** | Blocking items move into the vacated area or a nearby free space. |
| **Sequence** — experimental | A chain of bookmarks shifts toward an available gap. Edge cases may still occur. |

Dropping a bookmark on a folder adds it to that folder. It does not move the
folder out of the way. Folder cards use the same grid drag and resize system.

### Resize the browser window

**Settings → General → Window resizing behavior → Keep bookmark size** keeps the
larger grid available in a smaller window. Each workspace remembers its
horizontal and vertical scroll position on this device. A workspace with no
saved position starts centered. Window resizing keeps the visible center
anchored; changing workspace restores its view and fades it in without scaling
the grid.

These scroll positions stay on the device and are excluded from Sync and backups.

## Use folders and workspaces

### Folders

Press `F` or use the add menu to create a folder. Folder cards start at one grid
cell and can be resized and styled independently. Opening a folder provides a
link view and an editable **3-row × 6-column grid** for small collections.
Folders have no fixed item-count limit. Larger collections use compact pages
of 54 items, with folder search and previous/next controls to keep navigation fast.
Folders containing subfolders also use this list view. Open subfolders and use
**Back** or the breadcrumb to return to an ancestor. Search filters the current
folder; clear it to return to the complete collection.
In list editing mode, select a row and use **Move up** or **Move down** to change
its order. `Alt + ↑ / ↓` also moves the focused row. Edit, delete and move-out
actions stay aligned at the right of each row. Bookmark and subfolder order is
saved together and survives closing the folder or reloading.

A bookmark inside a folder keeps its saved appearance and main-grid dimensions,
but occupies one compact cell inside the folder. Its local order is remembered
after closing the folder or reloading. The configured None, Relocation or
Sequence behavior also applies inside folders.

Dragging a bookmark onto a folder uses its first free internal cell. Taking it
out finds a free area in the main grid large enough for its saved dimensions.
Imported folders can contain subfolders. Moving a folder to another workspace keeps its
complete subtree with it. Deleting a folder asks for confirmation and sends the folder
and all its contents to the recycle bin together, unless permanent deletion is
explicitly selected.

### Workspaces

Use the bottom workspace panel to create and switch between independent layouts.
For example, keep work, study and personal websites in separate spaces. Press
`Ctrl + ↑` or `Ctrl + ↓` to cycle through them.

Each workspace can have its own name and theme settings. By default,
`Ctrl + S` opens the current workspace's settings; if the Settings shortcut has
been reassigned, use `Ctrl` plus that configured key when the combination is
available. This extra shortcut is disabled if the Settings shortcut already
contains `Ctrl` or the resulting combination is assigned to another action.

**Settings → General → Panels** controls the left action panel and bottom
workspace panel independently. Their shortcuts remain available when a panel is
hidden. Keep a Settings shortcut assigned so you can reopen Settings.

## Search and widgets

Press `/` to search saved bookmarks across all workspaces. Results identify
their containing folder where applicable. Search operates on your New DeskTab
bookmarks, rather than the browser's history or native bookmark library.

Press `W` or choose **Widgets** from the add menu to open the widget catalog.
The bundled clock can be resized and configured for 12- or 24-hour time and
optional seconds. **The clock is still in development.**
Further work on widgets is planned for upcoming updates. Deleting a widget is
permanent: it is not sent to the recycle bin and cannot be undone.

## Keyboard and pointer controls

These are the default shortcuts. The first five letter shortcuts can be changed
under **Settings → Shortcuts**. Custom values are included in complete backups
and synchronized shared settings when Chrome Sync is enabled.

| Key or gesture | Action |
| --- | --- |
| `E` | Toggle edit mode; inside an open folder, toggle that folder's edit controls and reordering. |
| `B` | Create a bookmark. |
| `F` | Create a folder. |
| `W` | Open the widget catalog. |
| `S` | Open Settings, except when used for selection during keyboard grid navigation. |
| `Ctrl` + Settings shortcut — `Ctrl + S` by default | Open the current workspace's settings, unless the configured shortcut already contains `Ctrl` or the resulting combination conflicts with another action. |
| `/` | Open global bookmark search. |
| `Ctrl + ↑` / `Ctrl + ↓` | Switch workspace. |
| `Alt + ↑` / `Alt + ↓` in a folder's list edit mode | Move the focused bookmark or subfolder up / down. |
| `Ctrl/Cmd + Z` | Undo the latest workspace operation or pending editor change. |
| `Ctrl/Cmd + Shift + Z` | Redo. |
| Middle click on a bookmark in edit mode | Open its editor. |
| Short primary click in edit mode | Toggle selection. |
| Hold and move the primary button | Drag an item. |
| Click a resize handle / `Shift + click` | Grow / shrink one grid cell in that direction. |
| `Delete` / `Backspace` during keyboard grid navigation in edit mode | Confirm removal of the focused item; bookmarks and folders go to the recycle bin, while widgets are permanently deleted. |
| `Shift + Delete` / `Shift + Backspace` in that mode | Confirm permanent removal of the focused removable item. |
| `Escape` outside dialogs and text controls | Clear selection first, then leave grid navigation, then leave edit mode on successive presses. |

### Navigate the grid with the keyboard

Press `Tab` while the page is focused to enter grid navigation, and press it again
to leave. A brief message confirms the change, and the first visible top-level
item receives focus.

- Arrow keys navigate to a bookmark, folder, widget or recycle bin in the chosen
  direction, remembering the row or column used to enter a resized card.
- Horizontal arrows prefer the nearest item on the remembered row. With at most
  one empty cell they ignore diagonal candidates; larger gaps allow the nearest
  diagonal route. Vertical arrows stay in the remembered column and leave focus
  in place if that lane is empty.
- Reversing the previous arrow movement first returns to the item you came from.
- Outside edit mode, `Enter` opens the focused item: bookmarks open their website,
  folders and the recycle bin open their contents, and the clock opens its settings.
- In edit mode, `Enter` opens the focused item's editor when nothing is selected
  or that item is the only selection. `S` toggles the focused bookmark, folder or
  widget's selection; it does not select the recycle bin.
- Closing a folder, editor or recycle bin returns focus to the same card and
  keeps grid navigation active. Opening a bookmark URL leaves the page and ends
  that mode.

### Move a selected item with arrows

Outside keyboard grid navigation, arrow keys move one selected top-level
bookmark, folder or widget while editing. The selected item stays stationary
during `Tab` grid navigation and becomes movable after leaving that mode.

Arrow movement follows the chosen drag behavior. None searches for the next free
area in that direction. In Relocation and Sequence, moving a bookmark can
rearrange other bookmarks but skips folders and widgets without moving them.
Moving a folder or widget can also rearrange those item types; the recycle bin
stays fixed as an obstacle. Movement shortcuts are ignored with zero or multiple
selections, while typing, while a modal is open, and with modifier keys held.

## Themes, wallpapers and languages

Choose a browser-following, light or dark interface under **Settings → General**.
Use **Settings → Theme** for a solid background or image/video wallpapers.

**My own wallpapers** is a collection for this device. Add local images or
MP4/WebM/Ogg videos, or remote URLs. Reorder the collection, set the color behind
transparent media and preview each wallpaper. The first stays fixed by default;
choose a rotation interval to cycle through the ordered collection.

Previews use the desktop's aspect ratio and a cover crop. Videos play muted and
loop. Each local video can be up to **200 MiB** (shown as 200 MB in the interface).
Local media files stay on this device, outside Chrome Sync.

In Sync mode, a separate image or video URL provides a shared fallback. It is
shown only when this device has no personal wallpaper and is not part of the
rotation. Personal wallpaper URLs, ordering and rotation timing are also
device-specific. Older shared wallpaper lists are copied into the device's
personal collection during upgrade; later edits remain independent.

The interface includes **52 bundled languages**, with browser-language
detection, native language names and language/country search. English, Spanish
from Spain, Latin American Spanish and Brazilian Portuguese are among them.
The welcome guide, help and release notes are localized too. Switching language
does not call an online translation service.

## Local storage and Chrome Sync

New DeskTab starts in **Local** mode. **Settings → Sync** offers:

| Mode | Where data is stored |
| --- | --- |
| **Only on this device** | Inside this browser profile, using Chrome's local extension storage. |
| **Synchronized** | In browser-managed Chrome Sync storage, according to the Google Chrome profile and Google Account configuration. |

Sync is enabled only in branded Google Chrome. Brave and other Chromium
browsers remain usable in Local mode; their Sync option is disabled because
cross-device propagation has not been reliable. See [the compatibility issue](https://github.com/Alextc35/newdesktab/issues/1).

New DeskTab has no account system or backend of its own. The developer cannot
access your synchronized workspace through the extension.

Recycle-bin contents stay in the current browser profile even in Sync mode.
Deleting an item on one device does not copy its trash entry to another device.
Complete backups include the current profile's trash entries.

### Enable, disable and monitor Sync

When enabling Sync for the first time, local data is uploaded if that Chrome
profile has no existing New DeskTab data. **If synchronized data already exists,
it takes precedence** to avoid overwriting it. Export a complete backup before
changing modes if you want to preserve the current workspace separately.

Returning to Local mode creates a local copy and leaves the synchronized copy
in place. The Sync panel shows used, total and available capacity, save status
and the latest synchronized update. Quota or persistence failures are reported
in the interface; follow the retry notice when a write fails.

An open New DeskTab page displays a brief message when data arrives from another
synchronized device. Writes from the current device do not trigger that local
message. Changes from tabs on the same device are combined before saving;
simultaneous edits on different devices have no guaranteed conflict recovery.

If synchronized data was written by a newer, incompatible version, the older
installation falls back to its compatible Local data and locks Sync with an
update notice. The cloud data is left untouched. Install a compatible version
to clear the device-specific lock, or explicitly delete the synchronized data.

Cross-device Sync also requires the same extension ID on every installation.
Store-distributed installs provide that identity; development installs need a
stable manifest key or packaging workflow. See the [development guide](../development/DEVELOPMENT.md).

## Exports, backups and recovery

New DeskTab supports two different exports from Settings:

| Export | Best for |
| --- | --- |
| **Export bookmarks** | A New DeskTab JSON file containing bookmarks, nested folders and their appearance. |
| **Export backup** | A complete workspace and settings backup with the referenced local media needed to restore it. |

**Settings → Bookmarks** also offers **Import from Google Chrome** and
**Import HTML file**. Chrome's Bookmark Manager can export an HTML bookmark file.
Use **View and select items** to expand the detected tree, choose individual
links or complete folders, search, or select/deselect everything. Empty folders
have a visible **Empty** badge and start unchecked. You can include them explicitly.
Folder icons contain an expand arrow when they have children; links show their
website favicon when available. The tree uses the interface's styled scrollbar
and can reveal more entries in large collections.

Import adds the selection to **Main**, alongside existing New DeskTab bookmarks,
regardless of the workspace currently open. Chrome's originals remain unchanged.
Chrome's bookmarks-bar contents appear directly on the desktop. Other populated
browser buckets remain folders. If the bookmarks bar has no selected contents and
only one other populated bucket contains links without subfolders, those links
also appear directly. User folders keep their names, nesting and order. Empty
browser buckets are omitted. Imported folder cards start without an outer background.

New desktop items fill free cells from left to right, then top to bottom, keeping
the source order. Existing cards, widgets and the recycle bin keep their places.
A container is used only when the root collection does not fit the remaining
desktop cells. Free a cell and retry if Main is full; a failed import leaves the
existing data unchanged.
Repeating the same import avoids duplicating the imported records.
The standard confirmation appears before writing the selected data. On success,
the import dialog closes automatically and a flash reports the saved result.
Unsupported link protocols are skipped and reported. Large collections may
exceed Chrome Sync's storage allowance; switch DeskTab to Local mode and retry.

On a new profile, the first welcome guide leads to this same import offer when
supported Chrome bookmarks are detected. You can choose **Not now** and import
later in Settings. Replaying the guide does not offer the import again.

Complete backups without local videos use **JSON**. Those containing local
videos use **ZIP**, with configuration and separate binary video files. Older
JSON backups with embedded videos remain supported. Referenced local images
are included as optimized copies, and local media filenames are retained.
Complete JSON and ZIP backups also preserve whether daily tips are enabled.
Restoring an older backup without this preference keeps the current choice.

Use **Restore backup** to choose a compatible backup file. Restoration replaces
the current workspace data and settings after confirmation. Export the current
workspace first if you may want to return to it. Backups are downloaded to your
device and **are not encrypted by New DeskTab**; store or share them accordingly.

Unavailable local-image references are removed during import and export.
Complete backups restore included images before checking references, retaining
available files and alternative URLs. Missing device image selections are
cleared only on that device; another synchronized device's files and choices
are not removed.

### Recover or remove data

The recycle bin allows recovery of supported deleted items. Its retention
setting controls when entries expire; zero days means they do not expire
automatically. Available retention periods are 1, 7, 14 or 28 days, or never;
the default is 28 days. A recycle bin does not replace a backup stored outside
the browser.

Uninstalling the extension removes its local data from that browser profile,
including bookmarks, settings, media, trash and the selected storage mode. A fresh
installation starts in Local mode and does not automatically recover the former
workspace. Export a complete backup before uninstalling or moving profiles, then
restore it after installation. Chrome Sync is not a substitute for that backup.

For an unpacked-extension update, replace the files in the existing installation
folder and use **Reload** on `chrome://extensions`. Keep the same manifest key and
extension ID. This updates the installation while retaining its stored data;
uninstalling and reinstalling is unnecessary.

**Settings → Sync → Delete synced data** removes New DeskTab's synchronized
copy after confirmation, preserving a working local copy first when necessary.
Switching back to Local alone does not delete that synchronized copy.

**Settings → General → Delete all local data** removes this profile's local
workspace, settings, deleted items and stored media. If Sync is active, the
device first switches to Local; the cloud copy is unchanged. This deletion
cannot be undone. Exported backup files must be deleted separately.

## Help and privacy

**Settings → Help** contains the searchable manual, common questions, replayable
welcome guide and daily-tip preference. Tips can open their related manual
section, and **Turn off daily tips** on the card disables future tips immediately.
You can enable them again in Help. **Settings → Information** provides release
notes and version history.

On a new profile, release notes appear before the guide, followed by the detected
Chrome-bookmark import offer when applicable. An enabled daily tip follows those
dialogs. In compact list mode at 600 pixels wide or less, notes,
guide, manual and tips are hidden with a brief message. Pending introductory
notices remain available when the window is enlarged.

The daily-tip preference stays out of Sync, but complete backups preserve its
enabled/disabled choice. Tip history and the last offered day, welcome-guide
status and the last offered release notice stay in this browser profile and
are excluded from backups and Sync. Restoring a workspace does not replay a
release notice that this profile has already seen.

New DeskTab has no analytics or advertising SDK and no developer-operated
backend. Local mode describes where workspace data is saved: displaying website
favicons still requests their origins from Google's favicon service, and remote
images or videos load from their hosts. Bundled category icons and local media
can reduce those requests. Read the full [privacy policy](../../PRIVACY.md) for
permissions, external requests, retention and deletion.

For support, [open a project issue](https://github.com/Alextc35/newdesktab/issues).
That page is public; keep private URLs, backup files and personal screenshots
out of public reports. Technical readers can continue with the
[architecture reference](../architecture/ARCHITECTURE.md) or the
[development guide](../development/DEVELOPMENT.md).
