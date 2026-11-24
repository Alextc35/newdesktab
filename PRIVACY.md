# NewDeskTab Privacy Policy

Last updated: November 24, 2026

NewDeskTab replaces the browser's new tab page with a customizable bookmark
workspace. It does not require a NewDeskTab account or use a NewDeskTab-operated
backend. This policy describes the extension, including its local storage,
optional Google Chrome synchronization, and requests for external media.

## Information used by NewDeskTab

NewDeskTab stores the bookmarks you enter or import, including their names, URLs,
layout, appearance and creation/update timestamps. It also stores folders,
workspaces, presets and settings such as language and theme. Images selected
from your device are processed in the browser; their optimized image data and
original filenames are stored in the extension's local storage. Videos selected
from your device are stored in the browser's local IndexedDB with their filenames.

NewDeskTab uses this information to display, edit, search, save and restore your
workspace. It requests the `storage` permission for this purpose. It does not
use a fixed bookmark-count limit. The `unlimitedStorage` permission lets large
local collections exceed Chrome's default extension storage quota, subject to
available disk space. It does not increase Chrome Sync's storage allowance.
NewDeskTab does not read your general browsing history, passwords or other
websites' page contents. Its search operates on your NewDeskTab bookmarks.

When you click the extension's toolbar button, the `activeTab` permission allows
the quick-save popup to read that active tab's title and URL so you can save it
as a bookmark. It does not read the page's contents or close the source tab.

The `bookmarks` permission lets NewDeskTab detect your native Chrome bookmarks
after the first welcome guide and offer to import them. You can also start an
import from Settings or select an exported HTML bookmark file. Native titles,
URLs, folders and their order are read locally. Import copies your selected
collection into the Main workspace; it does not change or delete your native bookmarks.
The developer does not receive the native bookmark tree. Imported records use
the same Local or optional Sync storage as your other NewDeskTab bookmarks.

## Local storage and optional synchronization

NewDeskTab starts in Local mode, using `chrome.storage.local` inside your browser
profile. This describes where workspace data is saved; external images can
still cause network requests in Local mode, as explained below.

Welcome-guide state, the daily-tip preference and tip history,
and the most recent release notice offered are stored locally in this browser
profile. They keep introductions and tips from repeating and are not synchronized.
Complete JSON and ZIP backups include the daily-tip on/off preference; older
backups without it preserve the current choice. Guide state,
tip history and release-notice history are excluded from workspace backups.
No notification history is sent to the developer.

If you enable Sync in supported Google Chrome, bookmark data and shared
settings are stored using `chrome.storage.sync`. Chrome manages transfer and
availability according to your browser profile and Google Account settings.
NewDeskTab also stores synchronization metadata, including a generated device
identifier and update timestamps, to distinguish local and remote changes.
The extension does not give its developer access to that synchronized data.

Local image and video files, filenames, personal wallpaper URLs, their order
and rotation timing are not sent to Sync. Only the fallback wallpaper URL is
synchronized, and only appears on the page in Sync mode when no personal
wallpaper is available. An older shared wallpaper list may remain in Sync as a frozen
migration copy so devices upgrading later can retain their previous wallpapers;
subsequent edits to personal wallpapers never update that copy.
See [Google's privacy policy](https://policies.google.com/privacy) for Google's
handling of its services.

## Requests for favicons and other media

Bundled category icons are rendered locally. Choosing one instead of a website
favicon avoids the favicon request for that item.
Opening the icon picker can still request the site's favicon to preview the Logo choice.
Icon suggestions use the saved name and hostname locally, without sending them to a service.

When a view, import preview or editor displays a website icon, NewDeskTab requests it from Google's
favicon service at `https://t3.gstatic.com/faviconV2`. The request includes the
bookmark site's origin (scheme, hostname and any port), with a leading `www.`
or `app.` removed when they are subdomains. If the service reports no icon,
NewDeskTab tries parent hosts down to the registrable domain. It checks the
service's HTTP response with a HEAD request without cookies; decoded generic
error icons can otherwise look like successful loads. It does not include the bookmark URL's path, query string or
fragment. Hosts ending in `.internal` or `.local` use generated initials instead.
These exclusions do not cover every possible private hostname or IP address.

When a remote background image or video is displayed, the browser requests its
configured URL from its host. Requests can also occur while previews are
displayed, without opening a bookmark's website.

Media providers receive the requested URL and ordinary connection/request
information, such as your IP address and browser headers. Browser privacy and
cookie settings apply. NewDeskTab does not operate these image services or control
their logging or retention. Replacing remote media with local files or removing
the remote URLs avoids those particular media requests. Favicons may still be
requested by views that display website icons.

Opening a bookmark navigates to its destination; that website's policies then
apply. External media is displayed as images or videos, not executed as extension code.

## Exports, retention and deletion

Bookmark import reads the native tree with browser permission or an HTML file
you select. Backup restore reads a selected JSON or ZIP file; export creates a
JSON or ZIP download on your device.
NewDeskTab does not upload these files to the developer. Complete backups embed
optimized copies of referenced local images and their filenames so they can be
restored after local data is deleted or moved to another browser profile. Complete
backups containing local videos use ZIP, with JSON configuration and separate
binary video files. Restore recreates those files in this device's IndexedDB.
Backups without local videos remain JSON, and older JSON backups with embedded
videos remain importable. Exported files are not encrypted by NewDeskTab.

Imports restore included images before clearing references to unavailable local
files. Exports omit those unavailable image references. Device-only cleanup also
removes personal image wallpapers with no file or URL, and does not delete files
or change image choices on another synchronized device.

Workspace data is retained in the browser until you change or remove it.
Deleting a bookmark removes the record but does not necessarily erase unused
image files from extension storage. Removing a local video wallpaper on this
device deletes its stored file after saving; cancelling a new video upload also
removes it. Returning to Local mode retains the Sync
copy. Settings provides an explicit action to delete NewDeskTab's synchronized
data; when needed, it first preserves the working data locally. To remove local
data and stored media files, use Settings → General → Delete all local data,
clear the extension's storage using browser tools, or remove the extension.
Uninstalling removes the profile's local extension data, including local media
and device preferences; reinstalling does not restore it automatically. Keep an
exported complete backup if you need to recover it later. Delete exported files
separately. Google controls the retention of data within its services.

## Analytics, advertising and support

NewDeskTab includes no analytics or advertising SDK and sends no telemetry to a
NewDeskTab server. Optional debug output stays in the browser console. If you
choose to share a backup, screenshot or debug output for support, that information
is then available to its recipients.

NewDeskTab uses and transfers user data only to provide the workspace features
described here, consistent with the Chrome Web Store User Data Policy and its
Limited Use requirements. The developer does not sell workspace data, use it for
advertising or credit decisions, or receive it through an extension backend.

For questions about NewDeskTab or this policy, use the
[NewDeskTab project support page](https://github.com/Alextc35/newdesktab/issues).
That page is public: do not post private bookmarks or backup files there.
