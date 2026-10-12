import { callStorage } from './chromeStorage.js';
import { compareVersions } from '../../shared/data/compareVersions.js';

export const DEVICE_RELEASE_NOTES_KEY = 'newdesktabReleaseNotes';

/** Claim each new release once per profile, across tabs and independently of Sync. */
export function claimReleaseNotes(version, { canClaim = () => true } = {}) {
  if (compareVersions(version, version) === null) throw new TypeError('Invalid release version.');
  const claim = async () => {
    const stored = await callStorage(chrome.storage.local, 'get', DEVICE_RELEASE_NOTES_KEY);
    const comparison = compareVersions(stored[DEVICE_RELEASE_NOTES_KEY]?.version, version);
    if (comparison !== null && comparison >= 0 || !canClaim()) return false;
    await callStorage(chrome.storage.local, 'set', {
      [DEVICE_RELEASE_NOTES_KEY]: { version }
    });
    return true;
  };
  return globalThis.navigator?.locks
    ? navigator.locks.request('newdesktab-release-notes', claim) : claim();
}
