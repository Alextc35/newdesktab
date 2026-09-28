import { flashSuccess } from './flash.js';

/**
 * Creates a lockable input controller.
 * Manages lock/unlock, clear and copy behavior for an input element.
 *
 * @param {Object} config
 * @param {HTMLInputElement} config.input
 * @param {HTMLElement} config.toggleBtn
 * @param {HTMLElement} [config.clearBtn]
 * @param {HTMLElement} [config.copyBtn]
 * @param {boolean} [config.initialLocked=false]
 * @param {Function} [config.onChange]
 * @param {AbortSignal} [config.signal]
 * @returns {{ isLocked: () => boolean, setLocked: (v: boolean) => void, destroy: () => void }}
 */
export function createLockableInputController({
  input,
  toggleBtn,
  clearBtn,
  copyBtn,
  initialLocked = false,
  onChange = () => {},
  signal
}) {
  let locked = initialLocked;
  const abortController = new AbortController();
  const eventOptions = { signal: abortController.signal };

  signal?.addEventListener('abort', () => abortController.abort(), { once: true });

  function updateUI() {
    const hasValue = input.value.trim() !== '';

    input.readOnly = locked;
    input.classList.toggle('input-locked', locked);

    toggleBtn.textContent = locked ? '🔒' : '🔓';
    toggleBtn.classList.toggle('is-locked', locked);

    toggleBtn.style.display = hasValue ? '' : 'none';

    if (clearBtn) {
      clearBtn.style.display =
      hasValue && !locked ? '' : 'none';
    }

    if (copyBtn) {
      copyBtn.style.display =
      hasValue ? '' : 'none';
    }
  }

  function setLocked(value) {
    locked = Boolean(value);
    updateUI();
    onChange();
  }

  function isLocked() {
    return locked;
  }

  // Events
  toggleBtn.addEventListener('click', () => {
    setLocked(!locked);
  }, eventOptions);

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (locked) return;
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, eventOptions);
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      if (!input.value) return;
      await navigator.clipboard.writeText(input.value);
      flashSuccess('flash.settings.copied');
    }, eventOptions);
  }

  input.addEventListener('input', () => {
    updateUI();
    onChange();
  }, eventOptions);

  updateUI();

  return {
    isLocked,
    setLocked,
    refresh: updateUI,
    destroy: () => abortController.abort()
  };
}
