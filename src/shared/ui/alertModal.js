import { t } from '../../platform/i18n/i18n.js';
import { registerModal, openModal, closeModal, isModalSuspended } from './modalManager.js';
import { flashInfo } from './flash.js';

/**
 * Alert modal root element.
 */
let modal;

/**
 * Alert modal title element.
 */
let titleEl;

/**
 * Accept button element.
 */
let btnAccept;

/**
 * Cancel button element.
 */
let btnCancel;
let inputEl;
let checkboxWrapper;
let checkboxEl;
let checkboxLabelEl;

/**
 * Active accept handler for the currently displayed alert.
 */
let activeAccept = null;

/**
 * Active cancel handler for the currently displayed alert.
 */
let activeCancel = null;

/**
 * Initializes the alert modal once.
 *
 * Responsibilities:
 * - resolve modal DOM elements
 * - bind accept/cancel button actions
 * - register the modal in the modal manager
 */
export function initAlertModal() {
  if (modal) return;

  modal = document.getElementById('alert-modal');

  titleEl = modal.querySelector('#alert-modal-title');
  btnCancel = modal.querySelector('#alert-modal-cancel');
  btnAccept = modal.querySelector('#alert-modal-accept');
  inputEl = modal.querySelector('#alert-modal-input');
  checkboxWrapper = modal.querySelector('#alert-modal-checkbox-wrapper');
  checkboxEl = modal.querySelector('#alert-modal-checkbox');
  checkboxLabelEl = modal.querySelector('#alert-modal-checkbox-label');

  /**
   * Delegate accept button clicks to the currently active handler.
   */
  btnAccept.addEventListener('click', () => {
    activeAccept?.();
  });

  /**
   * Delegate cancel button clicks to the currently active handler.
   */
  btnCancel.addEventListener('click', () => {
    activeCancel?.();
  });

  /**
   * Register the alert modal with the modal manager.
   *
   * Behavior:
   * - Enter accepts
   * - Escape cancels/closes
   * - overlay clicks do not close the modal
   */
  registerModal({
    id: 'alert',
    element: modal,
    acceptOnEnter: true,
    closeOnEsc: true,
    closeOnOverlay: false,
    initialFocus: btnAccept
  });
}

/**
 * Displays the alert modal and returns a promise
 * resolved with the user's action.
 *
 * Supported types:
 * - confirm: shows accept and cancel buttons
 * - info: shows only the accept button
 *
 * @param {string} text - Alert message to display.
 * @param {Object} [options={}]
 * @param {'confirm'|'info'} [options.type='confirm']
 * @param {boolean} [options.requiresWideViewport=false]
 * @returns {Promise<boolean>}
 */
export function showAlert(text, options = {}) {
  const { type = 'confirm', requiresWideViewport = false } = options;
  if (isModalSuspended('alert')) {
    flashInfo('flash.viewport.suspended');
    return Promise.resolve(false);
  }

  return new Promise((resolveResult) => {
    /**
     * Update modal content and button labels.
     */
    titleEl.textContent = text;

    btnAccept.textContent = t('buttons.accept');
    btnCancel.textContent = t('buttons.cancel');
    btnCancel.style.display = type === 'info' ? 'none' : 'inline-block';
    inputEl.classList.add('is-hidden');
    inputEl.removeAttribute('aria-invalid');
    resetCheckboxOption();

    /**
     * Resolve the alert as accepted and close the modal.
     */
    activeAccept = () => {
      resolveResult(true);
      closeModal();
    };

    /**
     * Resolve the alert as cancelled and close the modal.
     */
    activeCancel = () => {
      resolveResult(false);
      closeModal();
    };

    /**
     * Open the modal and expose the same handlers
     * to the modal manager lifecycle.
     */
    openModal('alert', {
      onAccept: activeAccept,
      onCancel: activeCancel,
      requiresWideViewport
    });
  });
}

/**
 * Displays a confirmation with one optional checkbox.
 *
 * @param {string} text
 * @param {Object} options
 * @param {string} options.checkboxLabel
 * @param {boolean} [options.checked=false]
 * @param {boolean} [options.requiresWideViewport=false]
 * @returns {Promise<{confirmed: boolean, checkboxChecked: boolean}>}
 */
export function showConfirmWithCheckbox(text, {
  checkboxLabel,
  checked = false,
  requiresWideViewport = false
} = {}) {
  if (isModalSuspended('alert')) {
    flashInfo('flash.viewport.suspended');
    return Promise.resolve({ confirmed: false, checkboxChecked: false });
  }

  return new Promise(resolve => {
    titleEl.textContent = text;
    inputEl.classList.add('is-hidden');
    inputEl.removeAttribute('aria-invalid');
    checkboxLabelEl.textContent = checkboxLabel;
    checkboxEl.checked = checked;
    checkboxWrapper.classList.remove('is-hidden');
    btnAccept.textContent = t('buttons.accept');
    btnCancel.textContent = t('buttons.cancel');
    btnCancel.style.display = 'inline-block';

    activeAccept = () => {
      resolve({ confirmed: true, checkboxChecked: checkboxEl.checked });
      closeModal();
    };
    activeCancel = () => {
      resolve({ confirmed: false, checkboxChecked: false });
      closeModal();
    };

    openModal('alert', {
      onAccept: activeAccept,
      onCancel: activeCancel,
      requiresWideViewport
    });
  });
}

/**
 * Displays a small accessible text prompt using the managed alert dialog.
 *
 * @param {string} text
 * @param {{value?: string, placeholder?: string, requiresWideViewport?: boolean}} [options]
 * @returns {Promise<string|null>}
 */
export function showPrompt(text, { value = '', placeholder = '', requiresWideViewport = false } = {}) {
  // The shared dialog may still hold a draft or a pending confirmation.
  if (isModalSuspended('alert')) {
    flashInfo('flash.viewport.suspended');
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    titleEl.textContent = text;
    inputEl.value = value;
    inputEl.placeholder = placeholder;
    inputEl.classList.remove('is-hidden');
    inputEl.removeAttribute('aria-invalid');
    resetCheckboxOption();
    btnAccept.textContent = t('buttons.accept');
    btnCancel.textContent = t('buttons.cancel');
    btnCancel.style.display = 'inline-block';

    activeAccept = () => {
      const result = inputEl.value.trim();
      if (!result) {
        inputEl.setAttribute('aria-invalid', 'true');
        inputEl.focus();
        return;
      }
      resolve(result);
      closeModal();
    };
    activeCancel = () => {
      resolve(null);
      closeModal();
    };

    openModal('alert', {
      onAccept: activeAccept,
      onCancel: activeCancel,
      requiresWideViewport,
      initialFocus: inputEl
    });
  });
}

function resetCheckboxOption() {
  checkboxWrapper.classList.add('is-hidden');
  checkboxEl.checked = false;
  checkboxLabelEl.textContent = '';
}
