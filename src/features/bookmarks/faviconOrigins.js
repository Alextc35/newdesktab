import { getDomain } from '../../shared/urls/vendor/tldts.js';

/** Favicon candidates only; never rewrites a bookmark's navigation URL. */
export function getFaviconOrigins(value) {
  let url;
  try { url = new URL(value); } catch { return []; }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.hostname.endsWith('.internal') || url.hostname.endsWith('.local')) return [];

  const faviconUrl = new URL(url.origin);
  faviconUrl.hostname = faviconUrl.hostname.replace(/\.$/, '');
  const domain = getDomain(faviconUrl.hostname);
  if (domain && faviconUrl.hostname !== domain && /^(www|app)\./.test(faviconUrl.hostname)) {
    faviconUrl.hostname = faviconUrl.hostname.slice(4);
  }
  const origins = [];
  while (true) {
    origins.push(faviconUrl.origin);
    if (!domain || faviconUrl.hostname === domain || !faviconUrl.hostname.endsWith(`.${domain}`)) break;
    faviconUrl.hostname = faviconUrl.hostname.slice(faviconUrl.hostname.indexOf('.') + 1);
  }
  return origins;
}
