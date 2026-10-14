import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const artifactRoot = resolve('dist');
mkdirSync(artifactRoot, { recursive: true });
const generatorSource = readFileSync('scripts/generate-locales.mjs', 'utf8');

function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(artifactRoot, 'locale-generator-test-'));
  t.after(() => {
    const target = resolve(root);
    const inside = relative(artifactRoot, target);
    assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside));
    assert.ok(basename(target).startsWith('locale-generator-test-'));
    rmSync(target, { recursive: true, force: true });
  });
  const write = (path, value) => {
    const target = join(root, path);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const ui = { greeting: 'Hello' };
  const manual = { demo: { labels: { currentLanguage: 'English', keyboardQuery: 'keyboard' },
    topics: { learning: ['First', 'Type keyb', 'Last'] } }, daily: { read: 'Show me how' } };
  const metadata = { extensionName: { message: 'New DeskTab' }, extensionDescription: { message: 'Organize your bookmarks.' } };
  write('scripts/generate-locales.mjs', generatorSource);
  write('scripts/locale-overrides.json', overrides);
  write('src/domain/settings/languageCatalog.js', "export const LANGUAGE_CATALOG = [{code:'am',name:'አማርኛ'}];");
  write('src/lang/en.json', ui);
  write('src/lang/manual/en.json', manual);
  write('_locales/en/messages.json', metadata);
  const strings = value => typeof value === 'string' ? [value] : Object.values(value).flatMap(strings);
  const cache = Object.fromEntries([...strings(ui), ...strings(manual), ...strings(metadata),
    'Customizable new tab for bookmarks and folders.'].map(text => [text, text]));
  write('dist/translation-cache/am.json', cache);
  write('no-network.mjs', "globalThis.fetch = () => { throw new Error('Unexpected network request'); };");
  return {
    root, write,
    run: () => spawnSync(process.execPath, ['--import', pathToFileURL(join(root, 'no-network.mjs')).href,
      join(root, 'scripts/generate-locales.mjs')], { cwd: root, encoding: 'utf8' })
  };
}

test('invalid curated corrections stop generation before writing locale files', t => {
  const { root, write, run } = fixture(t);
  write('scripts/locale-overrides.json', '{broken json');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SyntaxError/u);
  assert.doesNotMatch(result.stderr, /Unexpected network request/u);
  assert.equal(existsSync(join(root, 'src/lang/am.json')), false);
});

test('a damaged translation cache is reported rather than replaced with automatic translations', t => {
  const { root, write, run } = fixture(t);
  write('dist/translation-cache/am.json', '{broken json');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SyntaxError/u);
  assert.doesNotMatch(result.stderr, /Unexpected network request/u);
  assert.equal(existsSync(join(root, 'src/lang/am.json')), false);
});

test('a reviewed Store description over the limit cannot produce an invalid locale package', t => {
  const { root, run } = fixture(t, { am: { metadata: { 'extensionDescription.message': 'x'.repeat(133) } } });
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Long description: am/u);
  assert.doesNotMatch(result.stderr, /Unexpected network request/u);
  assert.equal(existsSync(join(root, '_locales/am/messages.json')), false);
  assert.equal(existsSync(join(root, 'src/lang/am.json')), false);
});
