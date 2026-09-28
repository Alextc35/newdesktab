import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CLOCK_CONFIG,
  formatClockTime,
  formatClockTimeParts,
  getClockRefreshDelay,
  normalizeClockConfig
} from '../src/widgets/builtin/clock/clockModel.js';

test('normalizes the clock configuration to its stable persisted contract', () => {
  assert.deepEqual(normalizeClockConfig(), DEFAULT_CLOCK_CONFIG);
  assert.deepEqual(normalizeClockConfig({ hourCycle: '12', showSeconds: true, extra: 1 }), {
    hourCycle: '12',
    showSeconds: true
  });
  assert.deepEqual(normalizeClockConfig({ hourCycle: 'invalid', showSeconds: 1 }), {
    hourCycle: '24',
    showSeconds: false
  });
  assert.deepEqual(normalizeClockConfig([]), DEFAULT_CLOCK_CONFIG);
});

test('formats local time using the selected hour cycle and precision', () => {
  const instant = new Date(2026, 0, 2, 5, 7, 9);

  assert.equal(
    formatClockTime(instant, { hourCycle: '24', showSeconds: false }, 'en-GB'),
    '05:07'
  );
  assert.match(
    formatClockTime(instant, { hourCycle: '12', showSeconds: true }, 'en-US'),
    /^05:07:09\s?AM$/i
  );

  const parts = formatClockTimeParts(
    instant,
    { hourCycle: '12', showSeconds: true },
    'en-US'
  );
  assert.equal(parts.main, '05:07');
  assert.equal(parts.separator, ':');
  assert.equal(parts.seconds, '09');
  assert.match(parts.suffix, /^\s?AM$/i);
  assert.equal(
    `${parts.main}${parts.separator}${parts.seconds}${parts.suffix}`,
    parts.text
  );
});

test('aligns refreshes to the next visible second or minute', () => {
  const instant = new Date(2026, 0, 2, 5, 7, 12, 250);
  assert.equal(getClockRefreshDelay(instant, { showSeconds: true }), 750);
  assert.equal(getClockRefreshDelay(instant, { showSeconds: false }), 47_750);
});
