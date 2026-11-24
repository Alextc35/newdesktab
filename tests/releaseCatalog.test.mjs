import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { RELEASE_NOTES, getReleaseNotes } from '../src/features/release-notes/releaseCatalog.js';
import { compareVersions } from '../src/shared/data/compareVersions.js';
import { SUPPORTED_LANGUAGES } from '../src/domain/settings/languageCatalog.js';

test('numeric release ordering supports Chrome version components and rejects malformed versions', () => {
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0.0'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.0.1'), -1);
  for (const invalid of ['', '1.0.beta', '65536.0', '-1.0', '1.2.3.4.5', null]) {
    assert.equal(compareVersions(invalid, '1.0.0'), null);
  }
});

test('release notes controls have translations in every supported language', () => {
  for (const language of SUPPORTED_LANGUAGES) {
    const { releaseNotes } = JSON.parse(readFileSync(`src/lang/${language}.json`, 'utf8'));
    for (const key of ['settingsTitle', 'settingsDescription', 'open', 'history', 'dismiss', 'continue', 'back', 'highlights']) {
      assert.equal(typeof releaseNotes?.[key], 'string', `${language}: missing releaseNotes.${key}`);
      assert.ok(releaseNotes[key].trim(), `${language}: empty releaseNotes.${key}`);
    }
  }
});

test('every shipped release has an entry and translated paragraphs and highlights in every language', () => {
  const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
  assert.ok(RELEASE_NOTES.some(entry => entry.version === version), 'Add notes for the manifest version before shipping.');
  assert.equal(new Set(RELEASE_NOTES.map(entry => entry.version)).size, RELEASE_NOTES.length);
  for (const language of SUPPORTED_LANGUAGES) {
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
  assert.deepEqual(getReleaseNotes('1.1.2'), RELEASE_NOTES);
  assert.deepEqual(getReleaseNotes('1.1.1').map(entry => entry.version), ['1.1.1', '1.1.0', '1.0.1', '1.0.0']);
  assert.deepEqual(getReleaseNotes('1.1.0').map(entry => entry.version), ['1.1.0', '1.0.1', '1.0.0']);
  assert.deepEqual(getReleaseNotes('1.0.1').map(entry => entry.version), ['1.0.1', '1.0.0']);
  assert.deepEqual(getReleaseNotes('1.0.0').map(entry => entry.version), ['1.0.0']);
  const newer = getReleaseNotes('1.0.2');
  assert.equal(newer[0].version, '1.0.2');
  assert.equal(newer[0].translation, 'releaseNotes.generic');
  assert.equal(newer[1].version, '1.0.1');
  assert.equal(newer[2].version, '1.0.0');
  assert.equal(getReleaseNotes('0.9.9').some(entry => entry.version === '1.0.0'), false);
  assert.throws(() => getReleaseNotes('invalid'), /Invalid release/);
});
