import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findGridKeyboardRoute,
  getGridItemNavigationAnchor
} from '../src/shared/grid/gridKeyboardRoute.js';

function item(id, gx, gy, w = 1, h = 1) {
  return { id, gx, gy, w, h };
}

test('keeps horizontal movement on the remembered row across resized items and large gaps', () => {
  const current = item('current', 0, 2);
  const diagonal = item('diagonal', 1, 1);
  const resized = item('resized', 5, 1, 3, 3);
  const far = item('far', 11, 2);
  const items = [current, diagonal, resized, far];

  const intoResized = findGridKeyboardRoute(
    items,
    current,
    'ArrowRight',
    getGridItemNavigationAnchor(current)
  );
  assert.equal(intoResized.item.id, 'resized');
  assert.deepEqual(intoResized.point, { gx: 5, gy: 2 });

  const outOfResized = findGridKeyboardRoute(
    items,
    resized,
    'ArrowRight',
    intoResized.point
  );
  assert.equal(outOfResized.item.id, 'far');
  assert.deepEqual(outOfResized.point, { gx: 11, gy: 2 });
});

test('continues at the first item of the next occupied row and wraps around the grid', () => {
  const first = item('first', 0, 0);
  const rowEnd = item('row-end', 10, 1);
  const nextRow = item('next-row', 2, 4, 2, 1);
  const items = [first, rowEnd, nextRow];

  const next = findGridKeyboardRoute(items, rowEnd, 'ArrowRight', { gx: 10, gy: 1 });
  assert.equal(next.item.id, 'next-row');
  assert.deepEqual(next.point, { gx: 2, gy: 4 });
  assert.equal(next.wrapped, true);

  const wrapped = findGridKeyboardRoute(items, nextRow, 'ArrowRight', next.point);
  assert.equal(wrapped.item.id, 'first');
  assert.deepEqual(wrapped.point, { gx: 0, gy: 0 });

  const previous = findGridKeyboardRoute(items, nextRow, 'ArrowLeft', next.point);
  assert.equal(previous.item.id, 'row-end');
  assert.deepEqual(previous.point, { gx: 10, gy: 1 });
});

test('prefers the remembered column through a resized item', () => {
  const resized = item('resized', 2, 1, 3, 2);
  const nearDiagonal = item('near-diagonal', 0, 3);
  const aligned = item('aligned', 4, 5);
  const route = findGridKeyboardRoute(
    [resized, nearDiagonal, aligned],
    resized,
    'ArrowDown',
    { gx: 4, gy: 1 }
  );

  assert.equal(route.item.id, 'aligned');
  assert.deepEqual(route.point, { gx: 4, gy: 5 });
});

test('uses the closest forward row, then column, when the remembered column is empty', () => {
  const current = item('current', 5, 0, 2, 2);
  const nextRow = item('next-row', 0, 2);
  const lowerButAligned = item('lower', 6, 5);
  const route = findGridKeyboardRoute(
    [current, nextRow, lowerButAligned],
    current,
    'ArrowDown',
    { gx: 5, gy: 0 }
  );

  assert.equal(route.item.id, 'next-row');
  assert.deepEqual(route.point, { gx: 0, gy: 2 });
});

test('wraps vertically to the closest column at the opposite edge', () => {
  const topLeft = item('top-left', 0, 0);
  const topAligned = item('top-aligned', 7, 0, 2, 1);
  const bottom = item('bottom', 8, 5);

  const route = findGridKeyboardRoute(
    [topLeft, topAligned, bottom],
    bottom,
    'ArrowDown',
    { gx: 8, gy: 5 }
  );
  assert.equal(route.item.id, 'top-aligned');
  assert.deepEqual(route.point, { gx: 8, gy: 0 });
  assert.equal(route.wrapped, true);
});

test('reaches every sparse item in stable row order with ArrowRight', () => {
  const items = [
    item('large', 0, 0, 2, 2),
    item('top-right', 8, 0),
    item('middle', 3, 3, 3, 2),
    item('bottom-right', 11, 5)
  ];
  let current = items[0];
  let point = getGridItemNavigationAnchor(current);
  const visited = [current.id];

  for (let step = 0; step < items.length; step += 1) {
    const route = findGridKeyboardRoute(items, current, 'ArrowRight', point);
    current = route.item;
    point = route.point;
    visited.push(current.id);
  }

  assert.deepEqual(visited, [
    'large',
    'top-right',
    'middle',
    'bottom-right',
    'large'
  ]);
});
