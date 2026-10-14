import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { LANGUAGE_CATALOG, SUPPORTED_LANGUAGES, getLanguageDirection, getLanguageSearchTerms } from '../src/domain/settings/languageCatalog.js';
import { resolveLanguage, normalizeLanguagePreference } from '../src/domain/settings/interfacePreferences.js';
import { searchManual } from '../src/features/help/manualCatalog.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const flatten = (value, prefix = '') => typeof value === 'string' ? [[prefix, value]]
  : Object.entries(value).flatMap(([key, child]) => flatten(child, `${prefix}.${key}`));
const variables = text => [...text.matchAll(/\{\{\w+\}\}/gu)].map(match => match[0]).sort();
const destinations = text => [...text.matchAll(/\[\[([a-z-]+)\|[^\]]+\]\]/gu)].map(match => match[1]).sort();

test('every selectable language ships a complete interface, manual and Chrome locale offline', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 52);
  assert.equal(new Set(SUPPORTED_LANGUAGES).size, SUPPORTED_LANGUAGES.length);
  assert.deepEqual(readdirSync('src/lang').filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)).sort(), [...SUPPORTED_LANGUAGES].sort());
  assert.deepEqual(readdirSync('_locales', { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => entry.name).sort(), [...SUPPORTED_LANGUAGES].sort());
  for (const directory of ['src/lang', 'src/lang/manual']) {
    const source = flatten(read(`${directory}/en.json`)).sort(([a], [b]) => a.localeCompare(b));
    for (const code of SUPPORTED_LANGUAGES) {
      const manualCode = directory.endsWith('manual') && code === 'es_419' ? 'es' : code;
      const entries = flatten(read(`${directory}/${manualCode}.json`)).sort(([a], [b]) => a.localeCompare(b));
      assert.deepEqual(entries.map(([key]) => key), source.map(([key]) => key), `${directory}/${code}: keys`);
      for (const [index, [key, value]] of entries.entries()) {
        const original = source[index][1];
        assert.ok(value.trim(), `${code}${key}: empty`);
        assert.deepEqual(variables(value), variables(original), `${code}${key}: variables`);
        assert.deepEqual(destinations(value), destinations(original), `${code}${key}: manual links`);
        assert.doesNotMatch(value, /__NDT_|XQZPROTECTED|ZXQ|[\uE000-\uE002]/u, `${code}${key}: translation marker`);
      }
    }
  }
  for (const code of SUPPORTED_LANGUAGES) {
    const metadata = read(`_locales/${code}/messages.json`);
    assert.equal(metadata.extensionName.message, 'New DeskTab');
    assert.ok(metadata.extensionDescription.message.trim(), `${code}: empty Store description`);
    assert.ok(metadata.extensionDescription.message.length <= 132);
    assert.equal(normalizeLanguagePreference(code), code);
    assert.equal(resolveLanguage('system', code), code);
  }
});

test('language search recognizes countries, translated names, codes and native names', () => {
  const german = LANGUAGE_CATALOG.find(language => language.code === 'de');
  const terms = getLanguageSearchTerms(german, 'es');
  for (const expected of ['Deutsch', 'alemán', 'Alemania', 'Germany', 'de']) assert.ok(terms.includes(expected), expected);
  const chinese = LANGUAGE_CATALOG.find(language => language.code === 'zh_TW');
  assert.ok(getLanguageSearchTerms(chinese, 'es').includes('Taiwán'));
  assert.equal(getLanguageDirection('ar'), 'rtl');
  assert.equal(getLanguageDirection('he'), 'rtl');
  assert.equal(getLanguageDirection('fa'), 'rtl');
  assert.equal(getLanguageDirection('ja'), 'ltr');
});

test('the manual finds keyboard help using its actual translated demo query in every language', () => {
  for (const code of SUPPORTED_LANGUAGES) {
    const dictionary = read(`src/lang/manual/${code === 'es_419' ? 'es' : code}.json`);
    const translate = key => key.split('.').slice(1).reduce((value, part) => value?.[part], dictionary);
    const query = dictionary.demo.labels.keyboardQuery;
    assert.ok(searchManual(query, translate).some(topic => topic.id === 'keyboard'), `${code}: ${query}`);
  }
});

test('reviewed counter messages keep their variables and translate their connecting words', () => {
  for (const code of ['el', 'kn', 'ml', 'sw', 'ta', 'te']) {
    const dictionary = read(`src/lang/${code}.json`);
    assert.ok(!dictionary.settingsModal.sync.usage.summary.includes(' of '), code);
  }
  for (const code of ['ml', 'ta', 'te']) {
    assert.ok(!read(`src/lang/${code}.json`).recycleBin.folderContents.includes('bookmarks'), code);
  }
});
