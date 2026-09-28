import { clearBookmarkHistory, getState, setState } from '../state/appStore.js';
import { findFirstFreeSlot } from '../shared/grid/gridPlacement.js';
import { getGridItemsInGroup } from '../features/grid/gridSelectors.js';
import { getActiveWorkspaceId } from '../features/workspaces/workspaceSelectors.js';
import { normalizeWidgetInstance } from './widgetModel.js';
import { widgetRegistry } from './widgetRegistry.js';

/**
 * Adds an instance of a registered bundled widget to the active workspace.
 * Widget-specific code owns the config object passed in the draft.
 *
 * @param {Partial<WidgetInstance> & {type: string}} draft
 * @param {{columns: number, rows: number, idFactory?: () => string, now?: number}} bounds
 * @returns {WidgetInstance|null}
 */
export function addWidget(draft, {
  columns,
  rows,
  idFactory = () => crypto.randomUUID(),
  now = Date.now()
} = {}) {
  if (!widgetRegistry.has(draft?.type)) return null;

  const { data } = getState();
  const groupId = getActiveWorkspaceId(data);
  const candidate = normalizeWidgetInstance({
    ...draft,
    id: idFactory(),
    groupId,
    createdAt: now,
    updatedAt: now
  }, { now });
  if (!candidate) return null;

  const position = findFirstFreeSlot(getGridItemsInGroup(data, groupId), {
    columns,
    rows,
    w: candidate.w,
    h: candidate.h
  });
  if (!position) return null;

  const widget = { ...candidate, ...position };
  setState({ data: { widgets: [...data.widgets, widget] } });
  return widget;
}

/** Updates the common record and opaque configuration of one widget. */
export function updateWidgetById(widgetId, patch) {
  const { data } = getState();
  const current = data.widgets.find(widget => widget.id === widgetId);
  if (!current || !widgetRegistry.has(current.type)) return null;

  const updated = normalizeWidgetInstance({
    ...current,
    ...patch,
    id: current.id,
    type: current.type,
    createdAt: current.createdAt,
    updatedAt: Date.now()
  });
  if (!updated) return null;

  setState({
    data: {
      widgets: data.widgets.map(widget => widget.id === widgetId ? updated : widget)
    }
  });
  return updated;
}

/** Removes one widget; callers choose whether the operation remains undoable. */
export function deleteWidgetById(widgetId, { recordHistory = true } = {}) {
  const { data } = getState();
  const widgets = data.widgets.filter(widget => widget.id !== widgetId);
  if (widgets.length === data.widgets.length) return false;
  setState({ data: { widgets } }, { recordHistory });
  if (!recordHistory) clearBookmarkHistory();
  return true;
}
