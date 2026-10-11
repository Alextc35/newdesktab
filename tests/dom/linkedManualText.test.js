import { expect, test } from 'vitest';
import { renderLinkedManualText } from '../../src/features/help/linkedManualText.js';

test('inline help links preserve text and treat labels as text instead of markup', () => {
  const paragraph = document.createElement('p');
  renderLinkedManualText(paragraph, 'Try [[keyboard|Tab]] or [[missing|another key]]. [[search|<img src=x>]]');
  expect(paragraph.textContent).toBe('Try Tab or another key. <img src=x>');
  expect(paragraph.querySelectorAll('a')).toHaveLength(2);
  expect(paragraph.querySelector('[data-manual-topic="keyboard"]').getAttribute('aria-haspopup')).toBe('dialog');
  expect(paragraph.querySelector('img')).toBeNull();
  renderLinkedManualText(paragraph, 'Plain translated text.');
  expect(paragraph.querySelector('a')).toBeNull();
  expect(paragraph.textContent).toBe('Plain translated text.');
});
