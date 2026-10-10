import { callStorage } from './chromeStorage.js';

export const DEVICE_ONBOARDING_KEY = 'newdesktabOnboarding';
const GUIDE_VERSION = 1;

/** Claim the welcome once per browser profile, independently of Sync and backups. */
export async function claimOnboarding() {
  const claim = async () => {
    const stored = await callStorage(chrome.storage.local, 'get', DEVICE_ONBOARDING_KEY);
    if (stored[DEVICE_ONBOARDING_KEY]?.version >= GUIDE_VERSION) return false;
    await recordOnboarding('offered');
    return true;
  };
  return globalThis.navigator?.locks
    ? navigator.locks.request('newdesktab-onboarding', claim)
    : claim();
}

export function recordOnboarding(status) {
  return callStorage(chrome.storage.local, 'set', {
    [DEVICE_ONBOARDING_KEY]: { version: GUIDE_VERSION, status }
  });
}
