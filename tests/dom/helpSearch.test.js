import { afterEach, expect, test, vi } from 'vitest';
import translations from '../../src/lang/manual/en.json';
import { createHelpSearch } from '../../src/features/help/helpSearch.js';

const languageListeners = vi.hoisted(() => new Set());
vi.mock('../../src/platform/i18n/i18n.js', () => ({
  t: (key, params = {}) => key.split('.').slice(1).reduce((value, part) => value?.[part], translations)
    ?.replace(/\{\{(\w+)\}\}/gu, (_, key) => params[key] ?? '') ?? key,
  subscribeLanguageChange: listener => {
    languageListeners.add(listener);
    return () => languageListeners.delete(listener);
  }
}));

let search;
afterEach(() => { search?.destroy(); document.body.replaceChildren(); });

function setup() {
  document.body.innerHTML = '<form><input type="search"><p class="help-search-status"></p><div class="settings-help-results"></div></form>';
  const form = document.querySelector('form');
  const input = form.querySelector('input');
  const open = vi.fn();
  search = createHelpSearch(form, open);
  const type = value => { input.value = value; input.dispatchEvent(new Event('input')); };
  return { form, input, open, type };
}

test('help search gives a relevant answer and opens that section on submit', () => {
  const { form, open, type } = setup();
  type('recover a deleted bookmark');
  const result = form.querySelector('button');
  expect(result.dataset.manualTopic).toBe('trash');
  expect(result.querySelector('span').textContent).toBe(translations.topics.trash.tip);
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(open).toHaveBeenCalledWith('trash');
  type('<img src=x> submarine');
  expect(form.querySelector('button')).toBeNull();
  expect(form.querySelector('img')).toBeNull();
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(open).toHaveBeenCalledTimes(1);
});

test('keyboard navigation reaches suggestions and Escape clears the query', () => {
  const { form, input, type } = setup();
  type('keyboard');
  input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(form.querySelector('button'));
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(input.value).toBe('');
  expect(form.querySelectorAll('button')).toHaveLength(3);
});

test('destroy removes events and the language subscription', () => {
  const { form, type, open } = setup();
  expect(languageListeners.size).toBe(1);
  search.destroy();
  expect(languageListeners.size).toBe(0);
  type('backup');
  form.querySelector('button').click();
  expect(open).not.toHaveBeenCalled();
  expect(form.querySelector('.help-search-status').textContent).toBe(translations.search.common);
});
