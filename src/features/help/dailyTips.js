import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { areDailyTipsEnabled, claimDailyTip, DEVICE_DAILY_TIPS_KEY } from '../../platform/storage/deviceDailyTips.js';
import { hasOpenModal, subscribeModalChanges } from '../../shared/ui/modalManager.js';
import { isListView } from '../../shared/ui/viewportMode.js';
import { flashInfo } from '../../shared/ui/flash.js';
import { MANUAL_TOPICS } from './manualCatalog.js';
import { createManualIcon } from './manualIcons.js';
import { createTimedNotice } from './timedNotice.js';

/** Optional, non-modal learning. Never steals focus or interrupts another dialog. */
export function createDailyTips({ card, onOpenManual }) {
  const events = new AbortController();
  let topic = null;
  let timer;
  let pending = false;
  let started = false;
  let destroyed = false;
  let enabled = true;
  const notice = createTimedNotice(card, { onDismiss: () => { topic = null; } });
  const available = () => !hasOpenModal() && !isListView();

  function render() {
    notice.setVisible(Boolean(topic) && enabled && available() && !document.hidden);
    if (!topic) return;
    card.querySelector('.daily-tip-title').replaceChildren(createManualIcon(topic),
      document.createTextNode(t(`manual.topics.${topic}.title`)));
    card.querySelector('.daily-tip-text').textContent = t(`manual.topics.${topic}.tip`);
  }

  async function syncPreference() {
    try {
      enabled = await areDailyTipsEnabled();
      if (destroyed) return;
      render();
      schedule();
    } catch (error) {
      console.warn('[HELP] Could not load daily tips:', error);
    }
  }

  function schedule() {
    clearTimeout(timer);
    render();
    if (!started || destroyed || topic || pending || !enabled || document.hidden || !available()) return;
    timer = setTimeout(async () => {
      if (document.hidden || !available() || destroyed) return;
      pending = true;
      try {
        const claimed = await claimDailyTip(MANUAL_TOPICS.map(item => item.id), {
          canClaim: () => available() && !document.hidden && !destroyed
        });
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
  document.addEventListener('visibilitychange', schedule, { signal: events.signal });
  window.addEventListener('resize', () => {
    if (isListView() && !card.hidden) flashInfo('flash.viewport.suspended');
    schedule();
  }, { signal: events.signal });
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
