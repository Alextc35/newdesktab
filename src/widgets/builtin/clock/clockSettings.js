import { getState, requirePersistence, retryPersistence } from '../../../state/appStore.js';
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
let pendingDeletion = false;
let modal;
let modalTitle;
let hourCycleSelect;
let showSecondsInput;
let preview;
let deleteButton;
let saveButton;
let stopPreviewTicker = null;
let createCancelHandler = null;

export function initClockSettings({ modalHost } = {}) {
  if (initialized) return;
  if (!modalHost) {
    throw new Error('Clock widget requires a modal host.');
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
  modalHost.append(modal);

  hourCycleSelect.addEventListener('change', renderPreview);
  showSecondsInput.addEventListener('change', renderPreview);
  view.cancelButton.addEventListener('click', handleCancel);
  deleteButton.addEventListener('click', handleDelete);
  saveButton.addEventListener('click', handleSave);
  registerModal({
    id: MODAL_ID,
    element: modal,
    closeOnEsc: true,
    closeOnOverlay: true,
    acceptOnEnter: true
  });
}

export function openCreateClock({ onCancel } = {}) {
  mode = 'create';
  activeWidgetId = null;
  createCancelHandler = typeof onCancel === 'function' ? onCancel : null;
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
  createCancelHandler = null;
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

  const result = mode === 'create' && !activeWidgetId
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

  activeWidgetId = result.id;
  try {
    await requirePersistence();
    closeModal(MODAL_ID);
    flashSuccess(mode === 'create' ? 'flash.clock.added' : 'flash.clock.updated');
    resetEditor();
  } catch {
    flashError('settingsModal.sync.status.error');
  } finally {
    submitting = false;
    syncControls(false);
  }
}

async function handleDelete() {
  if (submitting || mode !== 'edit' || !activeWidgetId) return;
  const confirmed = pendingDeletion || await showAlert(t('clock.confirmDelete'), {
    type: 'confirm',
    requiresWideViewport: false
  });
  if (!confirmed) return;

  submitting = true;
  syncControls(true);
  try {
    if (pendingDeletion) {
      await retryPersistence();
    } else {
      if (!deleteWidgetById(activeWidgetId)) return;
      pendingDeletion = true;
      await requirePersistence();
    }
    closeModal(MODAL_ID);
    flashSuccess('flash.clock.deleted');
    resetEditor();
  } catch {
    flashError('settingsModal.sync.status.error');
  } finally {
    submitting = false;
    syncControls(false);
  }
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
  const onCreateCancel = mode === 'create' ? createCancelHandler : null;
  closeModal(MODAL_ID);
  resetEditor();
  onCreateCancel?.();
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
  pendingDeletion = false;
  activeWidgetId = null;
  initialConfig = null;
  createCancelHandler = null;
  syncControls(false);
}
