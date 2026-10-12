import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFaviconOrigins } from '../src/features/bookmarks/faviconOrigins.js';

test('tries each parent without sending the destination path, query, credentials or fragment', () => {
  assert.deepEqual(getFaviconOrigins('https://user:pass@a.b.example.com/private?token=secret#files'), [
    'https://a.b.example.com', 'https://b.example.com', 'https://example.com'
  ]);
  assert.deepEqual(getFaviconOrigins('https://tajamar365.sharepoint.com/_layouts/15/sharepoint.aspx/discover'), [
    'https://tajamar365.sharepoint.com', 'https://sharepoint.com'
  ]);
});

test('stops at registrable domains, including country suffixes and PSL exceptions', () => {
  assert.deepEqual(getFaviconOrigins('http://a.b.example.co.uk:8080/private'), [
    'http://a.b.example.co.uk:8080', 'http://b.example.co.uk:8080', 'http://example.co.uk:8080'
  ]);
  assert.deepEqual(getFaviconOrigins('https://a.city.kawasaki.jp'), [
    'https://a.city.kawasaki.jp', 'https://city.kawasaki.jp'
  ]);
  assert.deepEqual(getFaviconOrigins('https://sharepoint.com'), ['https://sharepoint.com']);
});

test('normalizes www/app subdomains but preserves a registrable domain named app', () => {
  assert.deepEqual(getFaviconOrigins('https://www.example.com'), ['https://example.com']);
  assert.deepEqual(getFaviconOrigins('http://app.example.co.uk:8080'), ['http://example.co.uk:8080']);
  assert.deepEqual(getFaviconOrigins('https://app.co.uk'), ['https://app.co.uk']);
});

test('handles fully qualified DNS names without passing the registrable boundary', () => {
  assert.deepEqual(getFaviconOrigins('https://portal.example.com./path'), [
    'https://portal.example.com', 'https://example.com'
  ]);
});

test('does not climb IP addresses and excludes internal or non-web destinations', () => {
  assert.deepEqual(getFaviconOrigins('https://192.0.2.1:8443/private'), ['https://192.0.2.1:8443']);
  assert.deepEqual(getFaviconOrigins('https://[2001:db8::1]/private'), ['https://[2001:db8::1]']);
  for (const url of ['', 'not a URL', 'https://app.example.local', 'https://portal.example.internal', 'file:///C:/test', 'mailto:test@example.com']) {
    assert.deepEqual(getFaviconOrigins(url), []);
  }
});
