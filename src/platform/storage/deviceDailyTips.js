import { callStorage } from './chromeStorage.js';

export const DEVICE_DAILY_TIPS_KEY = 'newdesktabDailyTips';
const LOCK = 'newdesktab-daily-tips';

/** Calendar day in the user's time zone, independent of UTC or elapsed hours. */
export function getLocalDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const withLock = operation => globalThis.navigator?.locks
  ? navigator.locks.request(LOCK, operation) : operation();

function normalize(value) {
  return {
    enabled: value?.enabled !== false,
    day: typeof value?.day === 'string' ? value.day : '',
    seen: Array.isArray(value?.seen) ? value.seen.filter(id => typeof id === 'string') : [],
    lastTopic: typeof value?.lastTopic === 'string' ? value.lastTopic : ''
  };
}

async function read() {
  const stored = await callStorage(chrome.storage.local, 'get', DEVICE_DAILY_TIPS_KEY);
  return normalize(stored[DEVICE_DAILY_TIPS_KEY]);
}

export async function areDailyTipsEnabled() {
  return (await read()).enabled;
}

/** Device preference: excluded from synchronized application data and backups. */
export function setDailyTipsEnabled(enabled) {
  return withLock(async () => {
    const state = await read();
    await callStorage(chrome.storage.local, 'set', {
      [DEVICE_DAILY_TIPS_KEY]: { ...state, enabled: Boolean(enabled) }
    });
  });
}

/** Claim just one tip across tabs; visit all current topics before starting again. */
export function claimDailyTip(topicIds, { date = new Date(), random = Math.random } = {}) {
  return withLock(async () => {
    const state = await read();
    const day = getLocalDay(date);
    if (!state.enabled || state.day === day || !topicIds.length) return null;
    let seen = [...new Set(state.seen.filter(id => topicIds.includes(id)))];
    let remaining = topicIds.filter(id => !seen.includes(id));
    if (!remaining.length) {
      seen = [];
      remaining = topicIds.filter(id => id !== state.lastTopic);
      if (!remaining.length) remaining = topicIds;
    }
    const index = Math.min(remaining.length - 1, Math.max(0, Math.floor(random() * remaining.length)));
    const topic = remaining[index];
    await callStorage(chrome.storage.local, 'set', {
      [DEVICE_DAILY_TIPS_KEY]: { ...state, day, seen: [...seen, topic], lastTopic: topic }
    });
    return topic;
  });
}
