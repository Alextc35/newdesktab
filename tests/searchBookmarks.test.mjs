import assert from 'node:assert/strict';
import test from 'node:test';

import { searchBookmarks } from '../src/features/search/searchBookmarks.js';

const bookmarks = [
  { id: 'old-name', name: 'Project Atlas', url: 'https://example.com', updatedAt: 10 },
  { id: 'url-match', name: 'Reference', url: 'https://atlas.test/docs', updatedAt: 30 },
  { id: 'new-name', name: 'ATLAS dashboard', url: 'https://dashboard.test', updatedAt: 20 },
  { id: 'other', name: 'Inbox', url: 'https://mail.test', updatedAt: 40 }
];

test('search matches bookmark names and URLs without case or surrounding-space sensitivity', () => {
  assert.deepEqual(
    searchBookmarks(bookmarks, '  AtLaS  ').map(bookmark => bookmark.id),
    ['url-match', 'new-name', 'old-name']
  );
});

test('empty search returns recent bookmarks first without mutating the source', () => {
  const originalOrder = bookmarks.map(bookmark => bookmark.id);

  assert.deepEqual(
    searchBookmarks(bookmarks, '').map(bookmark => bookmark.id),
    ['other', 'url-match', 'new-name', 'old-name']
  );
  assert.deepEqual(bookmarks.map(bookmark => bookmark.id), originalOrder);
});

test('search result limits are applied after recency ordering', () => {
  assert.deepEqual(
    searchBookmarks(bookmarks, '', { limit: 2 }).map(bookmark => bookmark.id),
    ['other', 'url-match']
  );
});
