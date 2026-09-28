import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectSyncBrowser,
  getSyncBrowserSupport,
  SYNC_BROWSERS
} from '../src/platform/browser/browserCapabilities.js';

test('allows sync in branded Google Chrome', () => {
  const navigatorLike = {
    userAgentData: {
      brands: [
        { brand: 'Chromium', version: '140' },
        { brand: 'Google Chrome', version: '140' }
      ]
    }
  };

  assert.equal(detectSyncBrowser(navigatorLike), SYNC_BROWSERS.CHROME);
  assert.deepEqual(getSyncBrowserSupport(navigatorLike), {
    browser: SYNC_BROWSERS.CHROME,
    canSync: true
  });
});

test('detects Brave before its Chrome-compatible user agent', () => {
  const navigatorLike = {
    brave: { isBrave: () => Promise.resolve(true) },
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'
  };

  assert.equal(detectSyncBrowser(navigatorLike), SYNC_BROWSERS.BRAVE);
  assert.equal(getSyncBrowserSupport(navigatorLike).canSync, false);
});

test('allows the Google Chrome user-agent fallback', () => {
  const navigatorLike = {
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'
  };

  assert.equal(detectSyncBrowser(navigatorLike), SYNC_BROWSERS.CHROME);
});

test('keeps unverified Chromium browsers unsupported', () => {
  const navigatorLike = {
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
  };

  assert.equal(detectSyncBrowser(navigatorLike), SYNC_BROWSERS.UNSUPPORTED);
  assert.equal(getSyncBrowserSupport(navigatorLike).canSync, false);
});
