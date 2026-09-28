import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLanguage } from '../src/domain/settings/interfacePreferences.js';
import {
  createBackupEnvelope,
  migratePersistedData,
  parseBackupPayload
} from '../src/platform/storage/dataSchema.js';

test('automatic language resolves supported device locales and falls back to English', () => {
  for (const [locale, expected] of [
    ['en-GB', 'en'], ['es', 'es'], ['es-ES', 'es'], ['es-MX', 'es_419'],
    ['es_419', 'es_419'], ['es-AR', 'es_419'], ['es-Latn-CO', 'es_419'],
    ['pt-BR', 'pt_BR'], ['pt-PT', 'pt_BR'], ['fr-FR', 'en'], ['ja-JP', 'en'],
    ['', 'en'], [undefined, 'en']
  ]) assert.equal(resolveLanguage('system', locale), expected, locale);
});

test('an explicit language takes priority over the device language', () => {
  for (const language of ['en', 'es', 'es_419', 'pt_BR']) {
    assert.equal(resolveLanguage(language, 'fr-FR'), language);
    assert.equal(resolveLanguage(language, 'es-MX'), language);
  }
});

test('new preferences default to system and preserve existing choices and wallpaper', () => {
  const initial = migratePersistedData({ bookmarks: [] });
  assert.equal(initial.settings.language, 'system');
  assert.equal(initial.settings.interfaceTheme, 'system');
  const legacy = migratePersistedData({
    schemaVersion: 7, bookmarks: [],
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
