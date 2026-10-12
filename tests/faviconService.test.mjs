import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFaviconUrl, isFaviconAvailable } from '../src/platform/images/faviconService.js';

test('checks HTTP status once per origin, including decodable generic error images', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: new URL(url).searchParams.get('url') === 'https://available.example.com' };
  };
  try {
    assert.deepEqual(await Promise.all([
      isFaviconAvailable('https://missing.example.com'), isFaviconAvailable('https://missing.example.com'),
      isFaviconAvailable('https://available.example.com')
    ]), [false, false, true]);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.options.method === 'HEAD' && call.options.credentials === 'omit'));
    assert.ok(calls.every(call => new URL(call.url).origin === 'https://t3.gstatic.com'));
  } finally { globalThis.fetch = previous; }
});

test('a status check failure preserves a loaded image instead of guessing it is missing', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('Network unavailable'); };
  try {
    assert.equal(await isFaviconAvailable('https://unknown.example.com'), null);
  } finally { globalThis.fetch = previous; }
  assert.equal(new URL(getFaviconUrl('https://example.com')).searchParams.get('url'), 'https://example.com');
});
