/**
 * Creates a registry that lets the grid render and decorate item types without
 * importing feature-specific modules.
 *
 * A registered definition adapts persisted feature data to the structural
 * GridItem contract. The item itself does not need a persisted `type` field.
 */
export function createGridItemRegistry() {
  const definitions = new Map();

  return Object.freeze({
    register(definition) {
      const normalized = validateDefinition(definition);
      if (definitions.has(normalized.type)) {
        throw new Error(`Grid item type is already registered: ${normalized.type}`);
      }
      definitions.set(normalized.type, normalized);
      return normalized;
    },

    has(type) {
      return definitions.has(type);
    },

    get(type) {
      return definitions.get(type) ?? null;
    },

    entries(state, { view = 'grid' } = {}) {
      const result = [];
      for (const definition of orderedDefinitions(definitions, view)) {
        const selected = definition.select(state);
        if (!Array.isArray(selected)) {
          throw new TypeError(`Grid item selector must return an array: ${definition.type}`);
        }
        const items = view === 'list'
          ? [...selected].sort(compareByGridPosition)
          : selected;
        for (const entry of items) {
          const normalizedEntry = normalizeEntry(entry, definition.type);
          result.push({ definition, ...normalizedEntry });
        }
      }
      return result;
    },

    resolveElement(element, state) {
      for (const definition of definitions.values()) {
        if (!element.matches(definition.selector)) continue;
        const id = definition.getElementId(element);
        const match = definition.select(state)
          .map(entry => normalizeEntry(entry, definition.type))
          .find(entry => entry.item.id === id);
        return match ? { definition, ...match } : null;
      }
      return null;
    },

    types() {
      return [...definitions.keys()];
    },

    selectors() {
      return [...definitions.values()].map(definition => definition.selector);
    }
  });
}

export const gridItemRegistry = createGridItemRegistry();

function validateDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('Grid item definition must be an object.');
  }
  if (typeof definition.type !== 'string' || !/^[a-z][a-z0-9-]*$/.test(definition.type)) {
    throw new TypeError('Grid item type must be a lowercase kebab-case identifier.');
  }
  for (const key of ['select', 'render', 'getElementId']) {
    if (typeof definition[key] !== 'function') {
      throw new TypeError(`Grid item definition requires ${key}().`);
    }
  }
  if (typeof definition.selector !== 'string' || !definition.selector.trim()) {
    throw new TypeError('Grid item definition requires a DOM selector.');
  }
  for (const key of [
    'open',
    'edit',
    'remove',
    'getRemovalConfirmation',
    'getRemovalSuccessMessage'
  ]) {
    if (definition[key] !== undefined && typeof definition[key] !== 'function') {
      throw new TypeError(`Grid item ${key} must be a function.`);
    }
  }
  for (const key of ['selectable', 'clearKeyboardOnOpen']) {
    if (definition[key] !== undefined && typeof definition[key] !== 'boolean') {
      throw new TypeError(`Grid item ${key} must be a boolean.`);
    }
  }

  return Object.freeze({
    ...definition,
    order: Object.freeze({
      grid: Number.isFinite(definition.order?.grid) ? definition.order.grid : 0,
      list: Number.isFinite(definition.order?.list) ? definition.order.list : 0
    })
  });
}

function orderedDefinitions(definitions, view) {
  return [...definitions.values()].sort((a, b) => a.order[view] - b.order[view]);
}

function normalizeEntry(entry, type) {
  const normalized = entry?.item ? entry : { item: entry };
  if (!normalized.item || typeof normalized.item.id !== 'string') {
    throw new TypeError(`Grid item selector returned an invalid ${type} item.`);
  }
  return normalized;
}

function compareByGridPosition(a, b) {
  const first = a?.item ?? a;
  const second = b?.item ?? b;
  return first.gy - second.gy
    || first.gx - second.gx
    || first.id.localeCompare(second.id);
}
