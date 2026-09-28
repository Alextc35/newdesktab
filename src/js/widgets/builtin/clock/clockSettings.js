import { getState, waitForPersistence } from '../../../state/appStore.js';
import { getMaxVisibleCols, getMaxVisibleRows } from '../../../features/grid/gridLayout.js';
import { t } from '../../../platform/i18n/i18n.js';
import { showAlert } from '../../../shared/ui/alertModal.js';
import { flashError, flashSuccess } from '../../../shared/ui/flash.js';
import { closeModal, openModal, registerModal } from '../../../shared/ui/modalManager.js';
import { addWidget, deleteWidgetById, updateWidgetById } from '../../widgetActions.js';
import {
  CLOCK_WIDGET_TYPE,
  CLOCK_WIDGET_VERSION,
  DEFAULT_CLOCK_CONFIG,
  normalizeClockConfig
} from './clockModel.js';
import { createClockSettingsView } from './clockSettingsView.js';
import { startClockTicker, updateClockTimeElement } from './clockView.js';

const MODAL_ID = 'clock-widget-settings';
let initialized = false;
let mode = null;
let activeWidgetId = null;
let initialConfig = null;
let submitting = false;
let modal;
let modalTitle;
let hourCycleSelect;
let showSecondsInput;
let preview;
let deleteButton;
let saveButton;
let stopPreviewTicker = null;

export function initClockSettings({ launcher, modalHost } = {}) {
  if (initialized) return;
  if (!launcher || !modalHost) {
    throw new Error('Clock widget requires launcher and modal hosts.');
  }
  initialized = true;

  const view = createClockSettingsView(t);
  ({
    modal,
    modalTitle,
    hourCycleSelect,
    showSecondsInput,
    preview,
    deleteButton,
    saveButton
  } = view);
  launcher.append(view.launcherButton);
  modalHost.append(modal);

  hourCycleSelect.addEventListener('change', renderPreview);
  showSecondsInput.addEventListener('change', renderPreview);
  view.cancelButton.addEventListener('click', handleCancel);
  deleteButton.addEventListener('click', handleDelete);
  saveButton.addEventListener('click', handleSave);
  view.launcherButton.addEventListener('click', openCreateClock);

  registerModal({
    id: MODAL_ID,
    element: modal,
    closeOnEsc: true,
    closeOnOverlay: true,
    acceptOnEnter: true
  });
}

export function openCreateClock() {
  mode = 'create';
  activeWidgetId = null;
  initialConfig = structuredClone(DEFAULT_CLOCK_CONFIG);
  populateForm(initialConfig);
  modalTitle.textContent = t('clock.createTitle');
  saveButton.textContent = t('buttons.add');
  deleteButton.hidden = true;
  openEditor();
}

export function openClockEditor(widgetId) {
  const widget = getState().data.widgets.find(item => (
    item.id === widgetId && item.type === CLOCK_WIDGET_TYPE
  ));
  if (!widget) return;

  mode = 'edit';
  activeWidgetId = widgetId;
  initialConfig = normalizeClockConfig(widget.config);
  populateForm(initialConfig);
  modalTitle.textContent = t('clock.editTitle');
  saveButton.textContent = t('buttons.save');
  deleteButton.hidden = false;
  openEditor();
}

function openEditor() {
  submitting = false;
  syncControls(false);
  renderPreview();
  openModal(MODAL_ID, {
    onAccept: handleSave,
    onCancel: handleCancel,
    initialFocus: hourCycleSelect
  });
}

function populateForm(config) {
  const normalized = normalizeClockConfig(config);
  hourCycleSelect.value = normalized.hourCycle;
  showSecondsInput.checked = normalized.showSeconds;
}

function readConfig() {
  return normalizeClockConfig({
    hourCycle: hourCycleSelect.value,
    showSeconds: showSecondsInput.checked
  });
}

function renderPreview() {
  stopPreviewTicker?.();
  const config = readConfig();
  updateClockTimeElement(preview, config);
  stopPreviewTicker = startClockTicker(preview, config);
}

async function handleSave() {
  if (submitting || !mode) return;
  submitting = true;
  syncControls(true);
  const config = readConfig();

  const result = mode === 'create'
    ? addWidget({
      type: CLOCK_WIDGET_TYPE,
      version: CLOCK_WIDGET_VERSION,
      w: 2,
      h: 1,
      config
    }, {
      columns: getMaxVisibleCols(),
      rows: getMaxVisibleRows()
    })
    : updateWidgetById(activeWidgetId, { config, version: CLOCK_WIDGET_VERSION });

  if (!result) {
    submitting = false;
    syncControls(false);
    if (mode === 'create') flashError('clock.noSpace');
    return;
  }

  await waitForPersistence();
  closeModal(MODAL_ID);
  flashSuccess(mode === 'create' ? 'flash.clock.added' : 'flash.clock.updated');
  resetEditor();
}

async function handleDelete() {
  if (submitting || mode !== 'edit' || !activeWidgetId) return;
  const confirmed = await showAlert(t('clock.confirmDelete'), {
    type: 'confirm',
    requiresWideViewport: false
  });
  if (!confirmed) return;

  submitting = true;
  syncControls(true);
  if (!deleteWidgetById(activeWidgetId)) {
    submitting = false;
    syncControls(false);
    return;
  }
  await waitForPersistence();
  closeModal(MODAL_ID);
  flashSuccess('flash.clock.deleted');
  resetEditor();
}

async function handleCancel() {
  if (submitting) return;
  const changed = JSON.stringify(readConfig()) !== JSON.stringify(initialConfig);
  if (changed) {
    const confirmed = await showAlert(t('clock.cancel'), {
      type: 'confirm',
      requiresWideViewport: false
    });
    if (!confirmed) return;
  }
  closeModal(MODAL_ID);
  resetEditor();
}

function syncControls(disabled) {
  hourCycleSelect.disabled = disabled;
  showSecondsInput.disabled = disabled;
  deleteButton.disabled = disabled;
  saveButton.disabled = disabled;
}

function resetEditor() {
  stopPreviewTicker?.();
  stopPreviewTicker = null;
  submitting = false;
  mode = null;
  activeWidgetId = null;
  initialConfig = null;
  syncControls(false);
}
