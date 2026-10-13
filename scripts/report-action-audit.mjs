import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const directory = resolve(process.argv[2] || 'dist/release-audit/final-actions');
const output = resolve(process.argv[3] || 'dist/release-audit/final-actions-summary.json');
const directories = [directory, ...process.argv.slice(4).map(path => resolve(path))];
const records = (await Promise.all(directories.map(async directory => Promise.all(
  (await readdir(directory)).filter(name => name.endsWith('.json'))
    .map(async name => JSON.parse(await readFile(resolve(directory, name), 'utf8')))
)))).flat();
const seenTests = new Set();
for (const { file, title } of records) {
  const key = `${file}\n${title}`;
  if (seenTests.has(key)) throw new Error(`Duplicate test in audit inputs: ${file} · ${title}`);
  seenTests.add(key);
}
const groups = new Map();
const uiGroups = new Map();
const files = new Map();
const coverage = { javascript: new Map(), styles: new Map() };
for (const record of records) {
  files.set(record.file, (files.get(record.file) || 0) + 1);
  for (const response of record.uiResponses ?? []) {
    const key = `${response.event} · ${response.control}`;
    if (!uiGroups.has(key)) uiGroups.set(key, []);
    uiGroups.get(key).push(response.frameMs);
  }
  for (const timing of record.timings) {
    const context = timing.details.modal ?? timing.details.action;
    const key = [timing.label, context].filter(Boolean).join(' · ');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(timing);
  }
  for (const type of Object.keys(coverage)) {
    for (const entry of record[type]) {
      const path = new URL(entry.url).pathname;
      if (!coverage[type].has(path)) coverage[type].set(path, { length: (entry.text ?? entry.source ?? '').length,
        ranges: [], functions: new Map() });
      const target = coverage[type].get(path);
      if (type === 'styles') target.ranges.push(...entry.ranges);
      else for (const fn of entry.functions) {
        const range = fn.ranges[0];
        const key = `${range.startOffset}:${range.endOffset}`;
        target.functions.set(key, target.functions.get(key) || range.count > 0);
      }
    }
  }
}
function coveredLength(ranges) {
  let end = 0;
  let covered = 0;
  for (const range of ranges.sort((a, b) => a.start - b.start || b.end - a.end)) {
    covered += Math.max(0, range.end - Math.max(end, range.start));
    end = Math.max(end, range.end);
  }
  return covered;
}
const round = value => Number(value.toFixed(2));
const actions = [...groups].map(([action, timings]) => {
  const successful = timings.filter(timing => timing.status === 'ok');
  const sorted = successful.map(timing => timing.durationMs).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { action, samples: sorted.length, errors: timings.filter(timing => timing.status === 'error').length,
    medianMs: sorted.length ? round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null,
    p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null,
    maxMs: sorted.at(-1) ?? null };
}).sort((a, b) => a.action.localeCompare(b.action));
const summarizeCoverage = (entries, type) => {
  if (type === 'javascript') {
    const modules = [...entries].map(([file, entry]) => ({ file, functions: entry.functions.size,
      exercisedFunctions: [...entry.functions.values()].filter(Boolean).length }));
    const functions = modules.reduce((sum, module) => sum + module.functions, 0);
    const exercisedFunctions = modules.reduce((sum, module) => sum + module.exercisedFunctions, 0);
    return { files: modules.length, functions, exercisedFunctions,
      exercisedPercent: round(100 * exercisedFunctions / functions), modules };
  }
  const modules = [...entries].map(([file, entry]) => ({ file, characters: entry.length,
    exercisedCharacters: coveredLength(entry.ranges) }));
  const characters = modules.reduce((sum, module) => sum + module.characters, 0);
  const exercisedCharacters = modules.reduce((sum, module) => sum + module.exercisedCharacters, 0);
  return { files: modules.length, characters, exercisedCharacters,
    exercisedPercent: round(100 * exercisedCharacters / characters), modules };
};
const report = {
  tests: records.length, passed: records.filter(record => record.status === 'passed').length,
  failed: records.filter(record => record.status !== 'passed').map(({ file, title, status }) => ({ file, title, status })),
  testFiles: Object.fromEntries([...files].sort()),
  timingRecords: records.reduce((sum, record) => sum + record.timings.length, 0), actions,
  uiResponses: [...uiGroups].map(([control, values]) => {
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    return { control, samples: values.length, medianFrameMs: round(median),
      p95FrameMs: round(values[Math.ceil(values.length * .95) - 1]) };
  }).sort((a, b) => a.control.localeCompare(b.control)),
  coverage: {
    ...Object.fromEntries(Object.entries(coverage).map(([type, entries]) => [type, summarizeCoverage(entries, type)])),
    applicationJavascript: summarizeCoverage(new Map([...coverage.javascript]
      .filter(([file]) => !file.includes('/vendor/'))), 'javascript')
  },
  scope: 'Primary Chromium test pages only. Debug enabled except Debug/idle-performance tests. UI response is event capture to two animation frames, not asynchronous action completion. Coverage is observed execution, not proof that unexercised code or CSS is obsolete. External extension contexts are verified separately.'
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  '# Tiempos de las acciones auditadas', '',
  `${report.passed}/${report.tests} E2E correctos; ${report.timingRecords} registros de Debug.`, '',
  'Los tiempos de Debug incluyen el trabajo indicado por cada operación. Los comandos persistidos incluyen cola y escritura. Los errores registrados pertenecen a recorridos que también comprueban fallos y recuperación; su estado E2E se informa por separado.', '',
  '| Operación | Muestras correctas | Mediana ms | P95 ms | Máximo ms | Registros de error |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...actions.map(action => `| ${action.action} | ${action.samples} | ${action.medianMs ?? '—'} | ${action.p95Ms ?? '—'} | ${action.maxMs ?? '—'} | ${action.errors} |`), '',
  '## Alcance', '', report.scope, ''
].join('\n');
await writeFile(output.replace(/\.json$/, '.md'), markdown);
const csvQuote = value => `"${String(value).replaceAll('"', '""')}"`;
await writeFile(output.replace(/\.json$/, '-ui-responses.csv'), [
  'control,samples,medianFrameMs,p95FrameMs',
  ...report.uiResponses.map(row => [row.control, row.samples, row.medianFrameMs, row.p95FrameMs].map(csvQuote).join(',')), ''
].join('\n'));
console.log(JSON.stringify({ tests: report.tests, passed: report.passed, failed: report.failed,
  timingRecords: report.timingRecords, actions: report.actions.length,
  coverage: Object.fromEntries(Object.entries(report.coverage).map(([key, value]) => [key,
    { files: value.files, exercisedPercent: value.exercisedPercent }])),
  slowest: actions.filter(action => action.samples >= 5).sort((a, b) => b.medianMs - a.medianMs).slice(0, 15) }));
