/**
 * Describes an application-state change without retaining user content.
 *
 * @param {Partial<AppState>} partial
 * @param {DataState} previous
 * @returns {string}
 */
export function describeStateChange(partial, previous) {
  const data = partial.data;
  if (!data) return 'Update UI state';

  const groups = data.settings?.bookmarkGroups;
  if (groups && groups.length !== previous.settings.bookmarkGroups.length) {
    return groups.length > previous.settings.bookmarkGroups.length
      ? 'Create workspace'
      : 'Delete workspace';
  }

  if (data.folders && data.folders.length !== previous.folders.length) {
    return data.folders.length > previous.folders.length ? 'Create folder' : 'Delete folder';
  }

  if (data.bookmarks && data.bookmarks.length !== previous.bookmarks.length) {
    return data.bookmarks.length > previous.bookmarks.length ? 'Add bookmarks' : 'Delete bookmarks';
  }

  if (data.settings) {
    return data.settings.activeBookmarkGroupId !== previous.settings.activeBookmarkGroupId
      ? 'Switch workspace'
      : 'Save settings';
  }

  return data.folders ? 'Update folders / grid' : 'Update bookmarks / grid';
}
