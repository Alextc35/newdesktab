/** Pure spatial routing shared by every keyboard-navigable grid item. */
const HORIZONTAL_DIRECTIONS = new Set(['ArrowLeft', 'ArrowRight']);
const VERTICAL_DIRECTIONS = new Set(['ArrowUp', 'ArrowDown']);

/**
 * Finds the next grid item from a remembered cell inside the active item.
 *
 * Movement first follows the exact row or column. Horizontal movement then
 * continues in reading order across rows, while vertical movement falls back
 * to the closest column in the requested direction. At the outer grid edges,
 * both axes wrap so every visible item remains keyboard reachable.
 *
 * @param {Array<object>} items
 * @param {object} current
 * @param {'ArrowLeft'|'ArrowRight'|'ArrowUp'|'ArrowDown'} direction
 * @param {{gx:number, gy:number}|null} point
 * @returns {{item:object, point:{gx:number, gy:number}, wrapped:boolean}|null}
 */
export function findGridKeyboardRoute(items, current, direction, point = null) {
  if (!current || (!HORIZONTAL_DIRECTIONS.has(direction)
    && !VERTICAL_DIRECTIONS.has(direction))) return null;

  const cursor = normalizePoint(current, point);
  const candidates = items
    .filter(item => item?.id !== current.id)
    .map(item => ({
      item,
      distance: directionalDistance(current, item, direction, cursor)
    }));
  const inLane = candidates
    .filter(candidate => candidate.distance?.inLane)
    .sort(compareDirectionalCandidates);

  if (inLane.length) {
    const item = inLane[0].item;
    return {
      item,
      point: entryPoint(item, direction, cursor),
      wrapped: false
    };
  }

  if (HORIZONTAL_DIRECTIONS.has(direction)) {
    return horizontalRowRoute(candidates.map(candidate => candidate.item), direction, cursor);
  }

  const forward = candidates
    .filter(candidate => candidate.distance)
    .sort(compareDirectionalCandidates);
  if (forward.length) {
    const item = forward[0].item;
    return {
      item,
      point: entryPoint(item, direction, cursor),
      wrapped: false
    };
  }

  return verticalWrapRoute(candidates.map(candidate => candidate.item), direction, cursor);
}

/** Returns the top-left navigation cell for an item. */
export function getGridItemNavigationAnchor(item) {
  return { gx: item.gx, gy: item.gy };
}

function directionalDistance(current, candidate, direction, point) {
  const currentRight = current.gx + current.w;
  const currentBottom = current.gy + current.h;
  const candidateRight = candidate.gx + candidate.w;
  const candidateBottom = candidate.gy + candidate.h;

  switch (direction) {
    case 'ArrowRight':
      if (candidate.gx < currentRight) return null;
      return {
        inLane: contains(point.gy, candidate.gy, candidateBottom),
        forward: candidate.gx - currentRight,
        crossAxis: distanceToSpan(point.gy, candidate.gy, candidateBottom)
      };
    case 'ArrowLeft':
      if (candidateRight > current.gx) return null;
      return {
        inLane: contains(point.gy, candidate.gy, candidateBottom),
        forward: current.gx - candidateRight,
        crossAxis: distanceToSpan(point.gy, candidate.gy, candidateBottom)
      };
    case 'ArrowDown':
      if (candidate.gy < currentBottom) return null;
      return {
        inLane: contains(point.gx, candidate.gx, candidateRight),
        forward: candidate.gy - currentBottom,
        crossAxis: distanceToSpan(point.gx, candidate.gx, candidateRight)
      };
    case 'ArrowUp':
      if (candidateBottom > current.gy) return null;
      return {
        inLane: contains(point.gx, candidate.gx, candidateRight),
        forward: current.gy - candidateBottom,
        crossAxis: distanceToSpan(point.gx, candidate.gx, candidateRight)
      };
    default:
      return null;
  }
}

function compareDirectionalCandidates(a, b) {
  return a.distance.forward - b.distance.forward
    || a.distance.crossAxis - b.distance.crossAxis
    || compareItems(a.item, b.item);
}

function horizontalRowRoute(items, direction, point) {
  const forwardRows = items
    .map(item => horizontalRowCandidate(item, direction, point.gy, false))
    .filter(Boolean);
  const pool = forwardRows.length
    ? forwardRows
    : items.map(item => horizontalRowCandidate(item, direction, point.gy, true));
  const ordered = pool.filter(Boolean).sort((a, b) => direction === 'ArrowRight'
    ? a.row - b.row || a.column - b.column || compareItems(a.item, b.item)
    : b.row - a.row || b.column - a.column || compareItems(a.item, b.item));
  const selected = ordered[0];
  if (!selected) return null;

  return {
    item: selected.item,
    point: { gx: selected.column, gy: selected.row },
    wrapped: true
  };
}

function horizontalRowCandidate(item, direction, currentRow, cyclic) {
  const right = item.gx + item.w;
  if (direction === 'ArrowRight') {
    if (!cyclic && item.gy <= currentRow) return null;
    return { item, row: item.gy, column: item.gx };
  }

  if (!cyclic && item.gy >= currentRow) return null;
  return { item, row: item.gy, column: right - 1 };
}

function verticalWrapRoute(items, direction, point) {
  const candidates = items.map(item => {
    const right = item.gx + item.w;
    const bottom = item.gy + item.h;
    return {
      item,
      row: direction === 'ArrowDown' ? item.gy : bottom - 1,
      column: clamp(point.gx, item.gx, right - 1),
      crossAxis: distanceToSpan(point.gx, item.gx, right)
    };
  }).sort((a, b) => direction === 'ArrowDown'
    ? a.row - b.row || a.crossAxis - b.crossAxis || compareItems(a.item, b.item)
    : b.row - a.row || a.crossAxis - b.crossAxis || compareItems(a.item, b.item));
  const selected = candidates[0];
  if (!selected) return null;

  return {
    item: selected.item,
    point: { gx: selected.column, gy: selected.row },
    wrapped: true
  };
}

function entryPoint(item, direction, point) {
  const right = item.gx + item.w;
  const bottom = item.gy + item.h;
  switch (direction) {
    case 'ArrowRight':
      return { gx: item.gx, gy: clamp(point.gy, item.gy, bottom - 1) };
    case 'ArrowLeft':
      return { gx: right - 1, gy: clamp(point.gy, item.gy, bottom - 1) };
    case 'ArrowDown':
      return { gx: clamp(point.gx, item.gx, right - 1), gy: item.gy };
    case 'ArrowUp':
      return { gx: clamp(point.gx, item.gx, right - 1), gy: bottom - 1 };
    default:
      return getGridItemNavigationAnchor(item);
  }
}

function normalizePoint(item, point) {
  const right = item.gx + item.w - 1;
  const bottom = item.gy + item.h - 1;
  return {
    gx: clamp(Number.isFinite(point?.gx) ? point.gx : item.gx, item.gx, right),
    gy: clamp(Number.isFinite(point?.gy) ? point.gy : item.gy, item.gy, bottom)
  };
}

function contains(value, start, end) {
  return value >= start && value < end;
}

function distanceToSpan(value, start, end) {
  return Math.abs(value - clamp(value, start, end - 1));
}

function compareItems(a, b) {
  return a.gy - b.gy || a.gx - b.gx || String(a.id).localeCompare(String(b.id));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
