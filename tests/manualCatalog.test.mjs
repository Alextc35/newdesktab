import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MANUAL_GROUPS, MANUAL_TOPICS, searchManual } from '../src/features/help/manualCatalog.js';

const languages = ['en', 'es', 'pt_BR'];
const translations = Object.fromEntries(await Promise.all(languages.map(async language => [language,
  JSON.parse(await readFile(new URL(`../src/lang/manual/${language}.json`, import.meta.url), 'utf8'))
])));
const translate = language => key => key.split('.').slice(1).reduce((value, part) => value?.[part], translations[language]);

test('all manual destinations resolve to complete localized sections', () => {
  const ids = MANUAL_TOPICS.map(topic => topic.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const language of languages) {
    assert.deepEqual(Object.keys(translations[language].topics).sort(), [...ids].sort());
    for (const topic of MANUAL_TOPICS) {
      assert.ok(MANUAL_GROUPS.includes(topic.group));
      assert.ok(topic.related.every(id => ids.includes(id) && id !== topic.id));
      const section = translations[language].topics[topic.id];
      assert.equal(section.steps.length, 3);
      for (const text of [section.title, section.summary, section.note, section.tip, ...section.steps]) {
        assert.equal(typeof text, 'string');
        assert.ok(text.trim().length > 0);
      }
    }
  }
});

test('every localized welcome step has explicit links to existing manual sections', async () => {
  const ids = MANUAL_TOPICS.map(topic => topic.id);
  for (const language of ['en', 'es', 'es_419', 'pt_BR']) {
    const content = JSON.parse(await readFile(new URL(`../src/lang/${language}.json`, import.meta.url), 'utf8'));
    for (const step of Object.values(content.onboarding.steps)) {
      const links = [...`${step.body} ${step.hint}`.matchAll(/\[\[([a-z-]+)\|([^\]]+)\]\]/gu)];
      assert.ok(links.length >= 2);
      assert.ok(links.every(match => ids.includes(match[1]) && match[2].trim()));
    }
  }
});

test('manual search includes instructions and accepts accents, case and multiple words', () => {
  assert.ok(searchManual('TAB flechas', translate('es')).some(topic => topic.id === 'keyboard'));
  assert.ok(searchManual('sincronizacion', translate('es')).some(topic => topic.id === 'sync'));
  assert.equal(searchManual('no existe este tema', translate('es')).length, 0);
  assert.equal(searchManual('   ', translate('en')).length, MANUAL_TOPICS.length);
});
