import { areDailyTipsEnabled, DEVICE_DAILY_TIPS_KEY, setDailyTipsEnabled } from '../../platform/storage/deviceDailyTips.js';
import { debug } from '../../shared/diagnostics/debug.js';

/** Device-only learning preference with the same Save/Cancel flow as settings. */
export function initHelpSection({ onRequestSaveStateUpdate } = {}) {
  const toggle = document.getElementById('settings-daily-tips');
  let saved = true;
  let draft = true;
  let editing = false;
  let ready = false;
  let saving = false;
  let revision = 0;
  let loading;
  const hasChanges = () => ready && draft !== saved;
  const syncControl = () => {
    toggle.checked = draft;
    toggle.disabled = !ready || saving;
  };
  function receive(value) {
    const changed = hasChanges();
    saved = value;
    ready = true;
    if (!editing || !changed) draft = saved;
    syncControl();
    onRequestSaveStateUpdate?.();
  }
  function load() {
    if (ready || loading) return;
    const startedRevision = revision;
    loading = areDailyTipsEnabled().then(value => {
      if (revision === startedRevision) receive(value);
    }).catch(error => {
      console.warn('[HELP] Could not load daily tips preference:', error);
    }).finally(() => { loading = null; });
  }
  toggle.addEventListener('change', () => {
    if (!ready || saving) return;
    draft = toggle.checked;
    onRequestSaveStateUpdate?.();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[DEVICE_DAILY_TIPS_KEY]) return;
    revision++;
    receive(changes[DEVICE_DAILY_TIPS_KEY].newValue?.enabled !== false);
  });
  syncControl();
  load();
  return {
    hasChanges,
    syncUI() { editing = true; draft = saved; syncControl(); load(); },
    discard() { editing = false; draft = saved; syncControl(); },
    async save() {
      if (!hasChanges()) return;
      const trace = debug.start('Save daily tips preference');
      const requested = draft;
      saving = true;
      syncControl();
      try {
        await setDailyTipsEnabled(requested);
        receive(requested);
        trace.end({ persisted: true });
      } catch (error) {
        trace.end({ status: 'error', persisted: false });
        throw error;
      } finally {
        saving = false;
        syncControl();
      }
    }
  };
}
