import assert from 'node:assert/strict';
import test from 'node:test';
import { claimOnboarding, DEVICE_ONBOARDING_KEY, recordOnboarding } from '../src/platform/storage/deviceOnboarding.js';

const data = {};
let queue = Promise.resolve();
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  locks: { request(_name, operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  } }
} });
globalThis.chrome = {
  runtime: { lastError: null },
  storage: { local: {
    get(_key, callback) { callback(structuredClone(data)); },
    set(items, callback) {
      if (!chrome.runtime.lastError) Object.assign(data, structuredClone(items));
      callback();
    }
  } }
};

test('offers the guide once without changing application data', async () => {
  data.settings = { language: 'es' };
  assert.equal(await claimOnboarding(), true);
  assert.equal(await claimOnboarding(), false);
  assert.deepEqual(data.settings, { language: 'es' });
  await recordOnboarding('completed');
  assert.deepEqual(data[DEVICE_ONBOARDING_KEY], { version: 1, status: 'completed' });
  assert.equal(await claimOnboarding(), false);
});

test('concurrent new tabs claim just one welcome', async () => {
  delete data[DEVICE_ONBOARDING_KEY];
  assert.deepEqual(await Promise.all([claimOnboarding(), claimOnboarding()]), [true, false]);
});

test('dismissal survives reopening and storage failures are not reported as success', async () => {
  await recordOnboarding('dismissed');
  assert.equal(await claimOnboarding(), false);
  delete data[DEVICE_ONBOARDING_KEY];
  chrome.runtime.lastError = { message: 'Storage unavailable' };
  await assert.rejects(claimOnboarding(), /Storage unavailable/);
  assert.equal(data[DEVICE_ONBOARDING_KEY], undefined);
  chrome.runtime.lastError = null;
  assert.equal(await claimOnboarding(), true);
});
