import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import test from 'node:test';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

test('manifest uses the expected minimal Manifest V3 surface', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(Object.hasOwn(manifest, 'web_accessible_resources'), false);
  assert.equal(Object.hasOwn(manifest, 'web_accesible_resources'), false);
});

test('all manifest entry points exist', () => {
  assert.equal(existsSync(manifest.chrome_url_overrides.newtab), true);
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
  const contracts = languages.map(language => flattenKeys(JSON.parse(
    readFileSync(`src/js/lang/${language}.json`, 'utf8')
  )));

  assert.ok(contracts[0].includes('folder.actions.deleteBookmark'));
  for (const contract of contracts.slice(1)) {
    assert.deepEqual(contract, contracts[0]);
  }
});

test('bundled widget surfaces stay behind the catalog lifecycle', () => {
  const bootstrap = readFileSync('src/js/app/bootstrap.js', 'utf8');
  const newTab = readFileSync('src/newtab.html', 'utf8');
  const catalog = readFileSync('src/js/widgets/builtin/index.js', 'utf8');

  assert.doesNotMatch(bootstrap, /widgets\/builtin|clock/i);
  assert.doesNotMatch(newTab, /id="(?:add-clock|clock-widget-modal)"/);
  assert.match(catalog, /clockWidget/);
});

test('source modules resolve relative imports and do not contain static cycles', () => {
  const sourceRoot = resolve('src/js');
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

function listJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}

function readStaticDependencies(file) {
  const source = readFileSync(file, 'utf8');
  const staticImport = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  return Array.from(source.matchAll(staticImport), match => match[1])
    .filter(specifier => specifier.startsWith('.'))
    .map(specifier => resolve(dirname(file), specifier));
}
