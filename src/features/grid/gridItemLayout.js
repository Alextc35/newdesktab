import { PADDING } from '../../shared/grid/gridGeometry.js';
import { getRowHeight, getRowWidth } from './gridLayout.js';

/** Applies one grid item's persisted cell rectangle to a DOM element. */
export function applyGridItemPosition(container, element, item) {
  const rowWidth = getRowWidth(container);
  const rowHeight = getRowHeight(container);

  element.style.setProperty('--x', `${item.gx * rowWidth}px`);
  element.style.setProperty('--y', `${item.gy * rowHeight}px`);
  element.style.setProperty('--w', `${item.w * rowWidth - PADDING}px`);
  element.style.setProperty('--h', `${item.h * rowHeight - PADDING}px`);
}
