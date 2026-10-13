import { ICON_CATALOG, normalizeCatalogIconId } from '../../shared/icons/iconCatalog.js';
import { getIconRecommendations, normalizeIconSearch } from '../../shared/icons/iconRecommendations.js';
import { createCatalogIcon } from '../../shared/ui/catalogIcon.js';
import { createChevronSvg, createThemedAssetIcon } from '../../shared/ui/svgIcons.js';
import { applyI18n, subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';

/** One compact icon chooser for item and default-bookmark appearance editors. */
export function createIconPicker({ type, getValue, renderOriginalIcon, onSelect, signal }) {
  const element = document.createElement('details');
  element.className = 'editor-icon-picker';
  const summary = document.createElement('summary');
  const currentIcon = document.createElement('span');
  currentIcon.className = 'editor-icon-current';
  currentIcon.setAttribute('aria-hidden', 'true');
  const currentLabel = document.createElement('span');
  currentLabel.className = 'editor-icon-current-label';
  summary.append(currentIcon, currentLabel, createChevronSvg());
  const browser = document.createElement('div');
  browser.className = 'editor-icon-browser';
  const panel = document.createElement('div');
  panel.className = 'editor-icon-panel';
  const searchField = document.createElement('div');
  searchField.className = 'editor-icon-search-field';
  searchField.append(createCatalogIcon('ui-search'));
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'editor-icon-search';
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.dataset.i18n = 'itemEditor.searchIcons';
  search.dataset.i18nAriaLabel = 'itemEditor.searchIcons';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'editor-icon-clear';
  clear.dataset.i18nAriaLabel = 'itemEditor.clearIconSearch';
  clear.append(createCatalogIcon('ui-close'));
  clear.hidden = true;
  searchField.append(search, clear);
  const suggestions = document.createElement('div');
  suggestions.className = 'editor-icon-suggestions';
  suggestions.setAttribute('role', 'group');
  suggestions.dataset.i18nAriaLabel = 'itemEditor.suggestedIcons';
  const suggestionsLabel = document.createElement('span');
  suggestionsLabel.className = 'editor-icon-suggestions-label';
  suggestionsLabel.dataset.i18n = 'itemEditor.suggestedIcons';
  suggestions.append(suggestionsLabel);
  const choices = document.createElement('div');
  choices.className = 'editor-icon-options custom-scrollbar';
  choices.setAttribute('role', 'group');
  choices.dataset.i18nAriaLabel = 'itemEditor.chooseIcon';
  const originalKey = type === 'bookmark' ? 'itemEditor.siteLogo' : 'itemEditor.noSymbol';
  const originalIcon = value => renderOriginalIcon ? renderOriginalIcon(value)
    : type === 'bookmark' ? createThemedAssetIcon('bookmark')
      : createCatalogIcon('ui-close');
  let originalArtwork;
  function createChoice(iconId, suggested = false) {
    const key = iconId ? `itemEditor.icons.${iconId}` : originalKey;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'editor-icon-option';
    if (suggested) button.dataset.iconSuggestion = iconId;
    else button.dataset.iconChoice = iconId || '';
    button.setAttribute('aria-pressed', 'false');
    const artwork = document.createElement('span');
    artwork.className = 'editor-icon-option-artwork';
    artwork.setAttribute('aria-hidden', 'true');
    if (iconId) artwork.append(createCatalogIcon(iconId));
    else originalArtwork = artwork;
    const label = document.createElement('span');
    label.className = 'editor-icon-option-label';
    label.dataset.i18n = key;
    button.append(artwork, label);
    button.addEventListener('click', () => onSelect(iconId), { signal });
    return button;
  }
  const empty = document.createElement('p');
  empty.className = 'editor-icon-empty';
  empty.dataset.i18n = 'itemEditor.noIcons';
  empty.setAttribute('role', 'status');
  empty.hidden = true;
  browser.append(searchField, suggestions, choices, empty);
  const hint = document.createElement('p');
  hint.className = 'editor-icon-hint';
  hint.dataset.i18n = 'itemEditor.folderIconHint';
  panel.append(browser, hint);
  element.append(summary, panel);
  applyI18n(element);
  let lastOriginalSignature;
  let lastCurrentSignature;
  let lastRecommendations;
  let lastSelectionSignature;
  let lastSummarySignature;
  let lastFilterSignature;
  let localeRevision = 0;
  const searchTexts = new WeakMap();
  let animation;
  let expanded = false;
  function ensureChoices() {
    if (choices.childElementCount) return;
    const fragment = document.createDocumentFragment();
    for (const iconId of [null, ...ICON_CATALOG.map(icon => icon.id)]) fragment.append(createChoice(iconId));
    choices.append(fragment);
    applyI18n(choices);
    sync();
  }
  function reveal() {
    search.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function setExpanded(open) {
    if (open) ensureChoices();
    expanded = open;
    const startHeight = element.open ? panel.getBoundingClientRect().height : 0;
    const startOpacity = element.open ? getComputedStyle(panel).opacity : 0;
    animation?.cancel();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !panel.animate) {
      animation = null;
      element.classList.remove('is-collapsing');
      panel.style.overflow = '';
      element.open = open;
      return;
    }
    element.open = true;
    element.classList.toggle('is-collapsing', !open);
    panel.style.overflow = 'hidden';
    const endHeight = open ? panel.scrollHeight : 0;
    const current = panel.animate([
      { height: `${startHeight}px`, opacity: startOpacity },
      { height: `${endHeight}px`, opacity: open ? 1 : 0 }
    ], { duration: 190, easing: 'cubic-bezier(.2, 0, .2, 1)', fill: 'both' });
    animation = current;
    void current.finished.then(() => {
      if (animation !== current) return;
      element.open = open;
      current.cancel();
      animation = null;
      panel.style.overflow = '';
      element.classList.remove('is-collapsing');
      if (open) reveal();
    }, () => {});
  }
  function filter(resetScroll = false) {
    const terms = normalizeIconSearch(search.value).split(/\s+/).filter(Boolean);
    const signature = JSON.stringify([terms, localeRevision, choices.childElementCount]);
    if (signature !== lastFilterSignature) {
      let visible = 0;
      for (const button of choices.children) {
        const text = searchTexts.get(button) || '';
        button.hidden = !terms.every(term => text.includes(term));
        if (!button.hidden) visible++;
      }
      empty.hidden = visible > 0;
      lastFilterSignature = signature;
    }
    clear.hidden = !search.value;
    suggestions.hidden = terms.length > 0;
    if (resetScroll) {
      choices.scrollTop = 0;
      if (element.open && !animation) element.scrollIntoView({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }
  function sync() {
    const value = getValue();
    const iconId = normalizeCatalogIconId(value.iconId);
    const iconVisible = type === 'bookmark' ? Boolean(value.backgroundFavicon || (value.showFavicon ?? true))
      : value.showFolder !== false;
    currentIcon.hidden = !iconVisible;
    const originalSignature = JSON.stringify([value.url, value.name]);
    // Request the Logo only when its current thumbnail or its choice is visible.
    const originalChanged = originalArtwork && originalSignature !== lastOriginalSignature && ((iconVisible && !iconId) || element.open);
    if (originalChanged) {
      originalArtwork.replaceChildren(originalIcon(value));
      lastOriginalSignature = originalSignature;
    }
    const currentSignature = JSON.stringify([iconId, iconId ? null : originalSignature]);
    if (iconVisible && lastCurrentSignature !== currentSignature) {
      currentIcon.replaceChildren(iconId ? createCatalogIcon(iconId) : originalIcon(value));
      lastCurrentSignature = currentSignature;
    }
    currentLabel.dataset.i18n = iconId ? `itemEditor.icons.${iconId}` : originalKey;
    const summarySignature = `${currentLabel.dataset.i18n}:${localeRevision}`;
    if (summarySignature !== lastSummarySignature) {
      applyI18n(summary);
      lastSummarySignature = summarySignature;
    }
    search.placeholder = t('itemEditor.searchIcons');
    const recommendations = getIconRecommendations(value, type);
    const recommendationSignature = recommendations.join(',');
    if (choices.childElementCount && recommendationSignature !== lastRecommendations) {
      suggestions.replaceChildren(suggestionsLabel, ...recommendations.map(id => createChoice(id, true)));
      lastRecommendations = recommendationSignature;
      applyI18n(suggestions);
    }
    const selectionSignature = JSON.stringify([iconId, localeRevision, lastRecommendations, choices.childElementCount]);
    if (selectionSignature !== lastSelectionSignature) {
      for (const button of [...choices.children, ...suggestions.querySelectorAll('button')]) {
        const selectedId = button.dataset.iconChoice ?? button.dataset.iconSuggestion;
        button.setAttribute('aria-pressed', String(selectedId === (iconId || '')));
        const label = t(button.lastElementChild.dataset.i18n);
        const name = button.dataset.iconSuggestion ? t('itemEditor.suggestedIcon', { name: label }) : label;
        button.title = name;
        button.setAttribute('aria-label', name);
        const keywordKey = selectedId ? `itemEditor.iconKeywords.${selectedId}` : 'itemEditor.logoKeywords';
        const translation = t(keywordKey);
        searchTexts.set(button, normalizeIconSearch(`${label} ${selectedId} ${translation === keywordKey ? '' : translation}`));
      }
      lastSelectionSignature = selectionSignature;
    }
    hint.hidden = type !== 'folder' || !iconId;
    filter();
  }
  search.addEventListener('input', () => filter(true), { signal });
  clear.addEventListener('click', () => { search.value = ''; filter(true); search.focus({ preventScroll: true }); }, { signal });
  element.addEventListener('keydown', event => {
    if (event.key === 'Escape' && element.open) {
      event.preventDefault();
      event.stopPropagation();
      if (search.value) { search.value = ''; filter(true); search.focus({ preventScroll: true }); }
      else { setExpanded(false); summary.focus(); }
    } else if (event.target === search && ['ArrowDown', 'Enter'].includes(event.key)) {
      const first = [...choices.children].find(button => !button.hidden);
      if (first && (event.key === 'ArrowDown' || search.value.trim())) {
        event.preventDefault();
        if (event.key === 'Enter') first.click();
        else first.focus();
      }
    }
  }, { signal });
  summary.addEventListener('click', event => {
    event.preventDefault();
    setExpanded(!expanded);
  }, { signal });
  element.addEventListener('toggle', () => {
    if (element.open) ensureChoices();
    if (!element.open && animation) {
      animation.cancel();
      animation = null;
      panel.style.overflow = '';
      element.classList.remove('is-collapsing');
    }
    if (!animation) expanded = element.open;
    if (!element.open) search.value = '';
    sync();
    if (element.open && !animation) reveal();
  }, { signal });
  const unsubscribe = subscribeLanguageChange(() => {
    localeRevision++;
    applyI18n(choices);
    applyI18n(suggestions);
    sync();
  });
  signal?.addEventListener('abort', () => { unsubscribe(); animation?.cancel(); }, { once: true });
  sync();
  return { element, sync };
}
