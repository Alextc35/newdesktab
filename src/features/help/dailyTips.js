import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { areDailyTipsEnabled, claimDailyTip, DEVICE_DAILY_TIPS_KEY, setDailyTipsEnabled } from '../../platform/storage/deviceDailyTips.js';
import { hasOpenModal, subscribeModalChanges } from '../../shared/ui/modalManager.js';
import { MANUAL_TOPICS } from './manualCatalog.js';
import { createTimedNotice } from './timedNotice.js';

/** Optional, non-modal learning. Never steals focus or interrupts another dialog. */
export function createDailyTips({ card, toggle, onOpenManual }) {
  const events = new AbortController();
  let topic = null;
  let timer;
  let pending = false;
  let started = false;
  let destroyed = false;
  let enabled = true;
  const notice = createTimedNotice(card, { onDismiss: () => { topic = null; } });

  function render() {
    notice.setVisible(Boolean(topic) && enabled && !hasOpenModal() && !document.hidden);
    if (!topic) return;
    card.querySelector('.daily-tip-title').textContent = t(`manual.topics.${topic}.title`);
    card.querySelector('.daily-tip-text').textContent = t(`manual.topics.${topic}.tip`);
  }

  async function syncPreference() {
    try {
      enabled = await areDailyTipsEnabled();
      if (destroyed) return;
      toggle.checked = enabled;
      render();
      schedule();
    } catch (error) {
      console.warn('[HELP] Could not load daily tips:', error);
    }
  }

  function schedule() {
    clearTimeout(timer);
    render();
    if (!started || destroyed || topic || pending || !enabled || document.hidden || hasOpenModal()) return;
    timer = setTimeout(async () => {
      if (document.hidden || hasOpenModal() || destroyed) return;
      pending = true;
      try {
        const claimed = await claimDailyTip(MANUAL_TOPICS.map(item => item.id));
        if (!destroyed) {
          topic = claimed;
          if (topic) notice.show();
        }
        render();
      } catch (error) {
        console.warn('[HELP] Could not offer a daily tip:', error);
      } finally {
        pending = false;
      }
    }, 1400);
  }

  card.querySelector('#daily-tip-dismiss').addEventListener('click', () => {
    notice.dismiss();
  }, { signal: events.signal });
  card.querySelector('#daily-tip-read').addEventListener('click', () => {
    const destination = topic;
    notice.dismiss({ animate: false });
    onOpenManual(destination);
  }, { signal: events.signal });
  toggle.addEventListener('change', async () => {
    toggle.disabled = true;
    try {
      await setDailyTipsEnabled(toggle.checked);
      await syncPreference();
    } catch (error) {
      toggle.checked = enabled;
      console.warn('[HELP] Could not save daily tips preference:', error);
    } finally {
      toggle.disabled = false;
    }
  }, { signal: events.signal });
  document.addEventListener('visibilitychange', schedule, { signal: events.signal });
  const unsubscribeModal = subscribeModalChanges(schedule);
  const unsubscribeLanguage = subscribeLanguageChange(render);
  const storageChanged = (changes, area) => {
    if (area === 'local' && changes[DEVICE_DAILY_TIPS_KEY]) void syncPreference();
  };
  chrome.storage.onChanged.addListener(storageChanged);
  void syncPreference();

  return {
    start() { started = true; schedule(); },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      events.abort();
      notice.destroy();
      unsubscribeModal();
      unsubscribeLanguage();
      chrome.storage.onChanged.removeListener?.(storageChanged);
    }
  };
}
