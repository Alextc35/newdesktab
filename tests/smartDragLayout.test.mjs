import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKMARK_DRAG_MODES } from '../src/domain/settings/gridInteractionModes.js';
import {
  calculateKeyboardMoveLayout,
  calculateSmartDragLayout
} from '../src/shared/grid/smartDragLayout.js';

function plan(items, draggedId, target, options = {}) {
  return calculateSmartDragLayout({
    items,
    draggedId,
    target,
    movableIds: options.movableIds ?? items.map(item => item.id),
    mode: options.mode ?? BOOKMARK_DRAG_MODES.CASCADE,
    cascadeStep: options.cascadeStep,
    previewPositions: options.previewPositions,
    columns: options.columns ?? 6,
    rows: options.rows ?? 2
  });
}

test('uses the latest local drag direction when changing rows', () => {
  const result = plan([
    { id: 'dragged', gx: 5, gy: 2, w: 1, h: 1 },
    { id: 'calendar', gx: 0, gy: 3, w: 1, h: 1 }
  ], 'dragged', { gx: 0, gy: 3 }, {
    cascadeStep: { gx: 0, gy: -1 },
    rows: 5
  });

  assert.deepEqual(result, {
    isValid: true,
    positions: [
      { id: 'dragged', gx: 0, gy: 3 },
      { id: 'calendar', gx: 0, gy: 2 }
    ],
    displacedIds: ['calendar']
  });
});

test('continues a cascade through a corner using the active preview', () => {
  const items = [
    { id: 'dragged', gx: 5, gy: 2, w: 1, h: 1 },
    { id: 'calendar', gx: 0, gy: 3, w: 1, h: 1 },
    { id: 'gog', gx: 1, gy: 3, w: 1, h: 1 },
    { id: 'virus-total', gx: 2, gy: 3, w: 1, h: 1 }
  ];
  const down = plan(items, 'dragged', { gx: 0, gy: 3 }, {
    cascadeStep: { gx: 0, gy: -1 },
    rows: 5
  });
  const right = plan(items, 'dragged', { gx: 1, gy: 3 }, {
    cascadeStep: { gx: -1, gy: 0 },
    previewPositions: down.positions,
    rows: 5
  });
  const fartherRight = plan(items, 'dragged', { gx: 2, gy: 3 }, {
    cascadeStep: { gx: -1, gy: 0 },
    previewPositions: right.positions,
    rows: 5
  });
  const repeatedPointerMove = plan(items, 'dragged', { gx: 2, gy: 3 }, {
    cascadeStep: { gx: -1, gy: 0 },
    previewPositions: fartherRight.positions,
    rows: 5
  });

  assert.deepEqual(repeatedPointerMove, {
    isValid: true,
    positions: [
      { id: 'dragged', gx: 2, gy: 3 },
      { id: 'calendar', gx: 0, gy: 2 },
      { id: 'gog', gx: 0, gy: 3 },
      { id: 'virus-total', gx: 1, gy: 3 }
    ],
    displacedIds: ['calendar', 'gog', 'virus-total']
  });
});

test('keeps a displaced bookmark outside a wide folder until its origin is clear', () => {
  const items = [
    { id: 'folder', gx: 0, gy: 0, w: 2, h: 2 },
    { id: 'test', gx: 2, gy: 0, w: 1, h: 1 }
  ];
  const firstStep = plan(items, 'folder', { gx: 1, gy: 0 }, {
    cascadeStep: { gx: -1, gy: 0 },
    columns: 6,
    rows: 3
  });
  const secondStep = plan(items, 'folder', { gx: 2, gy: 0 }, {
    cascadeStep: { gx: -1, gy: 0 },
    previewPositions: firstStep.positions,
    columns: 6,
    rows: 3
  });
  const clearStep = plan(items, 'folder', { gx: 3, gy: 0 }, {
    cascadeStep: { gx: -1, gy: 0 },
    previewPositions: secondStep.positions,
    columns: 6,
    rows: 3
  });

  assert.deepEqual(secondStep, {
    isValid: true,
    positions: [
      { id: 'folder', gx: 2, gy: 0 },
      { id: 'test', gx: 0, gy: 0 }
    ],
    displacedIds: ['test']
  });
  assert.deepEqual(clearStep, {
    isValid: true,
    positions: [{ id: 'folder', gx: 3, gy: 0 }],
    displacedIds: []
  });
});

test('swaps an occupied bookmark into the source cell', () => {
  const result = plan([
    { id: 'left', gx: 1, gy: 0, w: 1, h: 1 },
    { id: 'dragged', gx: 2, gy: 0, w: 1, h: 1 }
  ], 'dragged', { gx: 1, gy: 0 });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.positions, [
    { id: 'dragged', gx: 1, gy: 0 },
    { id: 'left', gx: 2, gy: 0 }
  ]);
  assert.deepEqual(result.displacedIds, ['left']);
});

test('cascades every occupied bookmark toward the original gap in sequence mode', () => {
  const result = plan([
    { id: 'first', gx: 1, gy: 0, w: 1, h: 1 },
    { id: 'second', gx: 2, gy: 0, w: 1, h: 1 },
    { id: 'third', gx: 3, gy: 0, w: 1, h: 1 },
    { id: 'dragged', gx: 4, gy: 0, w: 1, h: 1 }
  ], 'dragged', { gx: 1, gy: 0 });

  assert.deepEqual(result, {
    isValid: true,
    positions: [
      { id: 'dragged', gx: 1, gy: 0 },
      { id: 'first', gx: 2, gy: 0 },
      { id: 'second', gx: 3, gy: 0 },
      { id: 'third', gx: 4, gy: 0 }
    ],
    displacedIds: ['first', 'second', 'third']
  });
});

test('ends a cascade at the first available cell', () => {
  const result = plan([
    { id: 'first', gx: 1, gy: 0, w: 1, h: 1 },
    { id: 'second', gx: 2, gy: 0, w: 1, h: 1 },
    { id: 'dragged', gx: 4, gy: 0, w: 1, h: 1 }
  ], 'dragged', { gx: 1, gy: 0 });

  assert.deepEqual(result.positions, [
    { id: 'dragged', gx: 1, gy: 0 },
    { id: 'first', gx: 2, gy: 0 },
    { id: 'second', gx: 3, gy: 0 }
  ]);
});

test('relocation mode maps collisions to their relative cells in the vacated area', () => {
  const result = plan([
    { id: 'first', gx: 1, gy: 0, w: 1, h: 1 },
    { id: 'second', gx: 2, gy: 0, w: 1, h: 1 },
    { id: 'dragged', gx: 4, gy: 0, w: 2, h: 1 }
  ], 'dragged', { gx: 1, gy: 0 }, {
    mode: BOOKMARK_DRAG_MODES.RELOCATE
  });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.positions, [
    { id: 'dragged', gx: 1, gy: 0 },
    { id: 'first', gx: 4, gy: 0 },
    { id: 'second', gx: 5, gy: 0 }
  ]);
});

test('relocation mode leaves intermediate bookmarks untouched', () => {
  const result = plan([
    { id: 'target', gx: 0, gy: 0, w: 1, h: 1 },
    { id: 'middle', gx: 1, gy: 0, w: 1, h: 1 },
    { id: 'dragged', gx: 2, gy: 0, w: 1, h: 1 }
  ], 'dragged', { gx: 0, gy: 0 }, {
    mode: BOOKMARK_DRAG_MODES.RELOCATE
  });

  assert.deepEqual(result.positions, [
    { id: 'dragged', gx: 0, gy: 0 },
    { id: 'target', gx: 2, gy: 0 }
  ]);
});

test('keeps a relocation still while its original cell remains occupied', () => {
  const items = [
    { id: 'folder', gx: 2, gy: 2, w: 2, h: 2 },
    { id: 'test', gx: 1, gy: 2, w: 1, h: 1 }
  ];
  const firstStep = plan(items, 'folder', { gx: 1, gy: 2 }, {
    mode: BOOKMARK_DRAG_MODES.RELOCATE,
    columns: 8,
    rows: 6
  });
  const repeatedFirstStep = plan(items, 'folder', { gx: 1, gy: 2 }, {
    mode: BOOKMARK_DRAG_MODES.RELOCATE,
    previewPositions: firstStep.positions,
    columns: 8,
    rows: 6
  });
  const diagonalStep = plan(items, 'folder', { gx: 1, gy: 1 }, {
    mode: BOOKMARK_DRAG_MODES.RELOCATE,
    previewPositions: repeatedFirstStep.positions,
    columns: 8,
    rows: 6
  });
  const fartherStep = plan(items, 'folder', { gx: 0, gy: 1 }, {
    mode: BOOKMARK_DRAG_MODES.RELOCATE,
    previewPositions: diagonalStep.positions,
    columns: 8,
    rows: 6
  });
  const clearStep = plan(items, 'folder', { gx: 0, gy: 0 }, {
    mode: BOOKMARK_DRAG_MODES.RELOCATE,
    previewPositions: fartherStep.positions,
    columns: 8,
    rows: 6
  });

  assert.deepEqual(firstStep.positions, [
    { id: 'folder', gx: 1, gy: 2 },
    { id: 'test', gx: 3, gy: 2 }
  ]);
  assert.deepEqual(repeatedFirstStep, firstStep);
  assert.deepEqual(diagonalStep.positions, [
    { id: 'folder', gx: 1, gy: 1 },
    { id: 'test', gx: 3, gy: 2 }
  ]);
  assert.deepEqual(fartherStep.positions, [
    { id: 'folder', gx: 0, gy: 1 },
    { id: 'test', gx: 3, gy: 2 }
  ]);
  assert.deepEqual(clearStep, {
    isValid: true,
    positions: [{ id: 'folder', gx: 0, gy: 0 }],
    displacedIds: []
  });
});

test('finds the nearest free cell when the dragged item still covers its source', () => {
  const result = plan([
    { id: 'blocked', gx: 1, gy: 0, w: 1, h: 1 },
    { id: 'dragged', gx: 2, gy: 0, w: 2, h: 1 }
  ], 'dragged', { gx: 1, gy: 0 });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.positions, [
    { id: 'dragged', gx: 1, gy: 0 },
    { id: 'blocked', gx: 3, gy: 0 }
  ]);
});

test('returns only the dragged position over a free area', () => {
  const result = plan([
    { id: 'left', gx: 1, gy: 0, w: 1, h: 1 },
    { id: 'dragged', gx: 2, gy: 0, w: 1, h: 1 }
  ], 'dragged', { gx: 4, gy: 0 });

  assert.deepEqual(result, {
    isValid: true,
    positions: [{ id: 'dragged', gx: 4, gy: 0 }],
    displacedIds: []
  });
});

test('none mode rejects collisions without moving another grid item', () => {
  const items = [
    { id: 'occupied', gx: 0, gy: 0, w: 1, h: 1 },
    { id: 'dragged', gx: 1, gy: 0, w: 1, h: 1 }
  ];
  const blocked = plan(items, 'dragged', { gx: 0, gy: 0 }, {
    mode: BOOKMARK_DRAG_MODES.NONE
  });
  const free = plan(items, 'dragged', { gx: 3, gy: 0 }, {
    mode: BOOKMARK_DRAG_MODES.NONE
  });

  assert.deepEqual(blocked, {
    isValid: false,
    positions: [],
    displacedIds: []
  });
  assert.deepEqual(free, {
    isValid: true,
    positions: [{ id: 'dragged', gx: 3, gy: 0 }],
    displacedIds: []
  });
});

test('smart modes produce the same layout when advanced one cell at a time', () => {
  const advanceTwice = mode => {
    let items = [
      { id: 'dragged', gx: 0, gy: 0, w: 1, h: 1 },
      { id: 'first', gx: 1, gy: 0, w: 1, h: 1 },
      { id: 'second', gx: 2, gy: 0, w: 1, h: 1 }
    ];

    for (const gx of [1, 2]) {
      const result = plan(items, 'dragged', { gx, gy: 0 }, {
        mode,
        cascadeStep: { gx: -1, gy: 0 }
      });
      assert.equal(result.isValid, true);
      const positions = new Map(result.positions.map(position => [
        position.id,
        position
      ]));
      items = items.map(item => ({ ...item, ...(positions.get(item.id) ?? {}) }));
    }

    return items.map(({ id, gx, gy }) => ({ id, gx, gy }));
  };

  const expected = [
    { id: 'dragged', gx: 2, gy: 0 },
    { id: 'first', gx: 0, gy: 0 },
    { id: 'second', gx: 1, gy: 0 }
  ];

  assert.deepEqual(advanceTwice(BOOKMARK_DRAG_MODES.RELOCATE), expected);
  assert.deepEqual(advanceTwice(BOOKMARK_DRAG_MODES.CASCADE), expected);
});

test('none keyboard movement skips occupied cells to the next free gap', () => {
  const items = [
    { id: 'fixed-left', gx: 0, gy: 0, w: 1, h: 1 },
    { id: 'first', gx: 2, gy: 0, w: 1, h: 1 },
    { id: 'second', gx: 3, gy: 0, w: 1, h: 1 },
    { id: 'third', gx: 4, gy: 0, w: 1, h: 1 },
    { id: 'dragged', gx: 5, gy: 0, w: 1, h: 1 }
  ];

  const result = calculateKeyboardMoveLayout({
    items,
    draggedId: 'dragged',
    step: { gx: -1, gy: 0 },
    movableIds: items.map(item => item.id),
    mode: BOOKMARK_DRAG_MODES.NONE,
    columns: 6,
    rows: 1
  });

  assert.deepEqual(result, {
    isValid: true,
    positions: [{ id: 'dragged', gx: 1, gy: 0 }],
    displacedIds: []
  });
});

test('smart keyboard movement jumps over the full folder rectangle', () => {
  const items = [
    { id: 'target', gx: 2, gy: 0, w: 1, h: 1 },
    { id: 'folder', gx: 3, gy: 0, w: 2, h: 2 },
    { id: 'dragged', gx: 5, gy: 0, w: 1, h: 1 }
  ];
  const move = mode => calculateKeyboardMoveLayout({
    items,
    draggedId: 'dragged',
    step: { gx: -1, gy: 0 },
    movableIds: ['target', 'dragged'],
    mode,
    columns: 7,
    rows: 2
  });
  const expected = {
    isValid: true,
    positions: [
      { id: 'dragged', gx: 2, gy: 0 },
      { id: 'target', gx: 5, gy: 0 }
    ],
    displacedIds: ['target']
  };

  assert.deepEqual(move(BOOKMARK_DRAG_MODES.RELOCATE), expected);
  assert.deepEqual(move(BOOKMARK_DRAG_MODES.CASCADE), expected);
});

test('does not displace grid items omitted from the movable set', () => {
  const result = plan([
    { id: 'folder', gx: 1, gy: 0, w: 1, h: 1 },
    { id: 'dragged', gx: 2, gy: 0, w: 1, h: 1 }
  ], 'dragged', { gx: 1, gy: 0 }, {
    movableIds: ['dragged']
  });

  assert.deepEqual(result, {
    isValid: false,
    positions: [],
    displacedIds: []
  });
});

test('falls back to a swap, then inserts through its released cell', () => {
  const items = [
    { id: 'godkeys', gx: 2, gy: 1, w: 1, h: 1 },
    { id: 'wayback', gx: 3, gy: 1, w: 1, h: 1 },
    { id: 'folder', gx: 4, gy: 0, w: 2, h: 2 },
    { id: 'dragged', gx: 6, gy: 1, w: 1, h: 1 }
  ];
  const movableIds = ['godkeys', 'wayback', 'dragged'];
  const overWayback = plan(items, 'dragged', { gx: 3, gy: 1 }, {
    movableIds,
    cascadeStep: { gx: 1, gy: 0 },
    columns: 8
  });
  const backAtSource = plan(items, 'dragged', { gx: 6, gy: 1 }, {
    movableIds,
    cascadeStep: { gx: -1, gy: 0 },
    previewPositions: overWayback.positions,
    columns: 8
  });
  const overGodkeys = plan(items, 'dragged', { gx: 2, gy: 1 }, {
    movableIds,
    cascadeStep: { gx: 1, gy: 0 },
    previewPositions: overWayback.positions,
    columns: 8
  });
  const overFreeCell = plan(items, 'dragged', { gx: 7, gy: 1 }, {
    movableIds,
    cascadeStep: { gx: -1, gy: 0 },
    previewPositions: overGodkeys.positions,
    columns: 8
  });

  assert.deepEqual(overWayback, {
    isValid: true,
    positions: [
      { id: 'dragged', gx: 3, gy: 1 },
      { id: 'wayback', gx: 6, gy: 1 }
    ],
    displacedIds: ['wayback']
  });
  assert.deepEqual(backAtSource, {
    isValid: true,
    positions: [{ id: 'dragged', gx: 6, gy: 1 }],
    displacedIds: []
  });
  assert.deepEqual(overGodkeys, {
    isValid: true,
    positions: [
      { id: 'dragged', gx: 2, gy: 1 },
      { id: 'godkeys', gx: 3, gy: 1 },
      { id: 'wayback', gx: 6, gy: 1 }
    ],
    displacedIds: ['godkeys', 'wayback']
  });
  assert.deepEqual(overFreeCell, {
    isValid: true,
    positions: [{ id: 'dragged', gx: 7, gy: 1 }],
    displacedIds: []
  });
});

test('rejects a collision when no displaced layout fits', () => {
  const result = plan([
    { id: 'large', gx: 0, gy: 0, w: 2, h: 1 },
    { id: 'fixed', gx: 0, gy: 1, w: 1, h: 1 },
    { id: 'dragged', gx: 1, gy: 1, w: 1, h: 1 }
  ], 'dragged', { gx: 0, gy: 0 }, {
    columns: 2,
    rows: 2
  });

  assert.equal(result.isValid, false);
});
