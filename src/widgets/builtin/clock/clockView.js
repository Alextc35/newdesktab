import {
  formatClockTimeParts,
  getClockRefreshDelay,
  normalizeClockConfig
} from './clockModel.js';

/** Creates the semantic time element shared by grid, list and preview surfaces. */
export function createClockTimeElement(config, { className = 'clock-widget-time' } = {}) {
  const element = document.createElement('time');
  element.className = className;
  updateClockTimeElement(element, config);
  return element;
}

/** Updates a clock element for a supplied instant. */
export function updateClockTimeElement(
  element,
  config,
  date = new Date(),
  locale = document.documentElement.lang || undefined
) {
  const parts = formatClockTimeParts(date, config, locale);
  const content = getClockTimeContent(element);
  element.dateTime = date.toISOString();
  element.classList.toggle('has-seconds', Boolean(parts.seconds));
  content.main.textContent = parts.main;
  content.separator.textContent = parts.separator;
  content.seconds.textContent = parts.seconds;
  content.suffix.textContent = parts.suffix;
  element.setAttribute('aria-label', parts.text);
  return parts.text;
}

function getClockTimeContent(element) {
  const existingMain = element.querySelector(':scope > .clock-widget-time-main');
  if (existingMain) {
    return {
      main: existingMain,
      separator: element.querySelector('.clock-widget-time-separator'),
      seconds: element.querySelector('.clock-widget-time-seconds'),
      suffix: element.querySelector('.clock-widget-time-suffix')
    };
  }

  const main = document.createElement('span');
  main.className = 'clock-widget-time-main';
  const detail = document.createElement('span');
  detail.className = 'clock-widget-time-detail';
  const separator = document.createElement('span');
  separator.className = 'clock-widget-time-separator';
  const seconds = document.createElement('span');
  seconds.className = 'clock-widget-time-seconds';
  const suffix = document.createElement('span');
  suffix.className = 'clock-widget-time-suffix';
  detail.append(separator, seconds, suffix);
  element.replaceChildren(main, detail);
  return { main, separator, seconds, suffix };
}

/**
 * Keeps one connected clock surface current without writing transient time to
 * the application store. A detached render stops itself on its next tick.
 */
export function startClockTicker(element, config) {
  const normalized = normalizeClockConfig(config);
  let timer = null;
  let stopped = false;

  const schedule = () => {
    const now = new Date();
    timer = globalThis.setTimeout(() => {
      if (stopped || !element.isConnected) return;
      updateClockTimeElement(element, normalized);
      schedule();
    }, getClockRefreshDelay(now, normalized));
    timer?.unref?.();
  };

  schedule();
  return () => {
    stopped = true;
    if (timer !== null) globalThis.clearTimeout(timer);
  };
}
