import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLanguage } from '../src/domain/settings/interfacePreferences.js';
import { SUPPORTED_LANGUAGES } from '../src/domain/settings/languageCatalog.js';
import {
  createBackupEnvelope,
  migratePersistedData,
  parseBackupPayload
} from '../src/platform/storage/dataSchema.js';

test('automatic language resolves supported device locales and falls back to English', () => {
  for (const [locale, expected] of [
    ['en-GB', 'en'], ['es', 'es'], ['es-ES', 'es'], ['es-MX', 'es_419'],
    ['es_419', 'es_419'], ['es-AR', 'es_419'], ['es-Latn-CO', 'es_419'],
    ['pt-BR', 'pt_BR'], ['pt-PT', 'pt_PT'], ['pt-AO', 'pt_PT'], ['fr-FR', 'fr'], ['ja-JP', 'ja'],
    ['zh-CN', 'zh_CN'], ['zh-TW', 'zh_TW'], ['zh-HK', 'zh_TW'], ['zh-Hant', 'zh_TW'],
    ['zh-Hant-CN', 'zh_TW'], ['zh-Hans-HK', 'zh_CN'], ['nb-NO', 'no'], ['tl-PH', 'fil'],
    ['ar-SA', 'ar'], ['hi-IN', 'hi'], ['iw-IL', 'he'], ['unsupported', 'en'],
    ['', 'en'], [undefined, 'en']
  ]) assert.equal(resolveLanguage('system', locale), expected, locale);
});

test('an explicit language takes priority over the device language', () => {
  for (const language of SUPPORTED_LANGUAGES) {
    assert.equal(resolveLanguage(language, 'fr-FR'), language);
    assert.equal(resolveLanguage(language, 'es-MX'), language);
  }
});

test('new preferences default to system and preserve existing choices and wallpaper', () => {
  const initial = migratePersistedData({ bookmarks: [] });
  assert.equal(initial.settings.language, 'system');
  assert.equal(initial.settings.interfaceTheme, 'system');
  const legacy = migratePersistedData({
    bookmarks: [],
    settings: { language: 'en', theme: { backgroundImageUrl: 'https://example.test/image.gif' } }
  });
  assert.equal(legacy.settings.language, 'en');
  assert.equal(legacy.settings.interfaceTheme, 'system');
  assert.equal(legacy.settings.theme.backgroundImageUrl, 'https://example.test/image.gif');
  for (const interfaceTheme of ['system', 'light', 'dark']) {
    const data = migratePersistedData({ ...legacy, settings: { ...legacy.settings, interfaceTheme } });
    assert.equal(data.settings.interfaceTheme, interfaceTheme);
    assert.deepEqual(parseBackupPayload(createBackupEnvelope(data)), data);
  }
});

test('invalid persisted preferences become automatic preferences', () => {
  const { settings } = migratePersistedData({
    settings: { language: '../unavailable', interfaceTheme: null }
  });
  assert.equal(settings.language, 'system');
  assert.equal(settings.interfaceTheme, 'system');
});
