import { t } from '../../platform/i18n/i18n.js';

const MAX_FLASHES = 3;
const flashContainer = document.getElementById('flash-container');

/**
 * Displays a flash notification message in the UI.
 *
 * Limits the number of visible messages according to MAX_FLASHES.
 * The message is automatically removed after the specified duration.
 *
 * @param {string} message - Translation key for the message.
 * @param {'info'|'success'|'error'} [type='info'] - Visual type of the flash message.
 * @param {number} [duration=3000] - Time in milliseconds before the message disappears.
 * @param {Object<string, string|number>} [params={}] - Translation variables.
 * @returns {void}
 */
export function flash(message, type = 'info', duration = 3000, params = {}) {
  if (!flashContainer) return;

  while (flashContainer.children.length >= MAX_FLASHES) {
    flashContainer.firstElementChild.remove();
  }

  const flashMessage = document.createElement('div');
  flashMessage.className = `flash-message flash-${type}`;
  flashMessage.textContent = t(message, params);

  flashContainer.appendChild(flashMessage);

  requestAnimationFrame(() => flashMessage.classList.add('show'));

  setTimeout(() => {
    flashMessage.classList.remove('show');
    flashMessage.addEventListener('transitionend', () => flashMessage.remove(), { once: true });
  }, duration);
}

/**
 * Displays a success flash notification.
 *
 * @param {string} msg - Translation key for the message.
 * @param {number} [duration] - Optional duration in milliseconds.
 * @param {Object<string, string|number>} [params] - Translation variables.
 * @returns {void}
 */
export function flashSuccess(msg, duration, params) { flash(msg, 'success', duration, params); }

/**
 * Displays an error flash notification.
 *
 * @param {string} msg - Translation key for the message.
 * @param {number} [duration] - Optional duration in milliseconds.
 * @param {Object<string, string|number>} [params] - Translation variables.
 * @returns {void}
 */
export function flashError(msg, duration, params) { flash(msg, 'error', duration, params); }

/**
 * Displays an informational flash notification.
 *
 * @param {string} msg - Translation key for the message.
 * @param {number} [duration] - Optional duration in milliseconds.
 * @param {Object<string, string|number>} [params] - Translation variables.
 * @returns {void}
 */
export function flashInfo(msg, duration, params) { flash(msg, 'info', duration, params); }
