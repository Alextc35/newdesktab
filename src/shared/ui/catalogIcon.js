import { getCatalogIconMarkup } from '../icons/iconCatalog.js';

const artworkBounds = new Map();
const iconTemplates = new Map();

/** Measure each bundled glyph once so short and tall artwork share a center. */
function fitToArtwork(svg, iconId) {
  if (typeof svg.getBBox !== 'function' || !document.body) return;
  if (!artworkBounds.has(iconId)) {
    const measuringHost = document.createElement('span');
    measuringHost.setAttribute('aria-hidden', 'true');
    measuringHost.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:24px;visibility:hidden;pointer-events:none;';
    measuringHost.append(svg);
    document.body.append(measuringHost);
    try {
      const { x, y, width, height } = svg.getBBox();
      if ([x, y, width, height].every(Number.isFinite) && width + height > 0) {
        // Leave room for the outline, including horizontal or vertical strokes.
        const padding = 1.6;
        artworkBounds.set(iconId, `${x - padding} ${y - padding} ${width + padding * 2} ${height + padding * 2}`);
      }
    } finally {
      svg.remove();
      measuringHost.remove();
    }
  }
  const bounds = artworkBounds.get(iconId);
  if (bounds) svg.setAttribute('viewBox', bounds);
}

/** Only trusted, bundled SVG markup is rendered; saved data contains an ID. */
export function createCatalogIcon(iconId, { fitToContent = false } = {}) {
  if (!iconTemplates.has(iconId)) {
    const markup = getCatalogIconMarkup(iconId);
    if (!markup) return null;
    const container = document.createElement('span');
    container.innerHTML = markup;
    const template = container.firstElementChild;
    template.classList.add('catalog-icon');
    template.dataset.iconId = iconId;
    template.setAttribute('aria-hidden', 'true');
    template.setAttribute('focusable', 'false');
    template.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    iconTemplates.set(iconId, template);
  }
  const svg = iconTemplates.get(iconId).cloneNode(true);
  if (fitToContent) fitToArtwork(svg, iconId);
  return svg;
}
