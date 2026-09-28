import { gridItemRegistry } from '../shared/grid/gridItemRegistry.js';
import { isWidgetType } from './widgetModel.js';

const RESERVED_GRID_ITEM_TYPES = new Set(['bookmark', 'folder', 'recycle-bin']);

/**
 * Adapts bundled widgets to the generic grid-item protocol. The registry owns
 * common selection and DOM identity so an individual widget only supplies its
 * renderer and optional editing behavior.
 */
export function createWidgetRegistry(itemRegistry = gridItemRegistry) {
  const definitions = new Map();
  const initializedTypes = new Set();

  return Object.freeze({
    register(definition) {
      const widget = validateDefinition(definition);
      if (definitions.has(widget.type)) {
        throw new Error(`Widget type is already registered: ${widget.type}`);
      }

      itemRegistry.register(createGridItemAdapter(widget));
      definitions.set(widget.type, widget);
      return widget;
    },

    has(type) {
      return definitions.has(type);
    },

    get(type) {
      return definitions.get(type) ?? null;
    },

    types() {
      return [...definitions.keys()];
    },

    /** Returns the registered widgets that expose a user-facing creation flow. */
    catalog() {
      return [...definitions.values()].filter(widget => widget.catalog && widget.create);
    },

    /** Initializes each registered widget's optional application surface once. */
    initialize(context = {}) {
      const initialized = [];
      for (const widget of definitions.values()) {
        if (initializedTypes.has(widget.type)) continue;
        widget.initialize?.(context);
        initializedTypes.add(widget.type);
        initialized.push(widget.type);
      }
      return initialized;
    }
  });
}

export const widgetRegistry = createWidgetRegistry();

/** Registers one statically bundled widget with the application registry. */
export function registerWidget(definition) {
  return widgetRegistry.register(definition);
}

/** Initializes the application surfaces owned by all registered widgets. */
export function initializeWidgets(context) {
  return widgetRegistry.initialize(context);
}

function validateDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('Widget definition must be an object.');
  }
  if (!isWidgetType(definition.type)) {
    throw new TypeError('Widget type must be a lowercase kebab-case identifier.');
  }
  if (RESERVED_GRID_ITEM_TYPES.has(definition.type)) {
    throw new TypeError(`Widget type is reserved by NewDeskTab: ${definition.type}`);
  }
  if (typeof definition.render !== 'function') {
    throw new TypeError('Widget definition requires render().');
  }
  for (const key of [
    'initialize',
    'create',
    'enableEditing',
    'open',
    'edit',
    'remove',
    'getRemovalConfirmation',
    'getRemovalSuccessMessage'
  ]) {
    if (definition[key] !== undefined && typeof definition[key] !== 'function') {
      throw new TypeError(`Widget ${key} must be a function.`);
    }
  }
  for (const key of ['selectable', 'clearKeyboardOnOpen']) {
    if (definition[key] !== undefined && typeof definition[key] !== 'boolean') {
      throw new TypeError(`Widget ${key} must be a boolean.`);
    }
  }

  let catalog = null;
  if (definition.catalog !== undefined) {
    if (!definition.catalog || typeof definition.catalog !== 'object') {
      throw new TypeError('Widget catalog metadata must be an object.');
    }
    for (const key of ['nameKey', 'descriptionKey', 'icon']) {
      if (typeof definition.catalog[key] !== 'string' || !definition.catalog[key].trim()) {
        throw new TypeError(`Widget catalog ${key} must be a non-empty string.`);
      }
    }
    if (typeof definition.create !== 'function') {
      throw new TypeError('Catalog widgets require create().');
    }
    catalog = Object.freeze({ ...definition.catalog });
  }

  return Object.freeze({
    ...definition,
    catalog,
    order: Object.freeze({
      grid: Number.isFinite(definition.order?.grid) ? definition.order.grid : 40,
      list: Number.isFinite(definition.order?.list) ? definition.order.list : 40
    })
  });
}

function createGridItemAdapter(widget) {
  const adapter = {
    type: widget.type,
    order: widget.order,
    selector: `[data-widget-type="${widget.type}"][data-widget-id]`,
    getElementId: element => element.dataset.widgetId,
    selectionKind: 'widget',
    selectable: widget.selectable ?? true,
    clearKeyboardOnOpen: widget.clearKeyboardOnOpen ?? false,
    select(state) {
      const activeWorkspaceId = state.data.settings?.activeBookmarkGroupId ?? null;
      return (state.data.widgets ?? []).filter(instance => (
        instance.type === widget.type
        && (instance.groupId ?? null) === activeWorkspaceId
      ));
    },
    render(context) {
      const element = widget.render({
        ...context,
        widget: context.item,
        config: context.item.config
      });
      if (!element?.dataset) {
        throw new TypeError(`Widget renderer must return a DOM element: ${widget.type}`);
      }
      element.dataset.widgetId = context.item.id;
      element.dataset.widgetType = widget.type;
      return element;
    }
  };

  if (widget.enableEditing) {
    adapter.enableEditing = (container, element, item, entry) => (
      widget.enableEditing(container, element, item, {
        ...entry,
        widget: item,
        config: item.config
      })
    );
  }

  for (const key of [
    'open',
    'edit',
    'remove',
    'getRemovalConfirmation',
    'getRemovalSuccessMessage'
  ]) {
    if (!widget[key]) continue;
    adapter[key] = context => widget[key]({
      ...context,
      widget: context.item,
      config: context.item.config
    });
  }

  return adapter;
}
