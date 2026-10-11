const SVG_NS = 'http://www.w3.org/2000/svg';

// Match the rounded, 24px outline icons used by Settings.
const ICON_PATHS = {
  start: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'm16 8-3 5-5 3 3-5Z'],
  organize: ['M3.5 3.5h6v6h-6ZM14.5 3.5h6v6h-6ZM3.5 14.5h6v6h-6ZM14.5 14.5h6v6h-6Z'],
  personalize: ['M4 7h16M4 17h16M8 4v6M16 14v6'],
  protect: ['m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z', 'm8.5 12 2.5 2.5 4.5-5'],
  bookmarks: ['M7 4.5h10v15l-5-3.1L7 19.5Z', 'M12 7.5v5M9.5 10h5'],
  'quick-save': ['M4 3.5h16v17H4Z', 'M4 7.5h16M7 5.5h.01M10 5.5h.01', 'M12 10v7m-3-3 3 3 3-3'],
  keyboard: ['M3.5 6.5h17v11h-17Z', 'M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M7 13.5h.01M10.5 13.5h6.5'],
  shortcuts: ['m13.5 3-9 11h6l-1 7 10-12h-6Z'],
  search: ['M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z', 'm15 15 5.5 5.5'],
  editing: ['m15 4 5 5M4 15 15 4a3.5 3.5 0 0 1 5 5L9 20l-6 1Z'],
  movement: ['M12 3v18M3 12h18', 'm9 6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3'],
  resizing: ['M14 3h7v7M10 21H3v-7', 'M21 3 3 21'],
  'drag-modes': ['M10 3H3v7M14 21h7v-7', 'M8 8h8v8H8Z', 'M16 8h5m-2-2 2 2-2 2'],
  folders: ['M3 7V5.5h6l2.5 2H21v12H3Z'],
  workspaces: ['M3 4h12v12H3ZM15 8h6v13H8v-5', 'M3 8h12'],
  selection: ['M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5', 'm7 12 3 3 7-7'],
  history: ['M3.5 10A8.5 8.5 0 1 1 6 18.5', 'M3.5 4v6h6M12 7v5l3 2'],
  appearance: ['M21 11a9 9 0 1 0-9 10h1a2 2 0 0 0 1.5-3.3 2 2 0 0 1 1.5-3.2h1A4 4 0 0 0 21 11Z', 'M7 9h.01M10 6h.01M15 7h.01M17 10h.01'],
  presets: ['M7 3h14v14H7ZM3 7v14h14', 'm14 6 .9 2.8H18l-2.5 1.8 1 2.9L14 11.7l-2.5 1.8 1-2.9L10 8.8h3.1Z'],
  wallpapers: ['M4 5.5h16v13H4Z', 'm6.5 16 3.6-4 2.8 2.8 2.1-2.3 2.5 3.5M15.5 9h.01'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 7v5l3 2'],
  interface: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z'],
  trash: ['M3.5 6h17M9 6V3.5h6V6', 'm5.5 6 1 14h11l1-14M10 10v6M14 10v6'],
  backup: ['M4 4h16v5H4ZM5.5 9v11h13V9', 'M12 11v6m-3-3 3 3 3-3'],
  sync: ['M4 10a8 8 0 0 1 14-4l2 2M20 14a8 8 0 0 1-14 4l-2-2', 'M20 3v5h-5M4 21v-5h5'],
  compact: ['M3 5h3v3H3ZM3 11h3v3H3ZM3 17h3v3H3Z', 'M10 6.5h11M10 12.5h11M10 18.5h11'],
  data: ['M20 5.5c0 2-16 2-16 0s16-2 16 0Zv13c0 2-16 2-16 0v-13', 'M4 12c0 2 16 2 16 0'],
  learning: ['M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z', 'M12 5v15']
};

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
