import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateResizeGeometry,
  getResizeClickDelta,
  RESIZE_DIRECTIONS
} from '../src/shared/grid/resizeGeometry.js';

const GRID = {
  cellWidth: 100,
  cellHeight: 80,
  columns: 12,
  rows: 6
};

test('exposes side and corner resize directions', () => {
  assert.deepEqual(RESIZE_DIRECTIONS, [
    'top',
    'top-right',
    'right',
    'bottom-right',
    'bottom',
    'bottom-left',
    'left',
    'top-left'
  ]);
});

test('maps handle clicks to one outward grid cell', () => {
  assert.deepEqual(getResizeClickDelta('top', 100, 80), {
    deltaX: 0,
    deltaY: -80
  });
  assert.deepEqual(getResizeClickDelta('right', 100, 80), {
    deltaX: 100,
    deltaY: 0
  });
  assert.deepEqual(getResizeClickDelta('bottom-left', 100, 80), {
    deltaX: -100,
    deltaY: 80
  });
  assert.deepEqual(getResizeClickDelta('top-right', 100, 80), {
    deltaX: 100,
    deltaY: -80
  });
});

test('reverses handle click deltas when shrinking with Shift', () => {
  assert.deepEqual(getResizeClickDelta('top', 100, 80, true), {
    deltaX: 0,
    deltaY: 80
  });
  assert.deepEqual(getResizeClickDelta('right', 100, 80, true), {
    deltaX: -100,
    deltaY: 0
  });
  assert.deepEqual(getResizeClickDelta('bottom-left', 100, 80, true), {
    deltaX: 100,
    deltaY: -80
  });
  assert.deepEqual(getResizeClickDelta('top-right', 100, 80, true), {
    deltaX: -100,
    deltaY: 80
  });
});

test('moves continuously before snapping to the next grid column', () => {
  const beforeThreshold = calculateResizeGeometry({
    ...GRID,
    direction: 'right',
    deltaX: 40,
    deltaY: 0,
    start: { gx: 2, gy: 1, w: 1, h: 1 }
  });
  const afterThreshold = calculateResizeGeometry({
    ...GRID,
    direction: 'right',
    deltaX: 60,
    deltaY: 0,
    start: { gx: 2, gy: 1, w: 1, h: 1 }
  });

  assert.equal(beforeThreshold.pixel.width, 140);
  assert.equal(beforeThreshold.grid.w, 1);
  assert.equal(afterThreshold.pixel.width, 160);
  assert.equal(afterThreshold.grid.w, 2);
});

test('resizes both axes from a diagonal handle', () => {
  const result = calculateResizeGeometry({
    ...GRID,
    direction: 'top-left',
    deltaX: -130,
    deltaY: -70,
    start: { gx: 3, gy: 2, w: 2, h: 2 }
  });

  assert.deepEqual(result.grid, { gx: 2, gy: 1, w: 3, h: 3 });
  assert.deepEqual(result.pixel, {
    left: 170,
    top: 90,
    width: 330,
    height: 230
  });
});

test('clamps diagonal resizing to grid bounds and one cell minimum', () => {
  const atBounds = calculateResizeGeometry({
    ...GRID,
    direction: 'bottom-right',
    deltaX: 200,
    deltaY: 200,
    start: { gx: 10, gy: 4, w: 2, h: 2 }
  });
  const atMinimum = calculateResizeGeometry({
    ...GRID,
    direction: 'bottom-right',
    deltaX: -500,
    deltaY: -500,
    start: { gx: 2, gy: 1, w: 3, h: 3 }
  });

  assert.deepEqual(atBounds.grid, { gx: 10, gy: 4, w: 2, h: 2 });
  assert.deepEqual(atMinimum.grid, { gx: 2, gy: 1, w: 1, h: 1 });
  assert.equal(atMinimum.pixel.width, GRID.cellWidth);
  assert.equal(atMinimum.pixel.height, GRID.cellHeight);
});
