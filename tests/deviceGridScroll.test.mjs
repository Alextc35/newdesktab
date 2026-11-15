import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDeviceGridScrollStore,
  resolveDeviceGridScroll
} from '../src/platform/storage/deviceGridScroll.js';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('retains independent positions for Main and each workspace across tab sessions', () => {
  const storage = memoryStorage();
  const first = createDeviceGridScrollStore(() => storage);
  first.save(null, { x: 80, y: 60 });
  first.save('work', { x: 240, y: 120, maxX: 512, maxY: 312 });
  first.save('main', { x: 0, y: 0 });
  const next = createDeviceGridScrollStore(() => storage);
  assert.deepEqual(next.read(null), { x: 80, y: 60 });
  assert.deepEqual(next.read('work'), { x: 240, y: 120, maxX: 512, maxY: 312 });
  assert.deepEqual(next.read('main'), { x: 0, y: 0 });
  assert.equal(next.read('unknown'), null);
  const returned = next.read('work');
  returned.x = 999;
  assert.deepEqual(next.read('work'), { x: 240, y: 120, maxX: 512, maxY: 312 });
});

test('ignores malformed and invalid device-local values', () => {
  for (const invalid of ['{broken', 'null', '[]', '{"x":-1,"y":0}', '{"x":"80","y":60}',
    '{"x":80,"y":60,"maxX":-1}']) {
    const store = createDeviceGridScrollStore(() => ({ getItem: () => invalid }));
    assert.equal(store.read(null), null);
  }
  const storage = memoryStorage();
  const store = createDeviceGridScrollStore(() => storage);
  for (const invalid of [null, { x: -1, y: 0 }, { x: Infinity, y: 60 }, { x: 80, y: NaN }]) {
    store.save(null, invalid);
  }
  assert.equal(storage.values.size, 0);
  assert.equal(store.read(null), null);
});

test('keeps this tab usable when storage is blocked or full', () => {
  const blocked = createDeviceGridScrollStore(() => { throw new Error('Storage denied'); });
  assert.equal(blocked.read(null), null);
  blocked.save(null, { x: 80, y: 60 });
  assert.deepEqual(blocked.read(null), { x: 80, y: 60 });
  const full = createDeviceGridScrollStore(() => ({
    getItem: () => '{"x":10,"y":20}',
    setItem: () => { throw new Error('Storage full'); }
  }));
  full.save('work', { x: 240, y: 120 });
  assert.deepEqual(full.read('work'), { x: 240, y: 120 });
});

test('anchors manual pans to the center while retaining exact XY for the same window', () => {
  const saved = { x: 400, y: 240, maxX: 512, maxY: 312 };
  assert.deepEqual(resolveDeviceGridScroll(saved, { maxX: 512, maxY: 312 }), { x: 400, y: 240 });
  assert.deepEqual(resolveDeviceGridScroll(saved, { maxX: 562, maxY: 362 }), { x: 425, y: 265 });
  assert.deepEqual(resolveDeviceGridScroll(saved, { maxX: 212, maxY: 112 }), { x: 212, y: 112 });
  assert.deepEqual(resolveDeviceGridScroll(saved, { maxX: 0, maxY: 0 }), { x: 0, y: 0 });
  assert.deepEqual(resolveDeviceGridScroll(saved, { maxX: 512, maxY: 312 }), { x: 400, y: 240 });
  assert.deepEqual(resolveDeviceGridScroll(null, { maxX: 512, maxY: 312 }), { x: 256, y: 156 });
  assert.deepEqual(resolveDeviceGridScroll({ x: 80, y: 60 }, { maxX: 512, maxY: 312 }), { x: 80, y: 60 });
});
