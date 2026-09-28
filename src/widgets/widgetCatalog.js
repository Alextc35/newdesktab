import { t } from '../platform/i18n/i18n.js';
import { closeModal, openModal, registerModal } from '../shared/ui/modalManager.js';
import { widgetRegistry } from './widgetRegistry.js';
import { createWidgetCatalogView } from './widgetCatalogView.js';

const MODAL_ID = 'widget-catalog';
let initialized = false;
let catalogView = null;

/** Connects the generic launcher action to the registered widget catalog. */
export function initWidgetCatalog({
  launcherButton,
  modalHost,
  registry = widgetRegistry
} = {}) {
  if (initialized) return;
  if (!launcherButton || !modalHost) {
    throw new Error('Widget catalog requires launcher and modal hosts.');
  }
  initialized = true;

  catalogView = createWidgetCatalogView(registry.catalog(), t);
  modalHost.append(catalogView.modal);
  launcherButton.addEventListener('click', openWidgetCatalog);
  catalogView.closeButton.addEventListener('click', closeWidgetCatalog);
  catalogView.list.addEventListener('click', event => {
    const button = event.target.closest('[data-widget-type]');
    if (!button) return;
    const widget = registry.get(button.dataset.widgetType);
    if (!widget?.create) return;
    closeWidgetCatalog();
    widget.create({ onCancel: openWidgetCatalog });
  });

  registerModal({
    id: MODAL_ID,
    element: catalogView.modal,
    closeOnEsc: true,
    closeOnOverlay: true
  });
}

export function openWidgetCatalog() {
  if (!catalogView) return;
  openModal(MODAL_ID, {
    onCancel: closeWidgetCatalog,
    initialFocus: catalogView.list.querySelector('[data-widget-type]') || catalogView.closeButton
  });
}

function closeWidgetCatalog() {
  closeModal(MODAL_ID);
}
