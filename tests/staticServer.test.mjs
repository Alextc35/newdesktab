import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createStaticServer } from '../scripts/lib/staticServer.mjs';

test('browser tooling serves modules and media without exposing paths outside its root', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'newdesktab-server-'));
  const root = join(directory, 'public');
  await mkdir(root);
  await writeFile(join(root, 'module.js'), 'export const ready = true;');
  await writeFile(join(root, 'wallpaper.webm'), 'video fixture');
  await writeFile(join(root, '.private'), 'hidden');
  await writeFile(join(directory, 'private.txt'), 'outside');
  const server = createStaticServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const module = await fetch(`${origin}/module.js?revision=1`);
  assert.equal(module.status, 200);
  assert.equal(module.headers.get('content-type'), 'text/javascript');
  assert.equal(module.headers.get('cache-control'), 'no-store');
  assert.equal(await module.text(), 'export const ready = true;');
  const video = await fetch(`${origin}/wallpaper.webm`, { method: 'HEAD' });
  assert.equal(video.status, 200);
  assert.equal(video.headers.get('content-type'), 'video/webm');
  assert.equal(video.headers.get('content-length'), '13');
  assert.equal(await video.text(), '');
  for (const [path, status] of [
    ['/missing.js', 404], ['/', 404], ['/.private', 403],
    ['/%2e%2e%2fprivate.txt', 403], ['/%2e%2e%5cprivate.txt', 403], ['/%invalid', 400]
  ]) {
    const result = await fetch(`${origin}${path}`);
    assert.equal(result.status, status, path);
    await result.text();
  }
  const post = await fetch(`${origin}/module.js`, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
  await post.text();
});
