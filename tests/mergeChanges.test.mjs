import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeChanges } from '../src/shared/data/mergeChanges.js';

test('an uncontested replacement retains the requested collection order', () => {
  const base = { bookmarks: [{ id: 'a' }, { id: 'b' }] };
  const next = { bookmarks: [{ id: 'b' }, { id: 'a' }] };
  assert.deepEqual(mergeChanges(base, next, base), next);
});

test('independent creations survive stale snapshots in every record collection', () => {
  for (const key of ['bookmarks', 'folders', 'widgets', 'trash', 'bookmarkGroups', 'bookmarkPresets']) {
    const first = { id: 'first', name: 'First' };
    const second = { id: 'second', name: 'Second' };
    assert.deepEqual(mergeChanges({ [key]: [] }, { [key]: [second] }, { [key]: [first] }), {
      [key]: [first, second]
    });
  }
});

test('different fields merge, stale edits do not resurrect deletions, and unseen additions survive deletion', () => {
  const original = { id: 'a', name: 'Original', url: 'https://old.example' };
  const base = { bookmarks: [original], settings: { theme: { color: 'red' }, language: 'en' } };
  const next = { bookmarks: [{ ...original, name: 'Renamed' }], settings: { ...base.settings, language: 'es' } };
  const latest = { bookmarks: [{ ...original, url: 'https://new.example' }], settings: { ...base.settings, theme: { color: 'blue' } } };
  assert.deepEqual(mergeChanges(base, next, latest), {
    bookmarks: [{ ...original, name: 'Renamed', url: 'https://new.example' }],
    settings: { language: 'es', theme: { color: 'blue' } }
  });
  assert.deepEqual(mergeChanges(base, next, { ...latest, bookmarks: [] }).bookmarks, []);
  assert.deepEqual(mergeChanges(base, { ...base, bookmarks: [] }, {
    ...latest, bookmarks: [...latest.bookmarks, { id: 'b' }]
  }).bookmarks, [{ id: 'b' }]);
});
