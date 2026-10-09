import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const MIME_TYPES = new Map([
  ['.css', 'text/css'], ['.html', 'text/html'], ['.js', 'text/javascript'],
  ['.mjs', 'text/javascript'], ['.json', 'application/json'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.ico', 'image/x-icon'],
  ['.mp4', 'video/mp4'], ['.webm', 'video/webm'], ['.ogg', 'video/ogg'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2']
]);

/** Loopback-only tooling server shared by browser tests and Store screenshots. */
export function createStaticServer(directory) {
  const root = resolve(directory);
  const canonicalRoot = realpath(root);
  const outsideRoot = (file, base = root) => {
    const path = relative(base, file);
    return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
  };

  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const file = resolve(root, `.${pathname}`);
    if (outsideRoot(file) || pathname.split(/[\\/]/).some(part => part.startsWith('.'))) {
      response.writeHead(403).end();
      return;
    }
    try {
      if (outsideRoot(await realpath(file), await canonicalRoot)) {
        response.writeHead(403).end();
        return;
      }
      const metadata = await stat(file);
      if (!metadata.isFile()) {
        response.writeHead(404).end();
        return;
      }
      const body = request.method === 'HEAD' ? undefined : await readFile(file);
      response.writeHead(200, {
        'Content-Type': MIME_TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
        'Content-Length': metadata.size,
        'Cache-Control': 'no-store'
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
}
