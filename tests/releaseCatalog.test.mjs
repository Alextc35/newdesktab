import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { RELEASE_NOTES, getReleaseNotes } from '../src/features/release-notes/releaseCatalog.js';
import { compareVersions } from '../src/shared/data/compareVersions.js';

test('numeric release ordering supports Chrome version components and rejects malformed versions', () => {
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0.0'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.0.1'), -1);
  for (const invalid of ['', '1.0.beta', '65536.0', '-1.0', '1.2.3.4.5', null]) {
    assert.equal(compareVersions(invalid, '1.0.0'), null);
  }
});

test('every shipped release has an entry and translated paragraphs and highlights in every language', () => {
  const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
  assert.ok(RELEASE_NOTES.some(entry => entry.version === version), 'Add notes for the manifest version before shipping.');
  assert.equal(new Set(RELEASE_NOTES.map(entry => entry.version)).size, RELEASE_NOTES.length);
  for (const language of ['en', 'es', 'es_419', 'pt_BR']) {
    const dictionary = JSON.parse(readFileSync(`src/lang/${language}.json`, 'utf8'));
    for (const entry of RELEASE_NOTES) {
      assert.equal(compareVersions(entry.version, entry.version), 0);
      const notes = entry.translation.split('.').reduce((value, key) => value?.[key], dictionary);
      assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(notes?.title, `${language}: missing release title`);
      for (const paragraph of entry.paragraphs) assert.ok(notes[paragraph], `${language}: ${paragraph}`);
      for (const highlight of entry.highlights) assert.ok(notes.highlights[highlight], `${language}: ${highlight}`);
    }
  }
});

test('history excludes future notes and a missing entry still describes the installed version', () => {
  assert.deepEqual(getReleaseNotes('1.0.0'), RELEASE_NOTES);
  const newer = getReleaseNotes('1.0.1');
  assert.equal(newer[0].version, '1.0.1');
  assert.equal(newer[0].translation, 'releaseNotes.generic');
  assert.equal(newer[1].version, '1.0.0');
  assert.equal(getReleaseNotes('0.9.9').some(entry => entry.version === '1.0.0'), false);
  assert.throws(() => getReleaseNotes('invalid'), /Invalid release/);
});
