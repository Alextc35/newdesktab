import assert from 'node:assert/strict';
import test from 'node:test';

import { createGridItemRegistry } from '../src/shared/grid/gridItemRegistry.js';
import { getGridItemsInGroup } from '../src/features/grid/gridSelectors.js';
import {
  isWidgetType,
  normalizeWidgetInstance,
  normalizeWidgets
} from '../src/widgets/widgetModel.js';
import { createWidgetRegistry } from '../src/widgets/widgetRegistry.js';

test('normalizes the common widget envelope without interpreting its config', () => {
  const config = { timezone: 'Europe/Madrid', nested: { seconds: true } };
  const widget = normalizeWidgetInstance({
    id: ' clock ',
    type: 'clock',
    version: 2,
    gx: 99,
    gy: 99,
    w: 3,
    h: 2,
    groupId: 'work',
    config,
    createdAt: 10,
    updatedAt: 20
  }, { workspaceIds: new Set(['work']), now: 100 });

  assert.deepEqual(widget, {
    id: 'clock',
    type: 'clock',
    version: 2,
    gx: 9,
    gy: 4,
    w: 3,
    h: 2,
    groupId: 'work',
    config,
    createdAt: 10,
    updatedAt: 20
  });
  assert.notEqual(widget.config, config);
  assert.equal(isWidgetType('weather-forecast'), true);
  assert.equal(isWidgetType('Weather'), false);
});

test('drops invalid widget records and repairs unsupported workspace references', () => {
  const widgets = normalizeWidgets([
    null,
    { id: 'invalid', type: 'Clock' },
    { id: 'notes', type: 'notes', groupId: 'missing', config: [] }
  ], { workspaceIds: new Set(['work']), now: 50 });

  assert.equal(widgets.length, 1);
  assert.equal(widgets[0].id, 'notes');
  assert.equal(widgets[0].groupId, null);
  assert.deepEqual(widgets[0].config, {});
});

test('registerWidget adapts persisted instances to the GridItem protocol', () => {
  const gridRegistry = createGridItemRegistry();
  const widgets = createWidgetRegistry(gridRegistry);
  let editingContext = null;
  let openContext = null;
  let removalContext = null;
  widgets.register({
    type: 'clock',
    render({ widget, config, view }) {
      return { dataset: {}, widget, config, view };
    },
    open(context) {
      openContext = context;
    },
    getRemovalSuccessMessage(context) {
      removalContext = context;
      return 'flash.clock.deleted';
    },
    enableEditing(container, element, widget, context) {
      editingContext = { container, element, widget, context };
    }
  });

  const clock = {
    id: 'clock', type: 'clock', groupId: null,
    gx: 2, gy: 1, w: 2, h: 1, config: { timezone: 'UTC' }
  };
  const hidden = { ...clock, id: 'work-clock', groupId: 'work' };
  const state = {
    data: {
      widgets: [clock, hidden],
      settings: { activeBookmarkGroupId: null }
    }
  };

  const [entry] = gridRegistry.entries(state);
  assert.equal(entry.item, clock);
  assert.equal(entry.definition.type, 'clock');
  const element = entry.definition.render({ ...entry, view: 'grid', state });
  assert.equal(element.dataset.widgetId, 'clock');
  assert.equal(element.dataset.widgetType, 'clock');
  assert.deepEqual(element.config, { timezone: 'UTC' });
  assert.equal(entry.definition.selectable, true);
  assert.equal(entry.definition.selectionKind, 'widget');

  entry.definition.enableEditing('grid', element, clock, entry);
  assert.equal(editingContext.widget, clock);
  assert.equal(editingContext.context.config.timezone, 'UTC');
  entry.definition.open({ ...entry, state, element });
  assert.equal(openContext.widget, clock);
  assert.equal(openContext.config.timezone, 'UTC');
  assert.equal(
    entry.definition.getRemovalSuccessMessage({ ...entry, state, element }),
    'flash.clock.deleted'
  );
  assert.equal(removalContext.widget, clock);
  assert.equal(gridRegistry.resolveElement({
    dataset: element.dataset,
    matches: selector => selector === '[data-widget-type="clock"][data-widget-id]'
  }, state).item, clock);
});

test('widget registration rejects invalid, duplicate and conflicting types', () => {
  const gridRegistry = createGridItemRegistry();
  const widgets = createWidgetRegistry(gridRegistry);
  widgets.register({ type: 'notes', render: () => ({ dataset: {} }) });

  assert.throws(
    () => widgets.register({ type: 'notes', render: () => ({ dataset: {} }) }),
    /already registered/
  );
  assert.throws(() => widgets.register({ type: 'Notes' }), /lowercase kebab-case/);
  assert.throws(
    () => widgets.register({ type: 'bookmark', render: () => ({ dataset: {} }) }),
    /reserved by NewDeskTab/
  );

  const occupiedGridRegistry = createGridItemRegistry();
  occupiedGridRegistry.register({
    type: 'clock',
    selector: '[data-clock]',
    getElementId: element => element.dataset.clock,
    select: () => [],
    render: () => ({})
  });
  assert.throws(
    () => createWidgetRegistry(occupiedGridRegistry).register({
      type: 'clock', render: () => ({ dataset: {} })
    }),
    /already registered/
  );
});

test('initializes registered widget surfaces once and in catalog order', () => {
  const widgets = createWidgetRegistry(createGridItemRegistry());
  const calls = [];
  const context = { launcher: 'menu', modalHost: 'body' };

  widgets.register({
    type: 'clock',
    render: () => ({ dataset: {} }),
    initialize(received) {
      calls.push(['clock', received]);
    }
  });
  widgets.register({
    type: 'notes',
    render: () => ({ dataset: {} }),
    initialize(received) {
      calls.push(['notes', received]);
    }
  });

  assert.deepEqual(widgets.initialize(context), ['clock', 'notes']);
  assert.deepEqual(widgets.initialize(context), []);
  assert.deepEqual(calls, [
    ['clock', context],
    ['notes', context]
  ]);

  assert.throws(
    () => widgets.register({ type: 'weather', render: () => ({}), initialize: true }),
    /initialize must be a function/
  );
});

test('persisted widgets reserve cells in their workspace', () => {
  const main = { id: 'main', type: 'clock', groupId: null };
  const work = { id: 'work', type: 'notes', groupId: 'work' };
  const data = {
    bookmarks: [], folders: [], widgets: [main, work],
    settings: { showRecycleBin: false }
  };

  assert.deepEqual(getGridItemsInGroup(data, null), [main]);
  assert.deepEqual(getGridItemsInGroup(data, 'work'), [work]);
});
