import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyBookmarkPreset,
  createBookmarkDraft,
  normalizeBookmark,
  normalizeBookmarkPreset,
  normalizeBookmarkUrl,
  validateBookmarkDraft
} from '../src/domain/bookmarks/bookmarkModel.js';
import { validateFolderDraft } from '../src/domain/folders/folderModel.js';
import { findFirstFreeSlot, isAreaFree } from '../src/shared/grid/gridPlacement.js';

test('a preset contains appearance fields only', () => {
  const preset = normalizeBookmarkPreset({
    name: 'Must not leak',
    url: 'https://example.com',
    gx: 9,
    backgroundColor: '#AABBCC',
    showText: false
  });

  assert.equal(preset.name, undefined);
  assert.equal(preset.url, undefined);
  assert.equal(preset.gx, undefined);
  assert.equal(preset.backgroundColor, '#aabbcc');
  assert.equal(preset.showText, false);
});

test('a create draft combines blank identity with a visual preset', () => {
  const draft = createBookmarkDraft({
    preset: { backgroundColor: '#123456', showFavicon: false }
  });

  assert.equal(draft.name, '');
  assert.equal(draft.url, '');
  assert.equal(draft.gx, 0);
  assert.equal(draft.backgroundColor, '#123456');
  assert.equal(draft.showFavicon, false);
});

test('normalization can be deterministic through injected runtime values', () => {
  const bookmark = normalizeBookmark({
    name: '  NewDeskTab  ',
    url: 'github.com/Alextc35/newdesktab',
    gx: -3,
    w: 0
  }, {
    now: 1234,
    idFactory: () => 'bookmark-id'
  });

  assert.equal(bookmark.id, 'bookmark-id');
  assert.equal(bookmark.name, 'NewDeskTab');
  assert.equal(bookmark.url, 'https://github.com/Alextc35/newdesktab');
  assert.equal(bookmark.gx, 0);
  assert.equal(bookmark.w, 1);
  assert.equal(bookmark.createdAt, 1234);
  assert.equal(bookmark.updatedAt, 1234);
});

test('applying a preset preserves identity and layout', () => {
  const result = applyBookmarkPreset({
    id: 'existing',
    name: 'GitHub',
    url: 'https://github.com',
    gx: 4,
    gy: 2,
    backgroundColor: '#000000'
  }, {
    name: 'Ignored',
    gx: 0,
    backgroundColor: '#abcdef'
  });

  assert.equal(result.id, 'existing');
  assert.equal(result.name, 'GitHub');
  assert.equal(result.gx, 4);
  assert.equal(result.gy, 2);
  assert.equal(result.backgroundColor, '#abcdef');
});

test('URLs are normalized and unsupported protocols are rejected', () => {
  assert.equal(normalizeBookmarkUrl(' example.com '), 'https://example.com');
  assert.equal(normalizeBookmarkUrl('chrome://extensions'), 'chrome://extensions');

  assert.equal(validateBookmarkDraft({ name: 'Valid', url: 'example.com' }).isValid, true);
  assert.equal(validateBookmarkDraft({ name: '', url: 'example.com' }).errors.name, 'required');
  assert.equal(
    validateBookmarkDraft({ name: 'Unsafe', url: 'javascript:alert(1)' }).errors.url,
    'unsupportedProtocol'
  );
});

test('accepts device-local image references without placing image bytes in app data', () => {
  const localImage = 'newdesktab-local-image:4c5b9a2e-3f0e-4c7e-889c-72117afc09e9';

  assert.equal(validateBookmarkDraft({
    name: 'Local image',
    backgroundImageUrl: localImage
  }).isValid, true);
  assert.equal(validateFolderDraft({
    name: 'Local image folder',
    backgroundImageUrl: localImage
  }).isValid, true);
});

test('grid placement scans columns then rows and reports a full grid', () => {
  const bookmarks = [
    { id: 'a', gx: 0, gy: 0, w: 1, h: 1 },
    { id: 'b', gx: 0, gy: 1, w: 1, h: 1 },
    { id: 'c', gx: 1, gy: 0, w: 1, h: 1 }
  ];

  assert.deepEqual(findFirstFreeSlot(bookmarks, { columns: 2, rows: 2 }), { gx: 1, gy: 1 });
  assert.equal(isAreaFree(bookmarks, 1, 1), true);
  assert.equal(
    findFirstFreeSlot([...bookmarks, { id: 'd', gx: 1, gy: 1, w: 1, h: 1 }], {
      columns: 2,
      rows: 2
    }),
    null
  );
});
