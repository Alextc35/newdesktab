import { afterEach, expect, test, vi } from 'vitest';
import { initCustomSelect, refreshCustomSelect } from '../../src/shared/ui/customSelect.js';

let instance;
afterEach(() => { instance?.destroy(); document.body.replaceChildren(); });

function setup(searchable = true) {
  document.body.innerHTML = `<label for="languages">Languages</label><select id="languages" ${searchable ? 'data-select-search' : ''} data-search-placeholder="Search language or country" data-search-empty="No languages found">
    <option value="system">Browser</option><option value="de" lang="de" data-search-terms="alemán Alemania Germany">Deutsch</option>
    <option value="ja" lang="ja" data-search-terms="japonés Japón Japan">日本語</option><option value="fr" disabled>Français</option></select>`;
  Element.prototype.scrollIntoView = vi.fn();
  const select = document.querySelector('select');
  instance = initCustomSelect(select);
  const trigger = document.querySelector('.custom-select-trigger');
  const search = document.querySelector('input');
  const type = value => { search.value = value; search.dispatchEvent(new Event('input')); };
  const key = value => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  return { select, trigger, search, type, key };
}

test('filters by country or accented language names while keeping native labels', () => {
  const { trigger, select, search, type, key } = setup();
  trigger.click();
  expect(document.activeElement).toBe(search);
  type('alemania');
  const visible = document.querySelectorAll('[role="option"]:not([hidden])');
  expect(visible).toHaveLength(1);
  expect(visible[0].textContent).toBe('Deutsch✓');
  expect(visible[0].querySelector('span').lang).toBe('de');
  expect(select.value).toBe('system');
  key('Enter');
  expect(select.value).toBe('de');
  expect(document.activeElement).toBe(trigger);
  trigger.click();
  expect(search.value).toBe('');
  type('japones');
  expect(document.querySelector('[role="option"]:not([hidden])').dataset.value).toBe('ja');
});

test('empty search, Escape and keyboard navigation never select a hidden or disabled option', () => {
  const { trigger, select, search, type, key } = setup();
  trigger.click();
  type('zzzz');
  expect(document.querySelector('[role="status"]').hidden).toBe(false);
  expect(search.hasAttribute('aria-activedescendant')).toBe(false);
  key('ArrowDown');
  key('Enter');
  expect(select.value).toBe('system');
  key('Escape');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
  trigger.click();
  key('ArrowUp');
  key('Enter');
  expect(select.value).toBe('ja');
});

test('refresh preserves the query and updates the localized search label', () => {
  const { trigger, select, search, type } = setup();
  trigger.click();
  type('Germany');
  select.dataset.searchPlaceholder = 'Buscar idioma o país';
  refreshCustomSelect(select);
  expect(search.placeholder).toBe('Buscar idioma o país');
  expect(search.getAttribute('aria-label')).toBe(search.placeholder);
  expect(search.value).toBe('Germany');
  expect(document.querySelectorAll('[role="option"]:not([hidden])')).toHaveLength(1);
});

test('regular selects retain type-ahead and their original native control on teardown', () => {
  const { trigger, select, key } = setup(false);
  expect(document.querySelector('input')).toBeNull();
  trigger.focus();
  key('d');
  key('Enter');
  expect(select.value).toBe('de');
  instance.destroy();
  expect(document.querySelector('.custom-select')).toBeNull();
  expect(document.querySelector('label').htmlFor).toBe('languages');
  expect(select.hasAttribute('aria-hidden')).toBe(false);
  instance = null;
});
