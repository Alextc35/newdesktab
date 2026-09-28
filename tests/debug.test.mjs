import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.chrome = { runtime: { getManifest: () => ({ version: '0.10.0' }) } };
const { createDebugger } = await import('../src/js/shared/diagnostics/debug.js');

function outputSpy() {
  const calls = [];
  return {
    calls,
    output: Object.fromEntries(['group', 'groupCollapsed', 'groupEnd', 'table', 'info', 'clear'].map(method => (
      [method, (...args) => calls.push({ method, args })]
    )))
  };
}

test('disabled debug neither reads the clock nor logs or retains operations', () => {
  const { calls, output } = outputSpy();
  const debug = createDebugger({ output, now: () => { throw new Error('Clock should stay idle'); } });
  const trace = debug.start('create');
  trace.mark('write');
  trace.end();
  debug.info('event');
  debug.table('usage', []);
  debug.guide('commands', []);
  assert.deepEqual(debug.history(), []);
  assert.deepEqual(calls, []);
});

test('overlapping operations keep independent timings and balanced console groups', () => {
  const { calls, output } = outputSpy();
  let time = 0;
  const debug = createDebugger({ enabled: true, now: () => time, output });
  const create = debug.start('create');
  time = 5;
  const remove = debug.start('remove');
  time = 10;
  create.mark('write');
  time = 25;
  remove.mark('queue');
  time = 30;
  remove.end({ status: 'error', error: 'Quota exceeded' });
  time = 40;
  create.end({ persisted: true });
  create.end();
  const records = debug.history();
  assert.deepEqual(records.map(({ label, durationMs }) => [label, durationMs]), [['remove', 25], ['create', 40]]);
  assert.equal(records[0].phases[0].durationMs, 20);
  assert.equal(records[1].phases[0].durationMs, 10);
  assert.equal(records[0].status, 'error');
  let depth = 0;
  for (const { method } of calls) {
    if (method === 'groupCollapsed') assert.equal(++depth, 1);
    if (method === 'groupEnd') assert.equal(--depth, 0);
  }
  assert.equal(depth, 0);
});

test('history stays bounded and callers cannot mutate stored records', () => {
  const { output } = outputSpy();
  const debug = createDebugger({ enabled: true, now: () => 1, output, limit: 3 });
  for (let index = 0; index < 5; index++) debug.start(`operation-${index}`).end();
  const records = debug.history();
  assert.deepEqual(records.map(record => record.id), [3, 4, 5]);
  records[0].label = 'changed';
  assert.equal(debug.history()[0].label, 'operation-2');
  debug.clear();
  assert.deepEqual(debug.history(), []);
});

test('runtime switching records only new operations in the active session', () => {
  const { calls, output } = outputSpy();
  const debug = createDebugger({ output, now: () => 1 });
  const disabled = debug.start('disabled');
  assert.equal(debug.setEnabled(true), true);
  const interrupted = debug.start('interrupted');
  debug.start('completed').end();
  assert.equal(debug.setEnabled(false), false);
  const count = calls.length;
  debug.info('hidden');
  interrupted.mark('ignored');
  assert.equal(calls.length, count);
  assert.equal(debug.enabled, false);
  debug.setEnabled(true);
  disabled.end();
  interrupted.end();
  debug.start('new session').end();
  assert.deepEqual(debug.history().map(record => record.label), ['completed', 'new session']);
});

test('clear empties the console and history and prevents pending traces from returning', () => {
  const { calls, output } = outputSpy();
  const debug = createDebugger({ enabled: true, output, now: () => 1 });
  debug.start('completed').end();
  const pending = debug.start('pending');
  assert.equal(debug.clear(), 1);
  assert.equal(calls.at(-1).method, 'clear');
  const count = calls.length;
  pending.mark('late phase');
  pending.end();
  assert.equal(calls.length, count);
  assert.deepEqual(debug.history(), []);
  assert.equal(debug.enabled, true);
  debug.start('after clear').end();
  assert.equal(debug.history().length, 1);
});

test('explicit console queries can print while automatic debug output stays off', () => {
  const { calls, output } = outputSpy();
  const debug = createDebugger({ output });
  debug.table('report', { version: '1' }, { force: true });
  debug.info('empty history', undefined, { force: true });
  assert.deepEqual(calls.map(call => call.method), ['groupCollapsed', 'table', 'groupEnd', 'info']);
  assert.equal(debug.enabled, false);
  assert.deepEqual(debug.history(), []);
});
