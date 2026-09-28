import { GRID_COLS, GRID_ROWS } from '../shared/grid/gridGeometry.js';

const WIDGET_TYPE_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Whether a value can identify one bundled widget implementation. */
export function isWidgetType(value) {
  return typeof value === 'string' && WIDGET_TYPE_PATTERN.test(value);
}

/**
 * Normalizes the common, persisted part of a bundled widget. Widget-specific
 * configuration stays opaque and is owned by the widget that registered the
 * matching type.
 *
 * @param {*} value
 * @param {{index?: number, now?: number, workspaceIds?: Set<string>}} [options]
 * @returns {WidgetInstance|null}
 */
export function normalizeWidgetInstance(value, {
  index = 0,
  now = Date.now(),
  workspaceIds = null
} = {}) {
  if (!value || typeof value !== 'object' || !isWidgetType(value.type)) return null;

  const type = value.type;
  const w = clampGridSize(value.w, GRID_COLS);
  const h = clampGridSize(value.h, GRID_ROWS);
  const requestedGroupId = typeof value.groupId === 'string' && value.groupId
    ? value.groupId
    : null;
  const groupId = workspaceIds instanceof Set && !workspaceIds.has(requestedGroupId)
    ? null
    : requestedGroupId;

  return {
    id: typeof value.id === 'string' && value.id.trim()
      ? value.id.trim()
      : `widget-${type}-${now}-${index}`,
    type,
    version: Number.isInteger(value.version) && value.version > 0 ? value.version : 1,
    gx: Math.min(GRID_COLS - w, normalizeGridPosition(value.gx)),
    gy: Math.min(GRID_ROWS - h, normalizeGridPosition(value.gy)),
    w,
    h,
    groupId,
    config: isPlainRecord(value.config) ? structuredClone(value.config) : {},
    createdAt: normalizeTimestamp(value.createdAt, now),
    updatedAt: normalizeTimestamp(value.updatedAt, now)
  };
}

/** Normalizes the persisted collection while retaining unknown bundled types. */
export function normalizeWidgets(value, options = {}) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((widget, index) => {
    const normalized = normalizeWidgetInstance(widget, { ...options, index });
    return normalized ? [normalized] : [];
  });
}

function normalizeGridPosition(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function clampGridSize(value, maximum) {
  if (!Number.isInteger(value) || value < 1) return 1;
  return Math.min(maximum, value);
}

function normalizeTimestamp(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
