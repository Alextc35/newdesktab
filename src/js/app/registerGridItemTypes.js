import { bookmarkGridItem } from '../features/bookmarks/bookmarkGridItem.js';
import { folderGridItem } from '../features/folders/folderGridItem.js';
import { recycleBinGridItem } from '../features/recycle-bin/recycleBinGridItem.js';
import { gridItemRegistry } from '../shared/grid/gridItemRegistry.js';
import { bundledWidgets } from '../widgets/builtin/index.js';
import { widgetRegistry } from '../widgets/widgetRegistry.js';

const builtins = [bookmarkGridItem, folderGridItem, recycleBinGridItem];

/** Registers bundled item types at the application composition boundary. */
export function registerGridItemTypes() {
  for (const definition of builtins) {
    if (!gridItemRegistry.has(definition.type)) gridItemRegistry.register(definition);
  }
  for (const definition of bundledWidgets) {
    if (!widgetRegistry.has(definition.type)) widgetRegistry.register(definition);
  }
  return gridItemRegistry;
}
