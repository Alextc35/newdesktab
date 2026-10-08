import { DEFAULT_BOOKMARK_STYLE } from '../../domain/bookmarks/bookmarkDefaults.js';
import { DEFAULT_FOLDER_STYLE } from '../../domain/folders/folderDefaults.js';
import { DEFAULT_RECYCLE_BIN_STYLE } from '../../domain/recycle-bin/recycleBinDefaults.js';
import { applyI18n } from '../../platform/i18n/i18n.js';
import { openCustomColorPicker } from './colorPicker.js';

const DEFAULTS = {
  bookmark: DEFAULT_BOOKMARK_STYLE,
  folder: DEFAULT_FOLDER_STYLE,
  recycleBin: DEFAULT_RECYCLE_BIN_STYLE
};
const PALETTES = {
  original: null,
  midnight: { background: '#171717', text: '#f5f5f5', icon: '#a3a3a3' },
  paper: { background: '#f1f0ec', text: '#292524', icon: '#78716c' },
  ocean: { background: '#172b3a', text: '#e0f2fe', icon: '#7dd3fc' }
};
const CONTENT_FIELDS = {
  bookmark: ['backgroundFavicon', 'showText', 'showFavicon', 'invertColorIcon'],
  folder: ['showFolder', 'showPreviews', 'showName', 'showCount'],
  recycleBin: ['showIcon', 'showName', 'showCount']
};

/** Appearance-only values: choosing a look never changes identity or grid layout. */
export function getItemAppearance(type, look = 'original', current = {}) {
  const defaults = DEFAULTS[type];
  if (!defaults || !Object.hasOwn(PALETTES, look)) return null;
  const palette = PALETTES[look];
  if (!palette) return { ...defaults };
  const style = { ...defaults, noBackground: false, textColor: palette.text };
  for (const field of CONTENT_FIELDS[type]) {
    if (Object.hasOwn(current, field)) style[field] = current[field];
  }
  if (type === 'folder') {
    style.noOuterBackground = false;
    style.outerBackgroundColor = palette.background;
    style.backgroundColor = palette.icon;
  } else {
    style.backgroundColor = palette.background;
    if (type === 'recycleBin') style.iconColor = palette.icon;
  }
  return style;
}

/** Shared quick looks and appearance reset for all item editors. */
export function createItemAppearanceEditor({ root, type, stylePanel, getValue, renderSample, onApply, signal }) {
  if (!stylePanel) return { sync() {}, destroy() {} };
  root.classList.add('item-appearance-editor');
  const abortController = new AbortController();
  const options = { signal: abortController.signal };
  signal?.addEventListener('abort', () => abortController.abort(), { once: true });
  const section = document.createElement('section');
  section.className = 'editor-looks';
  const heading = document.createElement('div');
  heading.className = 'editor-section-heading';
  const title = document.createElement('h3');
  title.dataset.i18n = 'itemEditor.looks';
  const status = document.createElement('span');
  status.className = 'editor-look-status';
  status.dataset.i18n = 'itemEditor.custom';
  heading.append(title, status);
  const looks = document.createElement('div');
  looks.className = 'editor-look-options';
  looks.setAttribute('role', 'group');
  looks.dataset.i18nAriaLabel = 'itemEditor.looks';

  for (const look of Object.keys(PALETTES)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'editor-look';
    button.dataset.appearanceLook = look;
    button.setAttribute('aria-pressed', 'false');
    const sample = document.createElement('span');
    sample.className = `editor-look-sample editor-look-sample-${look}`;
    sample.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.dataset.i18n = `itemEditor.look.${look}`;
    button.append(sample, label);
    button.addEventListener('click', () => onApply(getItemAppearance(type, look, getValue())), options);
    looks.append(button);
  }
  section.append(heading, looks);
  stylePanel?.prepend(section);

  const findPanel = name => root.querySelector(`[data-tab-panel="${name}"], [id$="-panel-${name}"]`);
  const group = name => {
    const element = document.createElement('section');
    element.className = `editor-control-group editor-${name}-group`;
    const title = document.createElement('h3');
    title.dataset.i18n = `itemEditor.section.${name}`;
    element.append(title);
    return element;
  };
  const background = group('card');
  const content = document.createElement('div');
  content.className = 'editor-content-groups';
  const groups = {};
  for (const name of ['icon', 'text']) {
    const panel = findPanel(name);
    if (!panel || !stylePanel) continue;
    const controls = group(name);
    controls.append(...panel.childNodes);
    panel.remove();
    root.querySelector(`[data-tab-button="${name}"], [data-tab$="-panel-${name}"]`)?.remove();
    content.append(controls);
    groups[name] = controls;
  }

  // Card/folder color is independent of the image source and URL lock.
  const colorInput = root.querySelector(type === 'bookmark'
    ? '[data-field="backgroundColor"]'
    : type === 'folder' ? '#folder-editor-color' : '#recycle-bin-editor-background-color');
  const colorWrapper = colorInput?.closest('.background-image-color');
  if (colorWrapper) {
    const transparency = stylePanel?.querySelector(type === 'bookmark'
      ? '[data-field="noBackground"]' : type === 'folder'
        ? '#folder-editor-no-background' : '#recycle-bin-editor-no-background');
    const row = document.createElement('div');
    row.className = 'editor-background-controls';
    if (transparency) row.append(transparency.closest('.checkbox-wrapper'));
    row.append(colorInput);
    colorWrapper.remove();
    if (type === 'folder') {
      groups.icon?.append(row);
      const outerToggle = root.querySelector('#folder-editor-no-outer-background')?.closest('.checkbox-wrapper');
      const outerColor = root.querySelector('#folder-editor-outer-color')?.closest('.edit-bookmark-modal-color-options');
      const outerRow = document.createElement('div');
      outerRow.className = 'editor-background-controls';
      if (outerToggle) outerRow.append(outerToggle);
      if (outerColor) outerRow.append(outerColor);
      background.append(outerRow);
    } else background.append(row);
  }
  const imageFields = root.querySelector(type === 'bookmark'
    ? '[data-field="backgroundImageUrlField"]'
    : type === 'folder' ? '#folder-editor-image-url-field' : '#recycle-bin-editor-image-url-field')?.parentElement;
  let imageDetails;
  let imageSummary;
  if (imageFields && stylePanel) {
    imageDetails = document.createElement('details');
    imageDetails.className = 'editor-image-section';
    const summary = document.createElement('summary');
    imageSummary = document.createElement('span');
    imageSummary.dataset.i18n = 'itemEditor.addImage';
    summary.append(imageSummary);
    imageDetails.append(summary, imageFields);
    const invertBackground = root.querySelector('[data-field="invertBg"]')?.closest('.checkbox-wrapper');
    if (invertBackground) imageFields.append(invertBackground);
  }
  if (stylePanel) {
    stylePanel.append(background, content);
    if (imageDetails) stylePanel.append(imageDetails);
  }

  const colorChips = [];
  for (const input of root.querySelectorAll('input[type="color"]:not(.local-image-field input)')) {
    const chip = document.createElement('div');
    chip.className = 'editor-color-chip';
    const code = document.createElement('button');
    code.type = 'button';
    code.className = 'editor-color-code';
    code.tabIndex = -1;
    input.before(chip);
    chip.append(input, code);
    code.addEventListener('click', () => openCustomColorPicker(input, { anchor: chip, returnFocusTo: input }), options);
    colorChips.push({ input, code, chip });
  }
  for (const action of root.querySelectorAll('.input-action')) {
    const key = action.classList.contains('input-toggle') ? 'lock'
      : action.classList.contains('input-copy') ? 'copy' : 'clear';
    if (!action.hasAttribute('data-i18n-aria-label')) action.dataset.i18nAriaLabel = `itemEditor.${key}`;
  }

  const header = root.closest('.modal')?.querySelector('.edit-bookmark-modal-header');
  if (header && !header.querySelector('.editor-description')) {
    const description = document.createElement('p');
    description.className = 'editor-description';
    description.dataset.i18n = 'itemEditor.description';
    header.append(description);
  }
  for (const panel of root.querySelectorAll('.edit-bookmark-modal-tab-content')) {
    const sectionName = panel.dataset.tabPanel || panel.id.split('-panel-').at(-1);
    if (sectionName !== 'general') continue;
    const intro = document.createElement('div');
    intro.className = 'editor-panel-intro';
    const heading = document.createElement('h3');
    heading.dataset.i18n = `itemEditor.section.${sectionName}`;
    const note = document.createElement('p');
    note.dataset.i18n = `itemEditor.hint.${type}.${sectionName}`;
    intro.append(heading, note);
    panel.prepend(intro);
  }

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn btn-ghost editor-reset-appearance';
  reset.dataset.i18n = 'itemEditor.reset';
  reset.addEventListener('click', () => onApply(getItemAppearance(type)), options);
  // The bookmark editor owns a reusable form; its footer belongs to the modal.
  const actions = root.querySelector('.modal-actions') || root.closest('.modal')?.querySelector('.modal-actions');
  actions?.prepend(reset);
  applyI18n(root);
  if (header) applyI18n(header);
  if (actions) applyI18n(actions);

  let sampleSignature;
  let lastImage;
  function sync() {
    const value = getValue();
    const signature = JSON.stringify([value.name, value.url, ...CONTENT_FIELDS[type].map(key => value[key])]);
    let selected = null;
    for (const button of looks.children) {
      const appearance = getItemAppearance(type, button.dataset.appearanceLook, value);
      const matches = Object.entries(appearance).every(([key, expected]) => value[key] === expected);
      button.setAttribute('aria-pressed', String(matches));
      if (matches) selected = button;
      if (renderSample && signature !== sampleSignature) {
        const card = renderSample({ ...value, ...appearance });
        card.classList.add('editor-look-item');
        for (const link of card.querySelectorAll('a')) {
          link.removeAttribute('href');
          link.tabIndex = -1;
        }
        button.querySelector('.editor-look-sample').replaceChildren(card);
      }
    }
    sampleSignature = signature;
    status.classList.toggle('is-hidden', Boolean(selected));
    reset.disabled = Object.entries(DEFAULTS[type]).every(([key, expected]) => value[key] === expected);
    if (type === 'bookmark') {
      root.querySelector('[data-field="showFavicon"]')?.closest('.checkbox-wrapper')
        ?.classList.toggle('is-hidden', value.backgroundFavicon);
    }
    for (const { input, code, chip } of colorChips) {
      code.textContent = input.value.toUpperCase();
      code.disabled = input.disabled;
      code.setAttribute('aria-label', input.getAttribute('aria-label') || input.labels?.[0]?.textContent || code.textContent);
      chip.classList.toggle('is-disabled', input.disabled);
    }
    if (imageDetails) {
      const activeImage = value.backgroundImageSource === 'local' ? value.backgroundImageLocal : value.backgroundImageUrl;
      if (activeImage && activeImage !== lastImage) imageDetails.open = true;
      lastImage = activeImage;
      imageSummary.dataset.i18n = activeImage ? 'itemEditor.changeImage' : 'itemEditor.addImage';
      applyI18n(imageDetails.querySelector('summary'));
      if (imageFields.querySelector('[aria-invalid="true"]')) imageDetails.open = true;
    }
  }

  sync();
  return {
    sync,
    refresh() {
      sampleSignature = undefined;
      lastImage = undefined;
      if (imageDetails) imageDetails.open = false;
      sync();
    },
    destroy() {
      abortController.abort();
      reset.remove();
      section.remove();
    }
  };
}
