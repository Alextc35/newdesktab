import assert from 'node:assert/strict';
import test from 'node:test';

const data = {};
const listeners = [];
let failures = 0;
const area = {
  get(keys, callback) {
    const requested = keys === null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
    callback(Object.fromEntries(requested.filter(key => Object.hasOwn(data, key))
      .map(key => [key, structuredClone(data[key])])));
  },
  set(items, callback) {
    if (items.bookmarks && failures > 0) {
      failures -= 1;
      chrome.runtime.lastError = { message: 'Storage quota exceeded' };
      callback?.();
      chrome.runtime.lastError = null;
      return;
    }
    const changes = Object.fromEntries(Object.entries(items).map(([key, value]) => [
      key, { oldValue: data[key], newValue: structuredClone(value) }
    ]));
    Object.assign(data, structuredClone(items));
    callback?.();
    for (const listener of listeners) listener(changes, 'local');
  },
  remove(keys, callback) {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    callback?.();
  }
};
globalThis.chrome = {
  runtime: { lastError: null, getManifest: () => ({ version: '0.27.0' }) },
  storage: { local: area, sync: area, onChanged: { addListener: listener => listeners.push(listener) } }
};
const { getState, getSettings, hydrateStore, requirePersistence, retryPersistence, setState } = await import('../src/state/appStore.js');

test('settings snapshots cannot mutate the store or include unrelated workspace collections', () => {
  const snapshot = getSettings();
  assert.deepEqual(snapshot, getState().data.settings);
  snapshot.theme.backgroundColor = '#abcdef';
  snapshot.bookmarkGroups.push({ id: 'unsaved', name: 'Unsaved' });
  assert.notEqual(getSettings().theme.backgroundColor, '#abcdef');
  assert.equal(getSettings().bookmarkGroups.some(group => group.id === 'unsaved'), false);
  assert.equal(Object.hasOwn(snapshot, 'bookmarks'), false);
});

test('only explicit no-change commands can accept idle persistence after hydration', async () => {
  await assert.rejects(requirePersistence({ allowIdle: true }), { code: 'PERSISTENCE_FAILED' });
  await hydrateStore();
  assert.equal(getState().ui.persistence.status, 'idle');
  await assert.rejects(requirePersistence(), { code: 'PERSISTENCE_FAILED' });
  await requirePersistence({ allowIdle: true });
});

test('failed writes survive storage refresh and persist with the next change', async t => {
  t.mock.method(console, 'error', () => {});
  await hydrateStore();
  const bookmark = { id: 'pending', name: 'Pending', url: 'https://pending.test', gx: 0, gy: 0 };
  failures = 1;
  await setState({ data: { bookmarks: [bookmark] } });
  await assert.rejects(requirePersistence(), { code: 'PERSISTENCE_FAILED' });
  await assert.rejects(requirePersistence({ allowIdle: true }), { code: 'PERSISTENCE_FAILED' });
  assert.equal(data.bookmarks.length, 0);

  area.set({ settings: { ...data.settings, language: 'es' } });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(getState().data.settings.language, 'es');
  assert.equal(getState().data.bookmarks[0].id, 'pending');
  assert.equal(getState().ui.persistence.status, 'error');

  await setState({ data: { bookmarks: [
    ...getState().data.bookmarks,
    { id: 'next', name: 'Next', url: 'https://next.test', gx: 1, gy: 0 }
  ] } });
  await requirePersistence();
  assert.deepEqual(data.bookmarks.map(item => item.id), ['pending', 'next']);
  assert.equal(data.settings.language, 'es');
});

test('consecutive queued failures retain all unsaved edits for one successful retry', async t => {
  t.mock.method(console, 'error', () => {});
  failures = 2;
  const before = getState().data.bookmarks;
  const first = setState({ data: { bookmarks: before.map(item => ({ ...item, name: 'Renamed' })) } });
  const second = setState({ data: { settings: { ...getState().data.settings, language: 'pt_BR' } } });
  await Promise.all([first, second]);
  await assert.rejects(requirePersistence(), { code: 'PERSISTENCE_FAILED' });
  await retryPersistence();
  assert.equal(data.settings.language, 'pt_BR');
  assert.deepEqual(data.bookmarks.map(item => item.name), ['Renamed', 'Renamed']);
});
