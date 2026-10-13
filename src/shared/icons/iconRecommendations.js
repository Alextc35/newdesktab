import { normalizeCatalogIconId } from './iconCatalog.js';

export function normalizeIconSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

const cases = [
  [/gmail|outlook|proton|correo|correio|\bmail\b|email/, ['mail', 'message', 'people', 'ui-bookmark']],
  [/calendar|calendario|agenda/, ['calendar', 'ui-clock', 'tasks', 'ui-shortcuts']],
  [/github|gitlab|stackoverflow|codigo|\bcode\b|developer|programa/, ['code', 'projects', 'ui-data', 'ui-backup']],
  [/spotify|soundcloud|bandcamp|musica|music|podcast|audio/, ['music', 'headphones', 'video', 'heart']],
  [/steam|epicgames|gaming|juegos|jogos|videojuegos/, ['game', 'ui-shortcuts', 'star', 'people']],
  [/youtube|twitch|netflix|video|cine|filme/, ['video', 'camera', 'game', 'star']],
  [/figma|canva|dribbble|diseno|design|arte/, ['design', 'ui-appearance', 'ui-wallpapers', 'camera']],
  [/amazon|ebay|aliexpress|compras|shopping|tienda|loja/, ['cart', 'card', 'tag', 'heart']],
  [/banco|bank|finanzas|financas|finance|pagos/, ['card', 'chart', 'ui-lock', 'ui-data']],
  [/notion|onenote|notas|notes|apuntes/, ['notes', 'docs', 'tasks', 'ideas']],
  [/docs|drive|document|archivos|arquivos|\bpdf\b/, ['docs', 'ui-folders', 'ui-cloud', 'ui-backup']],
  [/educa|universi|escuela|escola|estudio|estudo|lectura|leitura|wikipedia/, ['ui-learning', 'ideas', 'notes', 'ui-start']],
  [/reddit|twitter|facebook|instagram|social|comunidad|comunidade|amigos/, ['people', 'message', 'heart', 'ui-interface']],
  [/trabajo|trabalho|work|empresa|business|proyecto|projeto/, ['briefcase', 'projects', 'tasks', 'calendar']],
  [/geometr|matemat|figuras|formas|shapes/, ['circle', 'square', 'triangle', 'hexagon']]
];

/** Local suggestions never change the saved choice or request site information. */
export function getIconRecommendations(value = {}, type = 'bookmark') {
  let site = '';
  try { site = new URL(value.url).hostname; } catch { /* Name-only sections are supported. */ }
  const text = normalizeIconSearch(`${value.name ?? ''} ${site}`);
  const defaults = type === 'folder' ? ['ui-folders', 'projects', 'star', 'ui-learning']
    : ['mail', 'docs', 'ui-bookmark', 'star'];
  const suggested = cases.filter(([match]) => match.test(text)).flatMap(([, icons]) => icons);
  return [...new Set([...suggested, ...defaults])].filter(normalizeCatalogIconId).slice(0, 4);
}
