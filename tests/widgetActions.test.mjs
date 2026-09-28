import assert from 'node:assert/strict';
import test from 'node:test';

const storedData = {};
const createArea = () => ({
  QUOTA_BYTES: 102400,
  get(keys, callback) {
    const requested = keys === null ? Object.keys(storedData) : (Array.isArray(keys) ? keys : [keys]);
    callback(Object.fromEntries(
      requested.filter(key => Object.hasOwn(storedData, key)).map(key => [key, storedData[key]])
    ));
  },
  set(items, callback) {
    Object.assign(storedData, structuredClone(items));
    callback?.();
  },
  remove(keys, callback) {
    for (const key of (Array.isArray(keys) ? keys : [keys])) delete storedData[key];
    callback?.();
  }
});

globalThis.chrome = {
  runtime: { lastError: null, getManifest: () => ({ version: '0.19.0' }) },
  storage: {
    local: createArea(),
    sync: createArea(),
    onChanged: { addListener() {} }
  }
};

const { registerWidget } = await import('../src/widgets/widgetRegistry.js');
const {
  addWidget,
  deleteWidgetById,
  updateWidgetById
} = await import('../src/widgets/widgetActions.js');
const { updateGridItemsByIds } = await import('../src/features/grid/gridItemActions.js');
const { getState, hydrateStore, setState, undoBookmarks } = await import('../src/state/appStore.js');

registerWidget({ type: 'clock', render: () => ({ dataset: {} }) });

test('widget actions create, update, move, undo and delete registered instances', async () => {
  await hydrateStore();
  await setState({
    data: {
      bookmarks: [],
      folders: [],
      widgets: [],
      settings: { ...getState().data.settings, showRecycleBin: false }
    }
  });

  const created = addWidget({
    type: 'clock', w: 2, h: 1, config: { timezone: 'UTC' }
  }, {
    columns: 12,
    rows: 6,
    idFactory: () => 'clock-one',
    now: 100
  });
  assert.deepEqual(
    (({ id, type, gx, gy, w, h, config }) => ({ id, type, gx, gy, w, h, config }))(created),
    {
      id: 'clock-one', type: 'clock', gx: 0, gy: 0, w: 2, h: 1,
      config: { timezone: 'UTC' }
    }
  );

  const updated = updateWidgetById('clock-one', {
    config: { timezone: 'Europe/Madrid' },
    type: 'notes'
  });
  assert.equal(updated.type, 'clock');
  assert.equal(updated.config.timezone, 'Europe/Madrid');

  const [moved] = updateGridItemsByIds(new Map([[
    'clock-one', { gx: 4, gy: 2, w: 3, h: 2 }
  ]]));
  assert.deepEqual(
    (({ gx, gy, w, h }) => ({ gx, gy, w, h }))(moved),
    { gx: 4, gy: 2, w: 3, h: 2 }
  );

  assert.equal(await undoBookmarks(), true);
  assert.deepEqual(
    (({ gx, gy, w, h }) => ({ gx, gy, w, h }))(getState().data.widgets[0]),
    { gx: 0, gy: 0, w: 2, h: 1 }
  );

  assert.equal(deleteWidgetById('clock-one'), true);
  assert.deepEqual(getState().data.widgets, []);
  assert.equal(deleteWidgetById('missing'), false);
});

test('widget actions reject unregistered types and occupied workspaces', async () => {
  assert.equal(addWidget({ type: 'weather' }, { columns: 12, rows: 6 }), null);
  const state = getState();
  await setState({
    data: {
      widgets: [],
      bookmarks: [{
        id: 'full', folderId: null, groupId: null,
        gx: 0, gy: 0, w: 12, h: 6
      }],
      settings: { ...state.data.settings, showRecycleBin: false }
    }
  });
  assert.equal(addWidget({ type: 'clock' }, { columns: 12, rows: 6 }), null);
});
