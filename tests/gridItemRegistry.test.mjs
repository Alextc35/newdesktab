import assert from 'node:assert/strict';
import test from 'node:test';

import { createGridItemRegistry } from '../src/shared/grid/gridItemRegistry.js';

function definition(type, order, items) {
  return {
    type,
    order,
    selector: `[data-${type}-id]`,
    getElementId: element => element.dataset[`${type}Id`],
    select: () => items,
    render: () => ({})
  };
}

test('registers item adapters and orders each view without type branches', () => {
  const registry = createGridItemRegistry();
  registry.register(definition('bookmark', { grid: 10, list: 30 }, [
    { id: 'later', gx: 0, gy: 2 },
    { id: 'first', gx: 0, gy: 0 }
  ]));
  registry.register(definition('clock', { grid: 20, list: 10 }, [
    { item: { id: 'clock', gx: 2, gy: 0 }, timezone: 'UTC' }
  ]));

  assert.deepEqual(
    registry.entries({}).map(entry => [entry.definition.type, entry.item.id]),
    [['bookmark', 'later'], ['bookmark', 'first'], ['clock', 'clock']]
  );
  assert.deepEqual(
    registry.entries({}, { view: 'list' }).map(entry => [entry.definition.type, entry.item.id]),
    [['clock', 'clock'], ['bookmark', 'first'], ['bookmark', 'later']]
  );
  assert.equal(registry.entries({}, { view: 'list' })[0].timezone, 'UTC');
});

test('interleaves types of the same list priority by their grid positions', () => {
  const registry = createGridItemRegistry();
  registry.register(definition('folder', { grid: 20, list: 20 }, [
    { id: 'folder', gx: 0, gy: 0 }
  ]));
  registry.register(definition('clock', { grid: 40, list: 15 }, [
    { id: 'clock-later', gx: 5, gy: 1 },
    { id: 'clock-first', gx: 4, gy: 0 }
  ]));
  registry.register(definition('weather', { grid: 50, list: 15 }, [
    { id: 'weather', gx: 1, gy: 1 }
  ]));

  assert.deepEqual(
    registry.entries({}, { view: 'list' }).map(entry => entry.item.id),
    ['clock-first', 'weather', 'clock-later', 'folder']
  );
});

test('rejects duplicate and incomplete definitions', () => {
  const registry = createGridItemRegistry();
  registry.register(definition('notes', {}, []));

  assert.throws(
    () => registry.register(definition('notes', {}, [])),
    /already registered/
  );
  assert.throws(
    () => registry.register({ type: 'weather' }),
    /requires select/
  );
  assert.throws(
    () => registry.register({
      ...definition('calendar', {}, []),
      open: 'calendar-modal'
    }),
    /open must be a function/
  );
  assert.throws(
    () => registry.register({
      ...definition('tasks', {}, []),
      selectable: 'yes'
    }),
    /selectable must be a boolean/
  );
});

test('resolves a DOM element through its registered feature adapter', () => {
  const registry = createGridItemRegistry();
  registry.register(definition('clock', {}, [{ id: 'local-time', gx: 0, gy: 0 }]));
  const element = {
    dataset: { clockId: 'local-time' },
    matches: selector => selector === '[data-clock-id]'
  };

  const resolved = registry.resolveElement(element, {});
  assert.equal(resolved.definition.type, 'clock');
  assert.equal(resolved.item.id, 'local-time');
});
