import { compareVersions } from '../../shared/data/compareVersions.js';

/** Add a localized entry here whenever the extension manifest version changes. */
export const RELEASE_NOTES = [{
  version: '1.0.0',
  date: '2026-10-12',
  translation: 'releaseNotes.v1_0_0',
  paragraphs: ['thanks', 'origin', 'desktop', 'closing'],
  highlights: ['workspace', 'appearance', 'search', 'backup', 'sync', 'help']
}];

/** Never show notes for a version newer than the installed extension. */
export function getReleaseNotes(version) {
  if (compareVersions(version, version) === null) throw new TypeError('Invalid release version.');
  const entries = RELEASE_NOTES.filter(entry => compareVersions(entry.version, version) <= 0)
    .toSorted((a, b) => compareVersions(b.version, a.version));
  if (!entries.some(entry => compareVersions(entry.version, version) === 0)) {
    entries.unshift({ version, date: null, translation: 'releaseNotes.generic',
      paragraphs: ['description'], highlights: [] });
  }
  return entries;
}
