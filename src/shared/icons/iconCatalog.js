import { COMMON_ICON_PATHS, INTERFACE_ICON_PATHS, UTILITY_ICON_PATHS } from './interfaceIconPaths.js';

const pathIcons = (paths, prefix = '') => Object.entries(paths).map(([id, artwork]) => ({
  id: `${prefix}${id}`,
  body: artwork.map(d => `<path d="${d}"/>`).join('')
}));

/** Bundled artwork, shared by saved items, interface views and Store screenshots. */
export const ICON_CATALOG = Object.freeze([
  { id: 'mail', body: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>' },
  { id: 'calendar', body: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 3h2"/>' },
  { id: 'notes', body: '<path d="M7 3h8l4 4v14H5V3h2Zm8 0v5h4M9 12h6m-6 4h6"/>' },
  { id: 'projects', body: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>' },
  { id: 'design', body: '<path d="m4 20 2-7L17 2l5 5-11 11-7 2Zm2-7 5 5m3-13 5 5M4 20h16"/>' },
  { id: 'music', body: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>' },
  { id: 'tasks', body: '<path d="m3 6 2 2 3-4m-5 9 2 2 3-4m-5 9 2 2 3-4M12 6h9m-9 7h9m-9 7h9"/>' },
  { id: 'ideas', body: '<path d="M9 18h6m-6 3h6M8 15a7 7 0 1 1 8 0l-1 3H9l-1-3Z"/>' },
  { id: 'docs', body: '<rect x="6" y="3" width="14" height="18" rx="2"/><path d="M3 7v13a3 3 0 0 0 3 3m4-15h6m-6 4h6m-6 4h4"/>' },
  ...pathIcons(INTERFACE_ICON_PATHS, 'ui-'),
  ...pathIcons(UTILITY_ICON_PATHS, 'ui-'),
  ...pathIcons(COMMON_ICON_PATHS),
  { id: 'video', body: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 6 3-6 3Z"/>' }
].map(Object.freeze));

const iconsById = new Map(ICON_CATALOG.map(icon => [icon.id, icon]));

/** Unknown or legacy values safely retain the original icon. */
export function normalizeCatalogIconId(value) {
  return iconsById.has(value) ? value : null;
}

export function getCatalogIconMarkup(value) {
  const icon = iconsById.get(value);
  if (!icon) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon.body}</svg>`;
}
