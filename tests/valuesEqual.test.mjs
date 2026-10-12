import assert from 'node:assert/strict';
import test from 'node:test';
import { valuesEqual } from '../src/shared/data/valuesEqual.js';

test('JSON equality ignores object key order at every depth', () => {
  assert.equal(valuesEqual({ folders: [{ id: 'one', style: { color: 'blue', show: true } }] },
    { folders: [{ style: { show: true, color: 'blue' }, id: 'one' }] }), true);
});

test('JSON equality retains value, collection order and missing-key differences', () => {
  for (const [left, right] of [
    [{ color: 'blue' }, { color: 'red' }], [[1, 2], [2, 1]], [[1], [1, 2]],
    [{ value: undefined }, {}], [null, {}], [0, false], [[], {}], [{ id: 1 }, { id: 1, extra: null }]
  ]) assert.equal(valuesEqual(left, right), false);
  assert.equal(valuesEqual(null, null), true);
});
