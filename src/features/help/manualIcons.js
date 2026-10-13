import { INTERFACE_ICON_PATHS as ICON_PATHS } from '../../shared/icons/interfaceIconPaths.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Decorative section icons share the interface palette and never enter the tab order. */
export function createManualIcon(id) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('manual-icon');
  svg.dataset.manualIcon = id;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.65');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ICON_PATHS[id] ?? ICON_PATHS.learning) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
