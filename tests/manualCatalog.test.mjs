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
      for (const text of [section.title, section.question, section.searchTerms, section.summary, section.note, section.tip, ...section.steps]) {
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

test('manual search ranks the intended help for natural questions in every language', () => {
  const questions = {
    es: {
      'como navegar sin raton': 'keyboard',
      'quiero agrandar un favorito': 'resizing',
      'no puedo soltar en una celda ocupada': 'drag-modes',
      'recuperar un favorito que he borrado': 'trash',
      'como guardar la pagina actual': 'quick-save',
      'volver atras el ultimo cambio': 'history',
      'como cambiar color carpeta': 'appearance',
      'llevar mis datos a otro navegador': 'backup',
      'quiero quitar los consejos': 'learning',
      'como crear un nuevo espacio para el trabajo': 'workspaces'
    },
    en: {
      'how can I resize a tile': 'resizing',
      'how do I navigate without a mouse': 'keyboard',
      'recover accidentally deleted bookmarks': 'trash',
      'I want to save the page I am visiting': 'quick-save',
      'turn off daily tips': 'learning',
      'backup to another browser': 'backup',
      'my grid disappeared in a small window': 'compact'
    },
    pt_BR: {
      'como navegar sem mouse': 'keyboard',
      'quero aumentar o tamanho de um favorito': 'resizing',
      'recuperar favorito apagado': 'trash',
      'como mudar a cor de uma pasta': 'appearance',
      'usar em outro computador': 'sync'
    }
  };
  for (const [language, queries] of Object.entries(questions)) {
    for (const [query, id] of Object.entries(queries)) {
      assert.equal(searchManual(query, translate(language))[0]?.id, id, `${language}: ${query}`);
    }
  }
});

test('manual search handles partial words and minor spelling errors without irrelevant filler', () => {
  assert.equal(searchManual('redim', translate('es'))[0].id, 'resizing');
  assert.equal(searchManual('sincronisacion', translate('es'))[0].id, 'sync');
  assert.deepEqual(searchManual('recuperar un favorito que he borrado', translate('es')).map(topic => topic.id), ['trash']);
  assert.deepEqual(searchManual('astronaut volcano submarine', translate('en')), []);
});
