import { isAreaFree } from './gridPlacement.js';
import {
  BOOKMARK_DRAG_MODES,
  normalizeBookmarkDragMode
} from '../../domain/settings/gridInteractionModes.js';

/**
 * Builds a reversible grid layout for one drag position.
 *
 * Persisted coordinates remain the reversible baseline, while an optional
 * preview layout lets a cascade continue naturally when its path turns a
 * corner. Reaching an actually free area or the dragged item's source still
 * restores the baseline.
 *
 * @param {Object} options
 * @param {Array<Bookmark|BookmarkFolder>} options.items
 * @param {string} options.draggedId
 * @param {{gx:number, gy:number}} options.target
 * @param {Iterable<string>} options.movableIds
 * @param {'none'|'cascade'|'relocate'} [options.mode='relocate']
 * @param {{gx:number, gy:number}|null} [options.cascadeStep=null]
 * @param {Iterable<{id:string, gx:number, gy:number}>} [options.previewPositions=[]]
 * @param {number} options.columns
 * @param {number} options.rows
 * @returns {{
 *   isValid: boolean,
 *   positions: Array<{id:string, gx:number, gy:number}>,
 *   displacedIds: string[]
 * }}
 */
export function calculateSmartDragLayout({
  items,
  draggedId,
  target,
  movableIds,
  mode,
  cascadeStep,
  previewPositions,
  columns,
  rows
}) {
  const dragged = items.find(item => item.id === draggedId);
  if (!dragged || !isInsideGrid(target, dragged, columns, rows)) {
    return invalidLayout();
  }

  const movable = new Set(movableIds);
  const normalizedMode = normalizeBookmarkDragMode(mode);
  const targetRectangle = { ...dragged, ...target };
  const remaining = items.filter(item => item.id !== draggedId);
  const previewById = new Map(
    Array.from(previewPositions ?? [], position => [position.id, position])
  );
  const positions = new Map(remaining.map(item => {
    const preview = normalizedMode === BOOKMARK_DRAG_MODES.CASCADE
      ? previewById.get(item.id)
      : null;
    const position = preview && isInsideGrid(preview, item, columns, rows)
      ? { gx: preview.gx, gy: preview.gy }
      : { gx: item.gx, gy: item.gy };
    return [item.id, position];
  }));
  const initialPosition = { id: draggedId, gx: target.gx, gy: target.gy };
  if (target.gx === dragged.gx && target.gy === dragged.gy) {
    return { isValid: true, positions: [initialPosition], displacedIds: [] };
  }

  const previewDragged = previewById.get(draggedId);
  if (
    normalizedMode === BOOKMARK_DRAG_MODES.CASCADE
    && previewDragged?.gx === target.gx
    && previewDragged?.gy === target.gy
  ) return buildCascadeLayout(initialPosition, remaining, positions);

  const conflicts = remaining.filter(item => rectanglesOverlap(
    target,
    dragged,
    positions.get(item.id),
    item
  ));

  if (normalizedMode === BOOKMARK_DRAG_MODES.NONE) {
    return conflicts.length
      ? invalidLayout()
      : { isValid: true, positions: [initialPosition], displacedIds: [] };
  }

  if (conflicts.some(item => !movable.has(item.id))) return invalidLayout();

  if (!conflicts.length) {
    const baselineWouldOverlap = remaining.some(item => rectanglesOverlap(
      target,
      dragged,
      item,
      item
    ));
    if (baselineWouldOverlap) {
      return buildCascadeLayout(initialPosition, remaining, positions);
    }
    return { isValid: true, positions: [initialPosition], displacedIds: [] };
  }

  const context = {
    dragged,
    target,
    targetRectangle,
    remaining,
    conflicts,
    movable,
    cascadeStep,
    positions,
    previewById,
    columns,
    rows,
    initialPosition
  };

  if (normalizedMode === BOOKMARK_DRAG_MODES.RELOCATE) {
    return calculateRelocationLayout(context);
  }

  const cascadeLayout = calculateCascadeLayout(context);
  return cascadeLayout.isValid
    ? cascadeLayout
    : calculateSourceSwapLayout(context);
}

/**
 * Plans one arrow-key movement.
 *
 * None mode advances to the next completely free rectangle. Smart modes keep
 * their one-cell bookmark exchanges, but jump over fixed grid items such as
 * folders. Relocation is used for both smart modes so keyboard behavior stays
 * predictable and identical one keypress at a time.
 *
 * @param {Object} options
 * @param {Array<Bookmark|BookmarkFolder>} options.items
 * @param {string} options.draggedId
 * @param {{gx:number, gy:number}} options.step
 * @param {Iterable<string>} options.movableIds
 * @param {'none'|'cascade'|'relocate'} options.mode
 * @param {number} options.columns
 * @param {number} options.rows
 * @returns {{
 *   isValid: boolean,
 *   positions: Array<{id:string, gx:number, gy:number}>,
 *   displacedIds: string[]
 * }}
 */
export function calculateKeyboardMoveLayout({
  items,
  draggedId,
  step,
  movableIds,
  mode,
  columns,
  rows
}) {
  const dragged = items.find(item => item.id === draggedId);
  if (!dragged || !isCardinalStep(step)) return invalidLayout();

  const normalizedMode = normalizeBookmarkDragMode(mode);
  const movable = new Set(movableIds);
  const fixedItems = items.filter(item => (
    item.id !== draggedId && !movable.has(item.id)
  ));
  let target = advancePosition(dragged, step);

  while (isInsideGrid(target, dragged, columns, rows)) {
    if (normalizedMode === BOOKMARK_DRAG_MODES.NONE) {
      const layout = calculateSmartDragLayout({
        items,
        draggedId,
        target,
        movableIds: movable,
        mode: BOOKMARK_DRAG_MODES.NONE,
        columns,
        rows
      });
      if (layout.isValid) return layout;
      target = advancePosition(target, step);
      continue;
    }

    const overlapsFixedItem = !isAreaFree(
      fixedItems,
      target.gx,
      target.gy,
      dragged.w,
      dragged.h
    );
    if (overlapsFixedItem) {
      target = advancePosition(target, step);
      continue;
    }

    return calculateSmartDragLayout({
      items,
      draggedId,
      target,
      movableIds: movable,
      mode: BOOKMARK_DRAG_MODES.RELOCATE,
      cascadeStep: { gx: -step.gx, gy: -step.gy },
      columns,
      rows
    });
  }

  return invalidLayout();
}

function calculateCascadeLayout(context) {
  const {
    dragged,
    target,
    targetRectangle,
    remaining,
    conflicts,
    movable,
    cascadeStep,
    positions,
    columns,
    rows,
    initialPosition
  } = context;
  const step = normalizeCascadeStep(cascadeStep, dragged, target);
  if (step.gx === 0 && step.gy === 0) return invalidLayout();

  const itemById = new Map(remaining.map(item => [item.id, item]));
  const activePushes = new Set();

  const push = id => {
    if (activePushes.has(id) || !movable.has(id)) return false;

    const item = itemById.get(id);
    const current = positions.get(id);
    if (!item || !current) return false;

    activePushes.add(id);
    let candidate = advancePosition(current, step);
    while (rectanglesOverlap(candidate, item, targetRectangle, dragged)) {
      candidate = advancePosition(candidate, step);
    }

    if (!isInsideGrid(candidate, item, columns, rows)) {
      activePushes.delete(id);
      return false;
    }

    const blockers = getPositionBlockers({
      id,
      candidate,
      item,
      remaining,
      positions
    }).sort((a, b) => compareInPushDirection(a, b, positions, step));

    for (const blocker of blockers) {
      if (!push(blocker.id)) {
        activePushes.delete(id);
        return false;
      }
    }

    if (getPositionBlockers({
      id,
      candidate,
      item,
      remaining,
      positions
    }).length) {
      activePushes.delete(id);
      return false;
    }

    positions.set(id, candidate);
    activePushes.delete(id);
    return true;
  };

  const orderedConflicts = [...conflicts]
    .sort((a, b) => compareInPushDirection(a, b, positions, step));

  for (const conflict of orderedConflicts) {
    const position = positions.get(conflict.id);
    if (
      rectanglesOverlap(position, conflict, targetRectangle, dragged)
      && !push(conflict.id)
    ) return invalidLayout();
  }

  return buildCascadeLayout(initialPosition, remaining, positions);
}

function buildCascadeLayout(initialPosition, remaining, positions) {
  const displaced = remaining.filter(item => {
    const position = positions.get(item.id);
    return position.gx !== item.gx || position.gy !== item.gy;
  });
  return {
    isValid: true,
    positions: [
      initialPosition,
      ...displaced.map(item => ({ id: item.id, ...positions.get(item.id) }))
    ],
    displacedIds: displaced.map(item => item.id)
  };
}

/**
 * Falls back to exchanging the current blockers with the dragged item's
 * source rectangle. The returned swap can then become the preview baseline
 * for a normal insertion into the cell released on the next pointer move.
 */
function calculateSourceSwapLayout(context) {
  const {
    dragged,
    target,
    targetRectangle,
    remaining,
    movable,
    columns,
    rows,
    initialPosition
  } = context;
  const conflicts = remaining.filter(item => rectanglesOverlap(
    target,
    dragged,
    item,
    item
  ));

  if (
    !conflicts.length
    || conflicts.some(item => !movable.has(item.id))
  ) return invalidLayout();

  const conflictIds = new Set(conflicts.map(item => item.id));
  const occupied = remaining
    .filter(item => !conflictIds.has(item.id))
    .map(item => ({ ...item }));
  occupied.push(targetRectangle);

  const swapped = [];
  for (const conflict of conflicts) {
    const candidate = {
      gx: dragged.gx + conflict.gx - target.gx,
      gy: dragged.gy + conflict.gy - target.gy
    };
    if (
      !isInsideGrid(candidate, conflict, columns, rows)
      || !isAreaFree(
        occupied,
        candidate.gx,
        candidate.gy,
        conflict.w,
        conflict.h
      )
    ) return invalidLayout();

    swapped.push({ id: conflict.id, ...candidate });
    occupied.push({ ...conflict, ...candidate });
  }

  return {
    isValid: true,
    positions: [initialPosition, ...swapped],
    displacedIds: conflicts.map(item => item.id)
  };
}

function calculateRelocationLayout(context) {
  const {
    dragged,
    target,
    targetRectangle,
    remaining,
    conflicts,
    previewById,
    columns,
    rows,
    initialPosition
  } = context;

  const conflictIds = new Set(conflicts.map(item => item.id));
  const occupied = remaining
    .filter(item => !conflictIds.has(item.id))
    .map(item => ({ ...item }));
  occupied.push(targetRectangle);

  const positions = [initialPosition];

  for (const conflict of conflicts) {
    const anchor = {
      gx: dragged.gx + conflict.gx - target.gx,
      gy: dragged.gy + conflict.gy - target.gy
    };
    const preview = previewById.get(conflict.id);
    const canKeepPreview = preview
      && isInsideGrid(preview, conflict, columns, rows)
      && isAreaFree(
        occupied,
        preview.gx,
        preview.gy,
        conflict.w,
        conflict.h
      );
    const position = canKeepPreview
      ? { gx: preview.gx, gy: preview.gy }
      : findNearestFreePosition(occupied, conflict, anchor, {
          columns,
          rows
        });

    if (!position) return invalidLayout();

    positions.push({ id: conflict.id, ...position });
    occupied.push({ ...conflict, ...position });
  }

  return {
    isValid: true,
    positions,
    displacedIds: conflicts.map(item => item.id)
  };
}

function getCascadeStep(dragged, target) {
  const dx = dragged.gx - target.gx;
  const dy = dragged.gy - target.gy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return { gx: Math.sign(dx), gy: 0 };
  }

  return { gx: 0, gy: Math.sign(dy) };
}

function normalizeCascadeStep(step, dragged, target) {
  if (
    step
    && Number.isInteger(step.gx)
    && Number.isInteger(step.gy)
    && Math.abs(step.gx) + Math.abs(step.gy) === 1
  ) return step;

  return getCascadeStep(dragged, target);
}

function advancePosition(position, step) {
  return {
    gx: position.gx + step.gx,
    gy: position.gy + step.gy
  };
}

function isCardinalStep(step) {
  return Number.isInteger(step?.gx)
    && Number.isInteger(step?.gy)
    && Math.abs(step.gx) + Math.abs(step.gy) === 1;
}

function getPositionBlockers({ id, candidate, item, remaining, positions }) {
  return remaining.filter(other => {
    if (other.id === id) return false;
    const otherPosition = positions.get(other.id);
    return rectanglesOverlap(candidate, item, otherPosition, other);
  });
}

function compareInPushDirection(a, b, positions, step) {
  const aPosition = positions.get(a.id);
  const bPosition = positions.get(b.id);
  const aProjection = aPosition.gx * step.gx + aPosition.gy * step.gy;
  const bProjection = bPosition.gx * step.gx + bPosition.gy * step.gy;
  return bProjection - aProjection;
}

function rectanglesOverlap(aPosition, aItem, bPosition, bItem) {
  return !isAreaFree(
    [{ ...bItem, ...bPosition }],
    aPosition.gx,
    aPosition.gy,
    aItem.w,
    aItem.h
  );
}

function findNearestFreePosition(items, item, anchor, { columns, rows }) {
  const candidates = [];

  for (let gx = 0; gx <= columns - item.w; gx += 1) {
    for (let gy = 0; gy <= rows - item.h; gy += 1) {
      if (!isAreaFree(items, gx, gy, item.w, item.h)) continue;

      const dx = Math.abs(gx - anchor.gx);
      const dy = Math.abs(gy - anchor.gy);
      candidates.push({ gx, gy, distance: dx + dy, dx, dy });
    }
  }

  candidates.sort((a, b) => (
    a.distance - b.distance
    || a.dy - b.dy
    || a.dx - b.dx
    || a.gx - b.gx
    || a.gy - b.gy
  ));

  const [best] = candidates;
  return best ? { gx: best.gx, gy: best.gy } : null;
}

function isInsideGrid(position, item, columns, rows) {
  return Number.isInteger(position.gx)
    && Number.isInteger(position.gy)
    && position.gx >= 0
    && position.gy >= 0
    && position.gx + item.w <= columns
    && position.gy + item.h <= rows;
}

function invalidLayout() {
  return { isValid: false, positions: [], displacedIds: [] };
}
