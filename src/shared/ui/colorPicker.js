import { t } from '../../platform/i18n/i18n.js';
import { flashError, flashSuccess } from './flash.js';

const instances = new WeakMap();
let openInstance = null;
let generatedId = 0;
let removedInputObserver = null;

const QUICK_COLORS = [
  '#111827', '#ffffff', '#9ca3af', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
];

/** Initializes every static color input with the app's own color picker. */
export function initCustomColorPickers(root = document) {
  root.querySelectorAll('input[type="color"]').forEach(initCustomColorPicker);
}

/** Enhances one native color input while keeping it as the app's value source. */
export function initCustomColorPicker(input) {
  if (instances.has(input)) return instances.get(input);

  const id = input.id || `app-color-${++generatedId}`;
  if (!input.id) input.id = id;
  input.dataset.appColorPicker = '';
  input.setAttribute('aria-haspopup', 'dialog');
  input.setAttribute('aria-expanded', 'false');
  const accessibleLabel = getColorInputLabel(input);
  if (!input.getAttribute('aria-label') && accessibleLabel) {
    input.setAttribute('aria-label', accessibleLabel);
  }

  const modal = input.closest('.modal');
  const popover = document.createElement('section');
  popover.id = `${id}-color-picker`;
  popover.className = 'app-color-picker';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-labelledby', `${id}-color-picker-title`);
  popover.hidden = true;
  input.setAttribute('aria-controls', popover.id);

  const header = document.createElement('header');
  header.className = 'app-color-picker-header';
  const title = document.createElement('strong');
  title.id = `${id}-color-picker-title`;
  title.textContent = t('colorPicker.title');
  const headerActions = document.createElement('div');
  headerActions.className = 'app-color-picker-header-actions';

  const sampleButton = document.createElement('button');
  sampleButton.type = 'button';
  sampleButton.className = 'app-color-picker-sample';
  sampleButton.setAttribute('aria-label', t('colorPicker.sample'));
  sampleButton.title = t('colorPicker.sample');
  sampleButton.append(createPipetteIcon());
  sampleButton.hidden = typeof window.EyeDropper !== 'function';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'app-color-picker-close';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', t('colorPicker.close'));

  headerActions.append(sampleButton, closeButton);
  header.append(title, headerActions);

  const field = document.createElement('div');
  field.className = 'app-color-picker-field';
  field.tabIndex = 0;
  field.setAttribute('role', 'slider');
  field.setAttribute('aria-label', t('colorPicker.saturationBrightness'));
  field.setAttribute('aria-valuemin', '0');
  field.setAttribute('aria-valuemax', '100');
  const thumb = document.createElement('span');
  thumb.className = 'app-color-picker-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  field.append(thumb);

  const hue = document.createElement('input');
  hue.className = 'app-color-picker-hue';
  hue.type = 'range';
  hue.min = '0';
  hue.max = '359';
  hue.step = '1';
  hue.setAttribute('aria-label', t('colorPicker.hue'));

  const paletteLabel = document.createElement('span');
  paletteLabel.className = 'app-color-picker-section-label';
  paletteLabel.textContent = t('colorPicker.quickColors');
  const palette = document.createElement('div');
  palette.className = 'app-color-picker-palette';
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', t('colorPicker.quickColors'));

  for (const color of QUICK_COLORS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'app-color-picker-preset';
    swatch.style.setProperty('--swatch-color', color);
    swatch.title = color.toUpperCase();
    swatch.setAttribute('aria-label', color.toUpperCase());
    swatch.setAttribute('aria-pressed', 'false');
    swatch.dataset.color = color;
    swatch.addEventListener('click', () => setColor(color));
    palette.append(swatch);
  }

  const valueRow = document.createElement('div');
  valueRow.className = 'app-color-picker-value-row';
  const hexId = `${id}-color-hex`;
  const hexLabel = document.createElement('label');
  hexLabel.htmlFor = hexId;
  hexLabel.textContent = t('colorPicker.hex');
  const hexInput = document.createElement('input');
  hexInput.id = hexId;
  hexInput.className = 'app-color-picker-hex';
  hexInput.type = 'text';
  hexInput.inputMode = 'text';
  hexInput.autocomplete = 'off';
  hexInput.spellcheck = false;
  hexInput.maxLength = 7;
  hexInput.setAttribute('aria-label', t('colorPicker.hex'));
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'app-color-picker-copy';
  copyButton.textContent = '📋';
  copyButton.title = t('colorPicker.copy');
  copyButton.setAttribute('aria-label', t('colorPicker.copy'));
  valueRow.append(hexLabel, hexInput, copyButton);

  popover.append(header, field, hue, paletteLabel, palette, valueRow);
  (modal ?? document.body).append(popover);

  let hueValue = 0;
  let saturation = 1;
  let brightness = 1;
  let currentColor = normalizeHex(input.value) ?? '#000000';
  let initialColor = currentColor;
  let isOpen = false;
  let hasChanges = false;
  let dragging = false;
  let focusReturnTarget = input;
  let activeAnchor = input;
  let onCloseCallback = null;

  function syncFromInput() {
    const color = normalizeHex(input.value);
    if (!color) return;
    currentColor = color;
    ({ h: hueValue, s: saturation, v: brightness } = hexToHsv(color));
    syncControls();
  }

  function syncControls() {
    field.style.setProperty('--picker-hue', `${hueValue}deg`);
    thumb.style.left = `${saturation * 100}%`;
    thumb.style.top = `${(1 - brightness) * 100}%`;
    hue.value = String(Math.round(hueValue));
    field.setAttribute('aria-valuenow', String(Math.round(brightness * 100)));
    field.setAttribute('aria-valuetext',
      `${t('colorPicker.saturation')} ${Math.round(saturation * 100)}%, `
      + `${t('colorPicker.brightness')} ${Math.round(brightness * 100)}%`);
    palette.querySelectorAll('.app-color-picker-preset').forEach(swatch => {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.color === currentColor));
    });
    hexInput.value = currentColor.toUpperCase();
  }

  function setColor(value, { fromHex = false } = {}) {
    const color = normalizeHex(value);
    if (!color) return false;

    currentColor = color;
    ({ h: hueValue, s: saturation, v: brightness } = hexToHsv(color));
    syncControls();
    if (input.value.toLowerCase() !== color) {
      input.value = color;
      if (isOpen) hasChanges = color !== initialColor;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (fromHex) hexInput.value = color.toUpperCase();
    return true;
  }

  function updateFromField(clientX, clientY) {
    const rect = field.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    saturation = clamp((clientX - rect.left) / rect.width);
    brightness = 1 - clamp((clientY - rect.top) / rect.height);
    setColor(hsvToHex(hueValue, saturation, brightness));
  }

  function positionPopover(anchor = input) {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(284, window.innerWidth - 16);
    popover.style.width = `${width}px`;
    popover.style.maxHeight = 'none';
    popover.style.overflow = 'visible';
    field.style.height = '';
    paletteLabel.hidden = false;
    palette.hidden = false;

    const margin = 8;
    const gap = 6;
    const below = Math.max(0, window.innerHeight - rect.bottom - gap - margin);
    const above = Math.max(0, rect.top - gap - margin);
    const naturalHeight = popover.offsetHeight;
    const openAbove = naturalHeight > below && above > below;
    const available = openAbove ? above : below;

    if (naturalHeight > available) {
      const baseFieldHeight = field.getBoundingClientRect().height;
      let fixedHeight = popover.offsetHeight - baseFieldHeight;
      let fieldHeight = available - fixedHeight;
      if (fieldHeight < 48) {
        paletteLabel.hidden = true;
        palette.hidden = true;
        fixedHeight = popover.offsetHeight - baseFieldHeight;
        fieldHeight = available - fixedHeight;
      }
      field.style.height = `${Math.max(32, Math.min(baseFieldHeight, fieldHeight))}px`;
    }

    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const height = popover.offsetHeight;
    const desiredTop = openAbove ? rect.top - height - gap : rect.bottom + gap;
    const top = Math.max(margin, Math.min(desiredTop, window.innerHeight - height - margin));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function open({ anchor = input, returnFocusTo = input, onOpen, onClose } = {}) {
    if (input.disabled || isOpen) return;
    openInstance?.close({ commit: true, restoreFocus: false });
    updateLabels();
    syncFromInput();
    initialColor = currentColor;
    hasChanges = false;
    isOpen = true;
    openInstance = instance;
    focusReturnTarget = returnFocusTo;
    activeAnchor = anchor;
    onCloseCallback = onClose ?? null;
    popover.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    positionPopover(anchor);
    onOpen?.();
    field.focus({ preventScroll: true });
  }

  function close({ commit = true, restoreFocus = false } = {}) {
    if (!isOpen) return;
    if (commit && hasChanges) {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (!commit && currentColor !== initialColor) {
      setColor(initialColor);
    }
    hasChanges = false;
    isOpen = false;
    popover.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    if (openInstance === instance) openInstance = null;
    activeAnchor = input;
    const onClose = onCloseCallback;
    onCloseCallback = null;
    onClose?.();
    if (restoreFocus) {
      const target = focusReturnTarget?.isConnected ? focusReturnTarget : input;
      target.focus({ preventScroll: true });
    }
    focusReturnTarget = input;
  }

  function updateLabels() {
    title.textContent = t('colorPicker.title');
    sampleButton.setAttribute('aria-label', t('colorPicker.sample'));
    sampleButton.title = t('colorPicker.sample');
    closeButton.setAttribute('aria-label', t('colorPicker.close'));
    field.setAttribute('aria-label', t('colorPicker.saturationBrightness'));
    hue.setAttribute('aria-label', t('colorPicker.hue'));
    paletteLabel.textContent = t('colorPicker.quickColors');
    palette.setAttribute('aria-label', t('colorPicker.quickColors'));
    hexLabel.textContent = t('colorPicker.hex');
    hexInput.setAttribute('aria-label', t('colorPicker.hex'));
    copyButton.title = t('colorPicker.copy');
    copyButton.setAttribute('aria-label', t('colorPicker.copy'));
  }

  function commitChanges() {
    if (!hasChanges) return;
    hasChanges = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function onOutsidePointer(event) {
    if (!isOpen || input === event.target || popover.contains(event.target)
      || activeAnchor === event.target || activeAnchor.contains(event.target)) return;
    close({ commit: true });
  }

  function onFocusIn(event) {
    if (isOpen && event.target !== input && !popover.contains(event.target)
      && activeAnchor !== event.target && !activeAnchor.contains(event.target)) {
      close({ commit: true });
    }
  }

  function onKeyDown(event) {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close({ commit: false, restoreFocus: true });
    }
  }

  function onViewportChange(event) {
    if (event?.type === 'scroll'
      && (event.target === popover || popover.contains(event.target))) return;
    if (isOpen) close({ commit: true });
  }

  input.addEventListener('click', event => {
    event.preventDefault();
    if (isOpen) close({ commit: true });
    else open();
  });
  input.addEventListener('input', syncFromInput);
  input.addEventListener('change', syncFromInput);

  field.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    field.setPointerCapture(event.pointerId);
    updateFromField(event.clientX, event.clientY);
  });
  field.addEventListener('pointermove', event => {
    if (dragging) updateFromField(event.clientX, event.clientY);
  });
  field.addEventListener('pointerup', event => {
    if (!dragging) return;
    dragging = false;
    if (field.hasPointerCapture(event.pointerId)) field.releasePointerCapture(event.pointerId);
    commitChanges();
  });
  field.addEventListener('pointercancel', () => {
    dragging = false;
    commitChanges();
  });
  field.addEventListener('keydown', event => {
    const step = event.shiftKey ? .1 : .02;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') saturation = clamp(saturation - step);
    if (event.key === 'ArrowRight') saturation = clamp(saturation + step);
    if (event.key === 'ArrowUp') brightness = clamp(brightness + step);
    if (event.key === 'ArrowDown') brightness = clamp(brightness - step);
    if (event.key === 'Home') saturation = 0;
    if (event.key === 'End') saturation = 1;
    setColor(hsvToHex(hueValue, saturation, brightness));
    commitChanges();
  });

  hue.addEventListener('input', () => {
    hueValue = Number(hue.value);
    setColor(hsvToHex(hueValue, saturation, brightness));
  });
  hue.addEventListener('change', commitChanges);

  hexInput.addEventListener('input', () => {
    const value = parseHex(hexInput.value, false);
    if (value) setColor(value, { fromHex: true });
  });
  hexInput.addEventListener('change', () => {
    const value = parseHex(hexInput.value, true);
    if (value) {
      setColor(value, { fromHex: true });
      commitChanges();
    } else {
      hexInput.value = currentColor.toUpperCase();
    }
  });
  hexInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const value = parseHex(hexInput.value, true);
      if (value) setColor(value, { fromHex: true });
      else hexInput.value = currentColor.toUpperCase();
      commitChanges();
    }
  });

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentColor.toUpperCase());
      copyButton.textContent = '✓';
      copyButton.title = t('colorPicker.copied');
      copyButton.setAttribute('aria-label', t('colorPicker.copied'));
      flashSuccess('flash.settings.copied');
      window.setTimeout(() => {
        if (!copyButton.isConnected) return;
        copyButton.textContent = '📋';
        copyButton.title = t('colorPicker.copy');
        copyButton.setAttribute('aria-label', t('colorPicker.copy'));
      }, 1100);
    } catch {
      flashError('colorPicker.copyFailed');
    }
  });

  closeButton.addEventListener('click', () => close({ commit: true, restoreFocus: true }));
  sampleButton.addEventListener('click', async () => {
    if (typeof window.EyeDropper !== 'function') return;
    try {
      const result = await new window.EyeDropper().open();
      setColor(result.sRGBHex);
      commitChanges();
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.warn('[COLOR PICKER] Could not sample a screen color:', error);
      }
    }
  });

  document.addEventListener('pointerdown', onOutsidePointer, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange);

  const disabledObserver = new MutationObserver(() => {
    if (input.disabled && isOpen) close({ commit: true });
  });
  disabledObserver.observe(input, { attributes: true, attributeFilter: ['disabled'] });

  const instance = {
    open: options => open(options),
    close: options => close(options),
    destroy() {
      close({ commit: true });
      document.removeEventListener('pointerdown', onOutsidePointer, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
      disabledObserver.disconnect();
      popover.remove();
      instances.delete(input);
    }
  };
  instances.set(input, instance);
  watchForRemovedInputs();
  return instance;
}

/** Opens an initialized app color picker from another, more visible trigger. */
export function openCustomColorPicker(input, options = {}) {
  instances.get(input)?.open(options);
}

function watchForRemovedInputs() {
  if (removedInputObserver || !document.documentElement) return;
  removedInputObserver = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const inputs = [];
        if (node.matches?.('input[type="color"][data-app-color-picker]')) inputs.push(node);
        inputs.push(...node.querySelectorAll('input[type="color"][data-app-color-picker]'));
        inputs.forEach(input => {
          if (!input.isConnected) instances.get(input)?.destroy();
        });
      }
    }
  });
  removedInputObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function getColorInputLabel(input) {
  const ariaLabel = input.getAttribute('aria-label')?.trim();
  if (ariaLabel) return ariaLabel;
  return [...(input.labels ?? [])]
    .map(label => label.textContent.trim())
    .filter(Boolean)
    .join(' ');
}

function createPipetteIcon() {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', 'm2 22 1-1h3l9-9M3 21v-3l9-9m2-3 4-4 4 4-4 4m-5-1 4 4');
  svg.append(path);
  return svg;
}

function parseHex(value, allowShort) {
  const text = String(value).trim().replace(/^#/, '');
  if (allowShort && /^[\da-f]{3}$/i.test(text)) {
    return `#${[...text].map(channel => channel + channel).join('')}`.toLowerCase();
  }
  return /^[\da-f]{6}$/i.test(text) ? `#${text}`.toLowerCase() : null;
}

function normalizeHex(value) {
  return parseHex(value, true);
}

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

function hexToHsv(hex) {
  const value = normalizeHex(hex) ?? '#000000';
  const r = Number.parseInt(value.slice(1, 3), 16) / 255;
  const g = Number.parseInt(value.slice(3, 5), 16) / 255;
  const b = Number.parseInt(value.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;

  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }

  return {
    h: (h + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max
  };
}

function hsvToHex(hue, saturation, brightness) {
  const chroma = brightness * saturation;
  const hueSection = ((hue % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const match = brightness - chroma;
  const [r, g, b] = hueSection < 1 ? [chroma, x, 0]
    : hueSection < 2 ? [x, chroma, 0]
    : hueSection < 3 ? [0, chroma, x]
    : hueSection < 4 ? [0, x, chroma]
    : hueSection < 5 ? [x, 0, chroma]
    : [chroma, 0, x];
  const channel = value => Math.round((value + match) * 255).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}
