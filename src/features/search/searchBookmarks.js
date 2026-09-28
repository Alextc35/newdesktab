const DEFAULT_RESULT_LIMIT = 30;

/** Returns the most recently updated bookmarks matching a name or URL query. */
export function searchBookmarks(bookmarks, query, { limit = DEFAULT_RESULT_LIMIT } = {}) {
  const term = query.trim().toLocaleLowerCase();

  return bookmarks
    .filter(bookmark => (
      !term || `${bookmark.name} ${bookmark.url}`.toLocaleLowerCase().includes(term)
    ))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}
