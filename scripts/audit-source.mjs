import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve('.');
const output = resolve(process.argv[2] || 'dist/release-audit/source-audit.json');
async function filesIn(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  }))).flat();
}
const sourceFiles = await filesIn(resolve('src'));
const referenceFiles = [...sourceFiles.filter(path => /\.(?:js|html|json)$/.test(path)),
  ...(await filesIn(resolve('scripts'))).filter(path => /\.(?:mjs|js)$/.test(path))];
const references = await Promise.all(referenceFiles.map(async file => ({ file, text: await readFile(file, 'utf8') })));
const usageReferences = references.filter(item => item.file !== resolve('scripts/audit-source.mjs'));
const bundle = await build({ entryPoints: ['src/main.js', 'src/popup.js'], bundle: true,
  write: false, metafile: true, format: 'esm', outdir: 'dist/source-audit', logLevel: 'silent' });
const reachable = new Set(Object.keys(bundle.metafile.inputs).map(file => resolve(file)));
const modules = sourceFiles.filter(file => file.endsWith('.js'));
const unreachableModules = modules.filter(file => !reachable.has(file)
  && !file.includes(`${resolve('src/platform/backup/vendor')}`)
  && !file.includes(`${resolve('src/shared/urls/vendor')}`)).map(file => relative(root, file).replaceAll('\\', '/'));
const corpus = usageReferences.map(item => item.text).join('\n');
// These classes are built from bounded values, so literal searches cannot find them.
const dynamicClasses = [
  { names: ['manual-sequence-next'], file: 'src/features/help/manual.js', expression: 'manual-sequence-${direction}' },
  { names: ['editor-look-sample-original'], file: 'src/features/item-editor/itemAppearanceEditor.js', expression: 'editor-look-sample-${look}' },
  { names: ['editor-icon-group'], file: 'src/features/item-editor/itemAppearanceEditor.js', expression: 'editor-${name}-group' },
  { names: ['flash-success', 'flash-error', 'flash-info'], file: 'src/shared/ui/flash.js', expression: 'flash-${type}' },
  { names: ['newdesktab-themed-icon-dark', 'newdesktab-themed-icon-light'], file: 'src/shared/ui/svgIcons.js', expression: 'newdesktab-themed-icon-${theme}' }
];
const dynamicClassReferences = [];
const orphanClassCandidates = [];
for (const file of sourceFiles.filter(file => file.endsWith('.css'))) {
  const text = await readFile(file, 'utf8');
  const selectors = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, '')
    .replace(/"[^"\n]*"|'[^'\n]*'/g, '');
  for (const name of new Set([...selectors.matchAll(/\.([-_a-zA-Z][-_a-zA-Z\d]*)/g)].map(match => match[1]))) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(corpus)) {
      const dynamic = dynamicClasses.find(builder => builder.names.includes(name)
        && references.find(item => item.file === resolve(builder.file))?.text.includes(builder.expression));
      if (dynamic) {
        dynamicClassReferences.push({ name, file: dynamic.file, expression: dynamic.expression });
        continue;
      }
      const index = text.indexOf(`.${name}`);
      orphanClassCandidates.push({ file: relative(root, file).replaceAll('\\', '/'), name,
        line: text.slice(0, index).split('\n').length });
    }
  }
}
const exportCandidates = [];
const reviewedExports = [];
const retainedApis = {
  exportReferencedLocalVideos: 'Legacy JSON video-backup API, exercised by compatibility and migration tests.',
  registerWidget: 'Documented widget registration API, exercised by registry tests.'
};
for (const { file, text } of references.filter(item => item.file.endsWith('.js'))) {
  for (const match of text.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g)) {
    const name = match[1];
    const pattern = new RegExp(`\\b${name}\\b`, 'g');
    const external = usageReferences.some(item => item.file !== file && new RegExp(`\\b${name}\\b`).test(item.text));
    if (!external && [...text.matchAll(pattern)].length === 1) {
      const candidate = { file: relative(root, file).replaceAll('\\', '/'), name };
      if (retainedApis[name]) reviewedExports.push({ ...candidate, reason: retainedApis[name] });
      else exportCandidates.push(candidate);
    }
  }
}
const report = { entries: ['src/main.js', 'src/popup.js'], modules: modules.length,
  stylesheets: sourceFiles.filter(file => file.endsWith('.css')).length,
  reachableModules: modules.filter(file => reachable.has(file)).length, unreachableModules,
  orphanClassCandidates, dynamicClassReferences, exportCandidates, reviewedExports,
  note: 'Candidates require review of dynamic classes, public APIs, tests and assets before removal.' };
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
