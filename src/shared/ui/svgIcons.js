/** Shared SVG factories for feature-owned views. */
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_KINDS = new Set(['bookmark', 'folder', 'recycle-bin']);
const SETTINGS_ICON_PATHS = Object.freeze({
  general: [
    'M4 7h8m4 0h4M4 12h3m4 0h9M4 17h10m4 0h2',
    'M12 5v4M7 10v4M14 15v4'
  ],
  sync: [
    'M7.5 18H17a4 4 0 0 0 .8-7.92A6 6 0 0 0 6.35 8.5 4.75 4.75 0 0 0 7.5 18Z',
    'm9 13 2-2 2 2m-4 2-2 2-2-2'
  ],
  theme: [
    'M4 5.5h16v13H4Z',
    'm6.5 16 3.6-4 2.8 2.8 2.1-2.3 2.5 3.5M15.5 9h.01'
  ],
  bookmark: ['M7 4.5h10v15l-5-3.1L7 19.5Z'],
  shortcuts: [
    'M3.5 6.5h17v11h-17Z',
    'M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M7 13.5h.01M10.5 13.5h6.5'
  ],
  language: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18',
    'M12 3c2.2 2.45 3.25 5.45 3.25 9S14.2 18.55 12 21c-2.2-2.45-3.25-5.45-3.25-9S9.8 5.45 12 3Z'
  ],
  information: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    'M12 10.5v5.5M12 7.5h.01'
  ]
});

/** Creates the fixed-ratio folder artwork shared by every dynamic folder surface. */
export function createFolderSvg() {
  const svg = createSvg('0 0 136 100', 'folder-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.append(
    createPath(
      'M12 26V14a8 8 0 0 1 8-8h32a10 10 0 0 1 8 4l12 16H12Z',
      'folder-tab'
    ),
    createPath(
      'M7 24h122a7 7 0 0 1 7 7v59a10 10 0 0 1-10 10H10A10 10 0 0 1 0 90V31a7 7 0 0 1 7-7Z',
      'folder-svg-body'
    ),
    createPath('M13 27h110', 'folder-svg-highlight')
  );
  return svg;
}

/** Creates the fixed-ratio recycle-bin artwork shared by cards, lists and previews. */
export function createRecycleBinSvg() {
  const svg = createSvg('0 0 92 108', 'recycle-bin-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.append(
    createPath('M34 14V9.5A5.5 5.5 0 0 1 39.5 4h13A5.5 5.5 0 0 1 58 9.5V14',
      'recycle-bin-handle'),
    createPath('M15 16.5A6.5 6.5 0 0 1 21.5 10h49a6.5 6.5 0 0 1 6.5 6.5V25H15v-8.5Z',
      'recycle-bin-lid'),
    createPath('M20 31h52l-5.4 64.7a9 9 0 0 1-9 8.3H34.4a9 9 0 0 1-9-8.3L20 31Z',
      'recycle-bin-can'),
    createPath('M35 46v39M57 46v39', 'recycle-bin-slots'),
    createPath('M24 33h44', 'recycle-bin-sheen')
  );
  return svg;
}

/** Creates the compact edit indicator used on editable modal glyphs. */
export function createEditIndicatorSvg() {
  const svg = createSvg('0 0 24 24', 'edit-indicator-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.append(
    createPath('M5 19h3.5L19 8.5 15.5 5 5 15.5V19Z', 'edit-indicator-pencil'),
    createPath('m13.8 6.7 3.5 3.5', 'edit-indicator-detail')
  );
  return svg;
}

/** Creates a pair of real SVG assets and lets CSS select the active interface theme. */
export function createThemedAssetIcon(kind) {
  if (!ICON_KINDS.has(kind)) throw new TypeError(`Unknown NewDeskTab icon: ${kind}`);

  const wrapper = document.createElement('span');
  wrapper.className = `newdesktab-themed-icon newdesktab-${kind}-icon`;
  wrapper.setAttribute('aria-hidden', 'true');
  for (const theme of ['light', 'dark']) {
    const image = document.createElement('img');
    image.className = `newdesktab-themed-icon-${theme}`;
    image.src = new URL(`../../assets/icons/${kind}-${theme}.svg`, import.meta.url).href;
    image.alt = '';
    image.draggable = false;
    wrapper.append(image);
  }
  return wrapper;
}

/** Creates one of the monochrome settings navigation icons. */
export function createSettingsSectionSvg(kind) {
  const paths = SETTINGS_ICON_PATHS[kind];
  if (!paths) throw new TypeError(`Unknown settings icon: ${kind}`);

  const svg = createSvg('0 0 24 24', 'settings-section-svg');
  svg.dataset.icon = kind;
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.append(...paths.map(path => createPath(path, 'settings-section-path')));
  return svg;
}

function createSvg(viewBox, className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add(className);
  return svg;
}

function createPath(d, className) {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.classList.add(className);
  return path;
}
