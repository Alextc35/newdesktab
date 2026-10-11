import { createManual } from './manual.js';
import { createDailyTips } from './dailyTips.js';
import { createHelpSearch } from './helpSearch.js';

export function initHelp() {
  const events = new AbortController();
  const manual = createManual(document.getElementById('manual-modal'));
  const search = createHelpSearch(document.querySelector('.settings-help-search'), topic => manual.open(topic));
  const dailyTips = createDailyTips({
    card: document.getElementById('daily-tip'),
    toggle: document.getElementById('settings-daily-tips'),
    onOpenManual: topic => manual.open(topic)
  });
  document.getElementById('settings-open-manual').addEventListener('click', () => manual.open(), { signal: events.signal });
  return {
    openManual: topic => manual.open(topic),
    startDailyTips: () => dailyTips.start(),
    destroy() { events.abort(); search.destroy(); manual.destroy(); dailyTips.destroy(); }
  };
}
