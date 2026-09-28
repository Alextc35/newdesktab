import { t } from '../../platform/i18n/i18n.js';

/** Filters the rendered list without rebuilding its rows or changing saved data. */
export function createListSearch({ list, query = '', onChange, onFocus }) {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const element = document.createElement('div');
  element.className = 'bookmark-list-search';
  element.setAttribute('role', 'search');

  const label = document.createElement('label');
  label.className = 'bookmark-list-search-label';
  label.htmlFor = 'bookmark-list-search';
  label.dataset.i18n = 'view.search';
  label.textContent = t('view.search');

  const icon = document.createElement('span');
  icon.className = 'bookmark-list-search-icon';
  icon.setAttribute('aria-hidden', 'true');

  const input = document.createElement('input');
  input.id = label.htmlFor;
  input.type = 'search';
  input.dataset.i18n = 'view.search';
  input.placeholder = t('view.search');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = query;
  list.id = 'bookmark-list-results';
  input.setAttribute('aria-controls', list.id);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'bookmark-list-search-clear';
  clear.dataset.i18nAriaLabel = 'view.clearSearch';
  clear.setAttribute('aria-label', t('view.clearSearch'));
  clear.textContent = '×';

  const empty = document.createElement('p');
  empty.className = 'bookmark-list-empty';
  empty.dataset.i18n = 'view.noResults';
  empty.textContent = t('view.noResults');
  empty.setAttribute('role', 'status');

  const rows = [...list.children].map(row => ({
    element: row,
    name: normalize(row.querySelector('.bookmark-list-name')?.textContent ?? ''),
    static: row.dataset.listSearchStatic === 'true'
  }));

  function filter() {
    const term = normalize(input.value);
    let matches = 0;
    for (const row of rows) {
      if (row.static) {
        row.element.hidden = false;
        continue;
      }
      row.element.hidden = !row.name.includes(term);
      if (!row.element.hidden) matches++;
    }
    clear.hidden = !input.value;
    empty.hidden = !term || matches > 0;
  }

  function update() {
    filter();
    onChange(input.value);
  }

  function reset() {
    input.value = '';
    update();
    input.focus({ preventScroll: true });
  }

  input.addEventListener('input', update, options);
  input.addEventListener('focus', onFocus, options);
  input.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing || !input.value) return;
    event.preventDefault();
    reset();
  }, options);
  clear.addEventListener('click', reset, options);
  element.append(label, icon, input, clear);
  filter();

  return { element, input, empty, destroy: () => controller.abort() };
}

function normalize(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}
