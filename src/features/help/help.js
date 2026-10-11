import { createManual } from './manual.js';
import { createDailyTips } from './dailyTips.js';

export function initHelp() {
  const events = new AbortController();
  const manual = createManual(document.getElementById('manual-modal'));
  const dailyTips = createDailyTips({
    card: document.getElementById('daily-tip'),
    toggle: document.getElementById('settings-daily-tips'),
    onOpenManual: topic => manual.open(topic)
  });
  document.getElementById('settings-open-manual').addEventListener('click', () => manual.open(), { signal: events.signal });
  document.querySelectorAll('[data-help-topic]').forEach(button => {
    button.addEventListener('click', () => manual.open(button.dataset.helpTopic), { signal: events.signal });
  });
  return {
    openManual: topic => manual.open(topic),
    startDailyTips: () => dailyTips.start(),
    destroy() { events.abort(); manual.destroy(); dailyTips.destroy(); }
  };
}
