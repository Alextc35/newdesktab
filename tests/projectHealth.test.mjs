import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import test from 'node:test';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

test('manifest uses the expected minimal Manifest V3 surface', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
  assert.equal(Object.hasOwn(manifest, 'web_accessible_resources'), false);
  assert.equal(Object.hasOwn(manifest, 'web_accesible_resources'), false);
});

test('all manifest entry points exist', () => {
  assert.equal(existsSync(manifest.chrome_url_overrides.newtab), true);
  assert.equal(existsSync(manifest.action.default_popup), true);
  for (const icon of Object.values(manifest.icons)) {
    assert.equal(existsSync(icon), true, `Missing manifest icon: ${icon}`);
  }
});

test('all interface languages expose the same translation contract', () => {
  const languages = ['en', 'es', 'es_419', 'pt_BR'];
  const flattenKeys = (value, prefix = '') => Object.entries(value).flatMap(
    ([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === 'object'
        ? flattenKeys(child, path)
        : [path];
    }
  ).sort();
  const dictionaries = languages.map(language => JSON.parse(
    readFileSync(`src/lang/${language}.json`, 'utf8')
  ));
  const contracts = dictionaries.map(dictionary => flattenKeys(dictionary));

  assert.ok(contracts[0].includes('folder.actions.deleteBookmark'));
  for (const contract of contracts.slice(1)) {
    assert.deepEqual(contract, contracts[0]);
  }
  assert.deepEqual(dictionaries.map(dictionary => dictionary.launcher.bookmark), [
    'Bookmark', 'Favorito', 'Marcador', 'Favorito'
  ]);
  assert.deepEqual(dictionaries.map(dictionary => dictionary.launcher.folder), [
    'Folder', 'Carpeta', 'Carpeta', 'Pasta'
  ]);
});

test('bundled widget surfaces stay behind the catalog lifecycle', () => {
  const bootstrap = readFileSync('src/app/bootstrap.js', 'utf8');
  const newTab = readFileSync('src/newtab.html', 'utf8');
  const bundledCatalog = readFileSync('src/widgets/builtin/index.js', 'utf8');
  const widgetCatalog = readFileSync('src/widgets/widgetCatalog.js', 'utf8');

  assert.doesNotMatch(bootstrap, /widgets\/builtin|clock/i);
  assert.doesNotMatch(newTab, /id="(?:add-clock|clock-widget-modal)"/);
  assert.match(newTab, /id="add-widgets"/);
  assert.doesNotMatch(widgetCatalog, /clock/i);
  assert.match(bundledCatalog, /clockWidget/);
});

test('the transitional ui directory has no remaining source modules', () => {
  assert.equal(existsSync('src/ui'), false);
});

test('the transitional core directory has been retired', () => {
  assert.equal(existsSync('src/core'), false);
});

test('the transitional css directory has been retired', () => {
  assert.equal(existsSync('src/css'), false);
});

test('the temporary JavaScript wrapper has been retired', () => {
  assert.equal(existsSync('src/js'), false);
  for (const boundary of [
    'app',
    'domain',
    'features',
    'lang',
    'platform',
    'shared',
    'state',
    'types',
    'widgets'
  ]) {
    assert.equal(existsSync(`src/${boundary}`), true, `Missing source boundary: ${boundary}`);
  }
  assert.equal(existsSync('src/main.js'), true);
});

test('the stylesheet entries reach every source stylesheet without broken imports or cycles', () => {
  const sourceRoot = resolve('src');
  const entries = [resolve('src/styles/main.css'), resolve('src/styles/popup.css')];
  const stylesheets = listFilesByExtension(sourceRoot, '.css');
  const visited = new Set();
  const active = new Set();
  const stack = [];

  const visit = file => {
    assert.equal(existsSync(file), true, `Missing stylesheet: ${relative(sourceRoot, file)}`);
    if (visited.has(file)) return;
    active.add(file);
    stack.push(file);

    for (const dependency of readStylesheetDependencies(file)) {
      assert.equal(
        existsSync(dependency),
        true,
        `Missing stylesheet imported by ${relative(sourceRoot, file)}: ${dependency}`
      );
      if (active.has(dependency)) {
        const start = stack.indexOf(dependency);
        const cycle = [...stack.slice(start), dependency]
          .map(item => relative(sourceRoot, item).replaceAll('\\', '/'));
        assert.fail(`Stylesheet cycle: ${cycle.join(' -> ')}`);
      }
      visit(dependency);
    }

    stack.pop();
    active.delete(file);
    visited.add(file);
  };

  for (const entry of entries) visit(entry);
  assert.deepEqual(
    [...visited].sort(),
    stylesheets.sort(),
    'Every source stylesheet must be reachable from src/styles/main.css'
  );
  assert.match(readFileSync('src/newtab.html', 'utf8'), /href="\.\/styles\/main\.css"/);
  assert.match(readFileSync('src/popup.html', 'utf8'), /href="\.\/styles\/popup\.css"/);
  assert.match(
    readFileSync('tests/browser-harness.html', 'utf8'),
    /href="\.\.\/src\/styles\/main\.css"/
  );
});

test('literal DOM id contracts stay aligned across modules and stylesheets', () => {
  const sourceRoot = resolve('src');
  const markupFiles = [
    ...listJavaScriptFiles(sourceRoot),
    ...listFilesByExtension(sourceRoot, '.html')
  ];
  const declaredIds = new Set(markupFiles.flatMap(file => {
    const source = readFileSync(file, 'utf8');
    return [
      ...Array.from(source.matchAll(/\bid\s*=\s*['"]([^'"]+)['"]/g), match => match[1]),
      ...Array.from(source.matchAll(/\bhtmlFor\s*=\s*['"]([^'"]+)['"]/g), match => match[1])
    ];
  }));

  for (const file of markupFiles) {
    const source = readFileSync(file, 'utf8');
    const referencedIds = [
      ...Array.from(
        source.matchAll(/getElementById\(\s*['"]([^'"]+)['"]/g),
        match => match[1]
      ),
      ...Array.from(
        source.matchAll(/querySelector(?:All)?\(\s*['"]#([A-Za-z_][\w-]*)/g),
        match => match[1]
      )
    ];
    for (const id of referencedIds) {
      assert.equal(
        declaredIds.has(id),
        true,
        `Undeclared DOM id referenced by ${relative(sourceRoot, file)}: #${id}`
      );
    }
  }

  for (const file of listFilesByExtension(sourceRoot, '.css')) {
    const source = readFileSync(file, 'utf8');
    const selectorIds = Array.from(
      source.matchAll(/#([A-Za-z_][\w-]*-[\w-]+)/g),
      match => match[1]
    );
    for (const id of selectorIds) {
      assert.equal(
        declaredIds.has(id),
        true,
        `Undeclared DOM id styled by ${relative(sourceRoot, file)}: #${id}`
      );
    }
  }
});

test('source modules resolve relative imports and do not contain static cycles', () => {
  const sourceRoot = resolve('src');
  const files = listJavaScriptFiles(sourceRoot);
  const knownFiles = new Set(files);
  const graph = new Map(files.map(file => {
    const dependencies = readStaticDependencies(file);
    for (const dependency of dependencies) {
      assert.equal(
        existsSync(dependency),
        true,
        `Missing module imported by ${relative(sourceRoot, file)}: ${dependency}`
      );
    }
    return [file, dependencies.filter(dependency => knownFiles.has(dependency))];
  }));
  const visited = new Set();
  const active = new Set();
  const stack = [];

  const visit = file => {
    if (visited.has(file)) return;
    active.add(file);
    stack.push(file);

    for (const dependency of graph.get(file)) {
      if (active.has(dependency)) {
        const start = stack.indexOf(dependency);
        const cycle = [...stack.slice(start), dependency]
          .map(item => relative(sourceRoot, item).replaceAll('\\', '/'));
        assert.fail(`Static module cycle: ${cycle.join(' -> ')}`);
      }
      visit(dependency);
    }

    stack.pop();
    active.delete(file);
    visited.add(file);
  };

  for (const file of files) visit(file);
});

test('domain dependencies stay portable and shared mechanisms do not own item editors', () => {
  const root = resolve('src');
  const files = listJavaScriptFiles(root);
  const graph = new Map(files.map(file => [file, readStaticDependencies(file)]));
  const owner = file => relative(root, file).replaceAll('\\', '/').split('/')[0];
  const visit = (file, origin, visited = new Set()) => {
    if (visited.has(file)) return;
    visited.add(file);
    assert.ok(['domain', 'shared', 'types'].includes(owner(file)),
      `Domain module ${relative(root, origin)} depends on runtime module ${relative(root, file)}`);
    for (const dependency of graph.get(file) ?? []) visit(dependency, origin, visited);
  };
  for (const file of files.filter(file => owner(file) === 'domain')) visit(file, file);
  for (const file of files.filter(file => owner(file) === 'shared')) {
    for (const dependency of graph.get(file)) {
      const path = relative(root, dependency).replaceAll('\\', '/');
      assert.doesNotMatch(path, /^(?:app|features|state|widgets)\//,
        `Shared module ${relative(root, file)} depends on application behavior: ${path}`);
      assert.doesNotMatch(path, /^domain\/(?:bookmarks|folders|recycle-bin)\//,
        `Item-specific rules need a feature owner: ${relative(root, file)} -> ${path}`);
    }
  }
});

function listJavaScriptFiles(directory) {
  return listFilesByExtension(directory, '.js');
}

function listFilesByExtension(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listFilesByExtension(path, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [path] : [];
  });
}

function readStaticDependencies(file) {
  const source = readFileSync(file, 'utf8');
  const staticImport = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  return Array.from(source.matchAll(staticImport), match => match[1])
    .filter(specifier => specifier.startsWith('.'))
    .map(specifier => resolve(dirname(file), specifier));
}

function readStylesheetDependencies(file) {
  const source = readFileSync(file, 'utf8');
  const stylesheetImport = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g;
  return Array.from(source.matchAll(stylesheetImport), match => match[1])
    .filter(specifier => specifier.startsWith('.'))
    .map(specifier => resolve(dirname(file), specifier));
}
