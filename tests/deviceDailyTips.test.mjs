import assert from 'node:assert/strict';
import test from 'node:test';
import { areDailyTipsEnabled, claimDailyTip, DEVICE_DAILY_TIPS_KEY, getLocalDay, setDailyTipsEnabled } from '../src/platform/storage/deviceDailyTips.js';

const data = {};
let queue = Promise.resolve();
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
    if (!chrome.runtime.lastError) Object.assign(data, structuredClone(items));
    callback();
  }
} } };
const topics = ['keyboard', 'folders', 'search'];
const day = number => ({ date: new Date(2026, 9, number, 0, 1), random: () => 0 });

test('claims one local calendar day without changing workspace data', async () => {
  data.settings = { language: 'es' };
  delete data[DEVICE_DAILY_TIPS_KEY];
  assert.equal(await claimDailyTip(topics, { ...day(11), canClaim: () => false }), null);
  assert.equal(data[DEVICE_DAILY_TIPS_KEY], undefined);
  assert.equal(getLocalDay(new Date(2026, 9, 11, 23, 59)), '2026-10-11');
  assert.equal(await claimDailyTip(topics, day(11)), 'keyboard');
  assert.equal(await claimDailyTip(topics, { ...day(11), date: new Date(2026, 9, 11, 23, 59) }), null);
  assert.equal(await claimDailyTip(topics, day(12)), 'folders');
  assert.deepEqual(data.settings, { language: 'es' });
});

test('concurrent tabs receive just one tip', async () => {
  delete data[DEVICE_DAILY_TIPS_KEY];
  assert.deepEqual(await Promise.all([claimDailyTip(topics, day(11)), claimDailyTip(topics, day(11))]), ['keyboard', null]);
});

test('visits all sections before cycling and avoids repeating the last section', async () => {
  delete data[DEVICE_DAILY_TIPS_KEY];
  const actual = [];
  for (let i = 11; i < 15; i++) actual.push(await claimDailyTip(topics, day(i)));
  assert.deepEqual(actual, ['keyboard', 'folders', 'search', 'keyboard']);
  data[DEVICE_DAILY_TIPS_KEY] = { day: '2026-10-10', seen: topics, lastTopic: 'keyboard' };
  assert.equal(await claimDailyTip(topics, day(11)), 'folders');
});

test('disabling survives days and preserves reading history', async () => {
  delete data[DEVICE_DAILY_TIPS_KEY];
  assert.equal(await areDailyTipsEnabled(), true);
  await claimDailyTip(topics, day(11));
  await setDailyTipsEnabled(false);
  assert.equal(await areDailyTipsEnabled(), false);
  assert.equal(await claimDailyTip(topics, day(12)), null);
  await setDailyTipsEnabled(true);
  assert.equal(await claimDailyTip(topics, day(12)), 'folders');
});

test('repairs obsolete history and random choice stays within the current catalog', async () => {
  data[DEVICE_DAILY_TIPS_KEY] = { seen: ['removed', 'keyboard', 'keyboard', 42], day: 42 };
  assert.equal(await claimDailyTip(topics, { ...day(11), random: () => .99 }), 'search');
  assert.deepEqual(data[DEVICE_DAILY_TIPS_KEY].seen, ['keyboard', 'search']);
  assert.equal(await claimDailyTip([], day(12)), null);
});

test('failed persistence never consumes a day or preference', async () => {
  delete data[DEVICE_DAILY_TIPS_KEY];
  chrome.runtime.lastError = { message: 'Storage unavailable' };
  await assert.rejects(claimDailyTip(topics, day(11)), /Storage unavailable/);
  await assert.rejects(setDailyTipsEnabled(false), /Storage unavailable/);
  assert.equal(data[DEVICE_DAILY_TIPS_KEY], undefined);
  chrome.runtime.lastError = null;
  assert.equal(await claimDailyTip(topics, day(11)), 'keyboard');
});
