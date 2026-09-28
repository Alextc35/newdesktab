import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  createClockTimeElement,
  startClockTicker,
  updateClockTimeElement
} from '../../src/widgets/builtin/clock/clockView.js';

beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.lang = 'en-GB';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('clock view', () => {
  test('renders semantic, accessible time without application state', () => {
    const element = createClockTimeElement({ hourCycle: '24', showSeconds: false });
    const instant = new Date(2026, 0, 2, 5, 7, 9);

    expect(updateClockTimeElement(element, {}, instant, 'en-GB')).toBe('05:07');
    expect(element.textContent).toBe('05:07');
    expect(element.dateTime).toBe(instant.toISOString());
    expect(element.getAttribute('aria-label')).toBe('05:07');
    expect(element.querySelector('.clock-widget-time-main').textContent).toBe('05:07');
    expect(element.querySelector('.clock-widget-time-detail').textContent).toBe('');
    expect(element.classList.contains('has-seconds')).toBe(false);
  });

  test('keeps seconds in their own reusable fragment for compact layouts', () => {
    const element = createClockTimeElement({ hourCycle: '24', showSeconds: true });
    const main = element.querySelector('.clock-widget-time-main');
    const detail = element.querySelector('.clock-widget-time-detail');
    const instant = new Date(2026, 0, 2, 5, 7, 9);

    updateClockTimeElement(element, { hourCycle: '24', showSeconds: true }, instant, 'en-GB');

    expect(element.classList.contains('has-seconds')).toBe(true);
    expect(main.textContent).toBe('05:07');
    expect(detail.textContent).toBe(':09');
    expect(element.textContent).toBe('05:07:09');
    expect(element.querySelector('.clock-widget-time-seconds').textContent).toBe('09');

    updateClockTimeElement(
      element,
      { hourCycle: '24', showSeconds: true },
      new Date(2026, 0, 2, 5, 7, 10),
      'en-GB'
    );
    expect(element.querySelector('.clock-widget-time-main')).toBe(main);
    expect(element.querySelector('.clock-widget-time-detail')).toBe(detail);
    expect(detail.textContent).toBe(':10');
  });

  test('updates connected clocks and stops scheduling after detachment', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 2, 5, 7, 9, 500));
    const element = createClockTimeElement({ hourCycle: '24', showSeconds: true });
    document.body.append(element);

    startClockTicker(element, { hourCycle: '24', showSeconds: true });
    vi.advanceTimersByTime(500);
    expect(element.textContent).toBe('05:07:10');

    element.remove();
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('exposes cleanup for clocks that stay connected after their surface closes', () => {
    vi.useFakeTimers();
    const element = createClockTimeElement({ hourCycle: '24', showSeconds: true });
    document.body.append(element);

    const stop = startClockTicker(element, { hourCycle: '24', showSeconds: true });
    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
