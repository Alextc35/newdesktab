const availability = new Map();

export function getFaviconUrl(origin) {
  return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(origin)}&size=64`;
}

/** Google may send a decodable globe with HTTP 404; image.onload alone is insufficient. */
export function isFaviconAvailable(origin) {
  if (!availability.has(origin)) {
    availability.set(origin, Promise.resolve().then(() => fetch(getFaviconUrl(origin), {
      method: 'HEAD', credentials: 'omit', signal: AbortSignal.timeout(5000)
    })).then(response => response.ok, () => null));
  }
  return availability.get(origin);
}
