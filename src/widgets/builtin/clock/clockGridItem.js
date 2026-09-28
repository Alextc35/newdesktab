import { t } from '../../../platform/i18n/i18n.js';
import { createItemActionButton } from '../../../shared/ui/itemActionButton.js';
import { addGridItemPointerControls } from '../../../features/grid/gridPointerController.js';
import { applyGridItemPosition } from '../../../features/grid/gridItemLayout.js';
import { isGridKeyboardActive } from '../../../features/grid/gridKeyboardController.js';
import { isGridItemSelected } from '../../../features/grid/gridSelection.js';
import { deleteWidgetById } from '../../widgetActions.js';
import { CLOCK_WIDGET_TYPE, normalizeClockConfig } from './clockModel.js';
import { createClockTimeElement, startClockTicker } from './clockView.js';
import { openClockEditor } from './clockSettings.js';

export const clockWidget = Object.freeze({
  type: CLOCK_WIDGET_TYPE,
  order: { grid: 40, list: 40 },
  render({ view, container, widget, config, state }) {
    return view === 'list'
      ? createClockListItem(widget, config)
      : createClockGridElement(container, widget, config, state.ui.isEditing);
  },
  enableEditing: enableClockEditing,
  open: ({ widget }) => openClockEditor(widget.id),
  edit: ({ widget }) => openClockEditor(widget.id),
  getRemovalConfirmation({ permanent }) {
    return t(permanent ? 'clock.confirmPermanentDelete' : 'clock.confirmDelete');
  },
  getRemovalSuccessMessage() {
    return 'flash.clock.deleted';
  },
  remove({ widget, permanent }) {
    return deleteWidgetById(widget.id, { recordHistory: !permanent });
  }
});

function createClockGridElement(container, widget, config, isEditing) {
  const normalized = normalizeClockConfig(config);
  const element = document.createElement('article');
  element.className = 'grid-widget clock-widget';
  element.classList.toggle('is-selected', isGridItemSelected('widget', widget.id));
  element.classList.toggle('is-keyboard-active', isGridKeyboardActive(widget.id));
  element.classList.toggle('is-editing', isEditing);
  element.classList.toggle('is-single-cell', widget.w === 1 && widget.h === 1);
  applyGridItemPosition(container, element, widget);

  const face = document.createElement('button');
  face.className = 'clock-widget-face';
  face.type = 'button';
  face.setAttribute('aria-label', t('clock.openSettings'));
  const time = createClockTimeElement(normalized);
  face.append(time);
  face.addEventListener('click', event => {
    if (element.classList.contains('is-editing')) {
      event.preventDefault();
      return;
    }
    openClockEditor(widget.id);
  });
  element.append(face);
  startClockTicker(time, normalized);

  if (isEditing) enableClockEditing(container, element, widget);
  return element;
}

function createClockListItem(widget, config) {
  const normalized = normalizeClockConfig(config);
  const row = document.createElement('li');
  row.className = 'bookmark bookmark-list-item clock-widget-list-item';
  row.dataset.listSearchStatic = 'true';
  row.classList.toggle('is-keyboard-active', isGridKeyboardActive(widget.id));

  const button = document.createElement('button');
  button.className = 'bookmark-list-link clock-widget-list-link';
  button.type = 'button';
  button.setAttribute('aria-label', t('clock.openSettings'));
  button.addEventListener('click', () => openClockEditor(widget.id));

  const icon = document.createElement('span');
  icon.className = 'bookmark-list-icon clock-widget-list-icon';
  icon.textContent = '◷';
  icon.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('span');
  copy.className = 'bookmark-list-copy';
  const name = document.createElement('span');
  name.className = 'bookmark-list-name';
  name.textContent = t('clock.name');
  const time = createClockTimeElement(normalized, { className: 'bookmark-list-detail' });
  copy.append(name, time);

  const arrow = document.createElement('span');
  arrow.className = 'bookmark-list-arrow';
  arrow.textContent = '›';
  arrow.setAttribute('aria-hidden', 'true');
  button.append(icon, copy, arrow);
  row.append(button);
  startClockTicker(time, normalized);
  return row;
}

export function enableClockEditing(container, element, widget) {
  if (element.dataset.editingControlsAttached === 'true') return;
  element.dataset.editingControlsAttached = 'true';
  element.classList.add('is-editing');

  const actions = document.createElement('div');
  actions.className = 'item-actions clock-widget-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', t('clock.actions'));
  const editButton = createItemActionButton('✎', 'edit', 'is-dark', () => {
    openClockEditor(widget.id);
  });
  editButton.setAttribute('aria-label', t('clock.edit'));
  actions.append(editButton);
  element.append(actions);

  addGridItemPointerControls(container, element, widget, { kind: 'widget' });
}
