import assert from 'node:assert/strict';
import test from 'node:test';
import { claimReleaseNotes, DEVICE_RELEASE_NOTES_KEY } from '../src/platform/storage/deviceReleaseNotes.js';

const data = {};
let queue = Promise.resolve();
let failure = null;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  locks: { request(_name, operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  } }
} });
globalThis.chrome = { runtime: { lastError: null }, storage: { local: {
  get(_key, callback) { callback(structuredClone(data)); },
  set(items, callback) {
    chrome.runtime.lastError = failure;
    if (!failure) Object.assign(data, structuredClone(items));
    callback();
    chrome.runtime.lastError = null;
  }
} } };

test('offers the first public release once without modifying workspace or device preferences', async () => {
  data.settings = { language: 'es' };
  data.newdesktabDailyTips = { enabled: false };
  assert.equal(await claimReleaseNotes('1.0.0'), true);
  assert.equal(await claimReleaseNotes('1.0.0'), false);
  assert.deepEqual(data[DEVICE_RELEASE_NOTES_KEY], { version: '1.0.0' });
  assert.deepEqual(data.settings, { language: 'es' });
  assert.deepEqual(data.newdesktabDailyTips, { enabled: false });
});

test('patches advance numerically and downgrades do not repeat previously offered notes', async () => {
  for (const version of ['1.0.1', '1.0.9', '1.0.10', '1.1.0']) {
    assert.equal(await claimReleaseNotes(version), true, version);
    assert.equal(await claimReleaseNotes(version), false, version);
  }
  assert.equal(await claimReleaseNotes('1.0.0'), false);
  assert.equal(await claimReleaseNotes('1.1.0.0'), false);
  assert.deepEqual(data[DEVICE_RELEASE_NOTES_KEY], { version: '1.1.0' });
});

test('concurrent tabs claim only one notice for a new release', async () => {
  delete data[DEVICE_RELEASE_NOTES_KEY];
  assert.deepEqual(await Promise.all([claimReleaseNotes('1.0.0'), claimReleaseNotes('1.0.0')]), [true, false]);
});

test('background or busy tabs do not consume the release notice', async () => {
  delete data[DEVICE_RELEASE_NOTES_KEY];
  assert.equal(await claimReleaseNotes('1.0.0', { canClaim: () => false }), false);
  assert.equal(data[DEVICE_RELEASE_NOTES_KEY], undefined);
  assert.equal(await claimReleaseNotes('1.0.0'), true);
});

test('failed writes leave the notice available for a successful retry', async () => {
  delete data[DEVICE_RELEASE_NOTES_KEY];
  failure = { message: 'Storage unavailable' };
  await assert.rejects(claimReleaseNotes('1.0.0'), /Storage unavailable/);
  assert.equal(data[DEVICE_RELEASE_NOTES_KEY], undefined);
  failure = null;
  assert.equal(await claimReleaseNotes('1.0.0'), true);
});

test('invalid saved metadata is repaired and invalid installed versions are rejected', async () => {
  data[DEVICE_RELEASE_NOTES_KEY] = { version: 'invalid' };
  assert.equal(await claimReleaseNotes('1.0.0'), true);
  assert.throws(() => claimReleaseNotes('1.0.beta'), /Invalid release/);
  assert.deepEqual(data[DEVICE_RELEASE_NOTES_KEY], { version: '1.0.0' });
});
