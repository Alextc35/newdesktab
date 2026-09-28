import { flashError, flashInfo } from './flash.js';
import { syncModalViewport } from './modalManager.js';

export const COMPACT_VIEW_WIDTH = 600;

export function isListView() {
  return window.innerWidth <= COMPACT_VIEW_WIDTH;
}

function updateModalViewport() {
  if (syncModalViewport(isListView())) flashInfo('flash.viewport.suspended');
}

updateModalViewport();
window.addEventListener('resize', updateModalViewport);

/** Guard before preparing editor drafts or changing editing state. */
export function ensurePanelFits() {
  if (!isListView()) return true;
  flashError('flash.viewport.tooNarrow');
  return false;
}
