import {
  createBookmarkDraft,
  normalizeBookmarkPreset,
  validateBookmarkDraft
} from '../../domain/bookmarks/bookmarkModel.js';
import { applyI18n, t } from '../../platform/i18n/i18n.js';
import { initCustomColorPickers } from '../../shared/ui/colorPicker.js';
import { initTabs } from '../../shared/ui/tabs.js';
import { createItemAppearanceEditor } from '../../shared/ui/itemAppearanceEditor.js';
import { createBookmarkEditor } from './bookmarkEditor.js';
import { createBookmarkElement } from './bookmarkCard.js';

const TEMPLATE_ID = 'bookmark-form-template';
const ALL_SECTIONS = Object.freeze(['general', 'style', 'text', 'icon', 'presets']);
const VALID_MODES = new Set(['create', 'edit', 'preset']);
let instanceCount = 0;

/**
 * Mounts the reusable bookmark editing surface. It owns DOM concerns only:
 * callers decide where it lives, how values are persisted and what save means.
 *
 * @param {Object} options
 * @param {HTMLElement} options.host
 * @param {'create'|'edit'|'preset'} [options.mode='create']
 * @param {Partial<BookmarkDraft>|Partial<BookmarkPreset>} [options.value={}]
 * @param {string[]} [options.sections]
 * @param {(value: BookmarkDraft|BookmarkPreset) => void} [options.onChange]
 * @param {string} [options.idPrefix]
 * @param {string} [options.previewName] - Placeholder title used by preset previews.
 * @param {string|null} [options.previewFaviconUrl] - Local favicon used by preset previews.
 * @returns {Object|null}
 */
export function createBookmarkEditorPanel({
  host,
  mode = 'create',
  value = {},
  sections,
  onChange,
  idPrefix = `bookmark-editor-${++instanceCount}`,
  previewName = t('editModal.previewName'),
  previewFaviconUrl = null
}) {
  const template = document.getElementById(TEMPLATE_ID);
  if (!host || !template) return null;
  if (!VALID_MODES.has(mode)) throw new TypeError(`Unsupported bookmark editor mode: ${mode}`);

  const abortController = new AbortController();
  const currentMode = mode;
  const enabledSections = resolveSections(currentMode, sections);
  const root = template.content.firstElementChild.cloneNode(true);
  root.dataset.editorMode = currentMode;
  host.replaceChildren(root);
  applyI18n(root);
  initCustomColorPickers(root);

  const panels = Object.fromEntries(ALL_SECTIONS.map(section => [
    section,
    root.querySelector(`[data-tab-panel="${section}"]`)
  ]));
  const tabButtons = Object.fromEntries(ALL_SECTIONS.map(section => [
    section,
    root.querySelector(`[data-tab-button="${section}"]`)
  ]));

  for (const section of ALL_SECTIONS) {
    const panel = panels[section];
    const button = tabButtons[section];

    if (!enabledSections.includes(section)) {
      panel?.remove();
      button?.remove();
      panels[section] = null;
      continue;
    }

    const tabId = `${idPrefix}-tab-${section}`;
    const buttonId = `${idPrefix}-button-${section}`;
    if (panel) {
      panel.id = tabId;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', buttonId);
    }
    if (button) {
      button.id = buttonId;
      button.dataset.tab = tabId;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', tabId);
    }
  }

  const defaultSection = enabledSections[0];
  const defaultTab = `${idPrefix}-tab-${defaultSection}`;
  const elements = resolveElements(root);
  connectLabels(root, elements, idPrefix);
  const errorElements = createErrorElements(elements, idPrefix);

  let currentValue = prepareEditorValue(currentMode, value, previewName);
  let initialValue = getPublicValue(currentMode, currentValue);
  let appearanceEditor;

  const editor = createBookmarkEditor({
    elements,
    bookmark: currentValue,
    previewFaviconUrl,
    onChange: nextValue => {
      currentValue = prepareEditorValue(currentMode, nextValue, previewName);
      clearValidationErrors(elements, errorElements);
      appearanceEditor?.sync();
      onChange?.(getPublicValue(currentMode, currentValue));
    }
  });

  appearanceEditor = createItemAppearanceEditor({
    root,
    type: 'bookmark',
    stylePanel: panels.style,
    getValue: () => editor.getState(),
    renderSample: value => createBookmarkElement(value, { isPreview: true, faviconUrl: previewFaviconUrl }),
    onApply: appearance => {
      setValue({ ...editor.getState(), ...appearance });
      onChange?.(getPublicValue(currentMode, currentValue));
    },
    signal: abortController.signal
  });

  const tabs = initTabs({
    root,
    tabButtonSelector: '.edit-bookmark-modal-tab-btn',
    tabContentSelector: '.edit-bookmark-modal-tab-content',
    signal: abortController.signal
  });

  function activateDefaultTab() {
    tabs?.activate(defaultTab);
    syncTabAria(root, defaultTab);
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('[role="tab"]');
    if (button) syncTabAria(root, button.dataset.tab);
  }, { signal: abortController.signal });

  function setValue(nextValue) {
    currentValue = prepareEditorValue(currentMode, nextValue, previewName);
    editor.setState(currentValue);
    clearValidationErrors(elements, errorElements);
    appearanceEditor?.sync();
  }

  function reset(nextValue = {}) {
    setValue(nextValue);
    initialValue = getPublicValue(currentMode, currentValue);
  }

  function getValue() {
    currentValue = prepareEditorValue(currentMode, editor.getState(), previewName);
    return getPublicValue(currentMode, currentValue);
  }

  function validate() {
    const result = validatePanelValue(currentMode, editor.getState());
    renderValidationErrors(elements, errorElements, result.errors);
    appearanceEditor?.sync();
    const invalidField = result.errors.name ? 'name' : result.errors.url ? 'url'
      : result.errors.backgroundImageUrl ? 'backgroundImage' : null;
    if (invalidField) {
      tabs?.activate(`${idPrefix}-tab-${invalidField === 'backgroundImage' ? 'style' : 'general'}`);
      elements[invalidField]?.focus();
    }
    return result;
  }

  function focus() {
    const preferred = currentMode === 'preset'
      ? elements.backgroundColor
      : elements.name;
    preferred?.focus();
  }

  function destroy() {
    abortController.abort();
    tabs?.destroy?.();
    appearanceEditor?.destroy();
    editor.destroy();
    if (root.parentElement === host) host.replaceChildren();
  }

  activateDefaultTab();

  return {
    root,
    elements,
    get mode() { return currentMode; },
    sections: enabledSections.filter(section => !['text', 'icon'].includes(section)),
    getValue,
    getState: getValue,
    setValue,
    reset,
    validate,
    focus,
    isDirty: () => JSON.stringify(getValue()) !== JSON.stringify(initialValue),
    activateDefaultTab,
    syncUI: () => editor.syncUI(),
    destroy
  };
}

function resolveSections(mode, sections) {
  const availableSections = mode === 'preset'
    ? ALL_SECTIONS.filter(section => section !== 'general')
    : ALL_SECTIONS.filter(section => section !== 'presets');
  const requested = Array.isArray(sections)
    ? sections.map(section => ['text', 'icon'].includes(section) ? 'style' : section)
      .filter(section => availableSections.includes(section))
    : availableSections;
  const resolved = requested.length ? [...new Set(requested)] : ['style'];
  if (resolved.includes('style')) {
    for (const section of ['text', 'icon']) {
      if (!resolved.includes(section)) resolved.push(section);
    }
  }
  return resolved;
}

function prepareEditorValue(mode, value, previewName) {
  if (mode === 'preset') {
    return createBookmarkDraft({
      preset: normalizeBookmarkPreset(value),
      bookmark: { name: previewName }
    });
  }

  return createBookmarkDraft({ bookmark: value });
}

function getPublicValue(mode, value) {
  return mode === 'preset'
    ? normalizeBookmarkPreset(value)
    : createBookmarkDraft({ bookmark: value });
}

function validatePanelValue(mode, value) {
  const result = validateBookmarkDraft(value);
  if (mode !== 'preset') return result;

  const errors = {};
  if (result.errors.backgroundImageUrl) {
    errors.backgroundImageUrl = result.errors.backgroundImageUrl;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: normalizeBookmarkPreset(result.value)
  };
}

function resolveElements(root) {
  const field = name => root.querySelector(`[data-field="${name}"]`);
  return {
    preview: field('preview'),
    name: field('name'),
    url: field('url'),
    backgroundColor: field('backgroundColor'),
    backgroundImageSourceField: field('backgroundImageSourceField'),
    backgroundImageSource: field('backgroundImageSource'),
    backgroundImageUrlField: field('backgroundImageUrlField'),
    backgroundImage: field('backgroundImage'),
    backgroundImageLocalColor: field('backgroundImageLocalColor'),
    backgroundImageLocal: field('backgroundImageLocal'),
    bgLocalClearBtn: field('bgLocalClear'),
    backgroundFavicon: field('backgroundFavicon'),
    noBackground: field('noBackground'),
    invertBg: field('invertBg'),
    showText: field('showText'),
    textColor: field('textColor'),
    showFavicon: field('showFavicon'),
    invertIcon: field('invertIcon'),
    urlToggleBtn: field('urlToggle'),
    urlCopyBtn: field('urlCopy'),
    urlClearBtn: field('urlClear'),
    bgToggleBtn: field('bgToggle'),
    bgCopyBtn: field('bgCopy'),
    bgClearBtn: field('bgClear'),
    bgUploadBtn: field('bgUpload'),
    bgUploadInput: field('bgUploadInput')
  };
}

function connectLabels(root, elements, idPrefix) {
  for (const [field, input] of Object.entries(elements)) {
    if (!input || !input.matches('input, select, textarea')) continue;

    const controlId = `${idPrefix}-${field}`;
    input.id = controlId;

    const wrapper = input.closest(
      '.input-with-actions, .checkbox-wrapper, .background-image-source-field'
    );
    const label = wrapper?.querySelector('label')
      || (wrapper?.previousElementSibling?.matches('label')
        ? wrapper.previousElementSibling
        : null)
      || (input.previousElementSibling?.matches('label')
        ? input.previousElementSibling
        : null);

    if (label) label.htmlFor = controlId;
  }

  root.querySelector('.edit-bookmark-modal-tabs')?.setAttribute('role', 'tablist');
}

function createErrorElements(elements, idPrefix) {
  const result = {};
  const fields = {
    name: elements.name,
    url: elements.url,
    backgroundImageUrl: elements.backgroundImage
  };

  for (const [field, input] of Object.entries(fields)) {
    if (!input) continue;
    const error = document.createElement('p');
    error.id = `${idPrefix}-${field}-error`;
    error.className = 'field-error is-hidden';
    error.setAttribute('role', 'alert');
    input.setAttribute('aria-describedby', error.id);
    const wrapper = input.closest('.input-with-actions');
    if (wrapper) wrapper.after(error);
    else input.after(error);
    result[field] = error;
  }

  return result;
}

function renderValidationErrors(elements, errorElements, errors) {
  clearValidationErrors(elements, errorElements);

  for (const [field, code] of Object.entries(errors)) {
    const input = field === 'backgroundImageUrl' ? elements.backgroundImage : elements[field];
    const error = errorElements[field];
    if (!input || !error) continue;

    input.setAttribute('aria-invalid', 'true');
    error.textContent = t(`validation.${field}.${code}`);
    error.classList.remove('is-hidden');
  }
}

function clearValidationErrors(elements, errorElements) {
  for (const input of [elements.name, elements.url, elements.backgroundImage]) {
    input?.removeAttribute('aria-invalid');
  }
  for (const error of Object.values(errorElements)) {
    error.textContent = '';
    error.classList.add('is-hidden');
  }
}

function syncTabAria(root, activeTabId) {
  root.querySelectorAll('[role="tab"]').forEach(button => {
    button.setAttribute('aria-selected', String(button.dataset.tab === activeTabId));
    button.tabIndex = button.dataset.tab === activeTabId ? 0 : -1;
  });
}
