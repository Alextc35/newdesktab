import { debug } from '../diagnostics/debug.js';

/**
 * Stack of currently open modals.
 *
 * The last visible element is the active modal; suspended drafts stay in place.
 *
 * @type {Array<Object>}
 */
const stack = [];

/**
 * Registry of all known modals.
 *
 * Keyed by modal id.
 *
 * @type {Map<string, Object>}
 */
const registry = new Map();
let compactViewport = false;

/**
 * Returns the currently active visible modal.
 *
 * @returns {Object|null}
 */
function getActive() {
  return stack.findLast(modal => !modal.suspended) || null;
}

/**
 * Returns whether any modal is currently visible.
 *
 * Used by global keyboard handlers to avoid conflicts.
 *
 * @returns {boolean}
 */
export function hasOpenModal() {
  return Boolean(getActive());
}

export function isModalSuspended(id) {
  return stack.some(modal => modal.id === id && modal.suspended);
}

export function isModalActive(id) {
  return getActive()?.id === id;
}

/**
 * Hide unavailable dialogs and their children without closing their drafts.
 * Returns whether any dialog was newly suspended, for a single viewport notice.
 */
export function syncModalViewport(compact = compactViewport) {
  compactViewport = compact;
  const previousActive = getActive();
  const focused = document.activeElement;
  let newlySuspended = false;
  let changed = false;

  for (const modal of stack) {
    const requiresWideViewport = typeof modal.requiresWideViewport === 'function'
      ? modal.requiresWideViewport()
      : modal.requiresWideViewport;
    const suspended = compact && (requiresWideViewport || Boolean(modal.parent?.suspended));
    if (suspended === modal.suspended) continue;

    changed = true;
    if (suspended) {
      newlySuspended = true;
      if (modal.element.contains(focused)) modal.resumeFocus = focused;
    }
    // Set state before hiding: blur handlers must not commit suspended drafts.
    modal.suspended = suspended;
    modal.element.hidden = suspended;
    modal.element.classList.toggle('is-open', !suspended);
  }

  if (!changed) return false;
  syncPageAccessibility();
  const active = getActive();
  if (active !== previousActive) {
    focusModal(active, active?.resumeFocus || active?.initialFocus);
  }
  return newlySuspended;
}

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;

  const isTyping =
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
    || document.activeElement?.isContentEditable;

  if (!isTyping) {
    for (const modalConfig of registry.values()) {
      if (!modalConfig.shortcut) continue;

      if (e.key === modalConfig.shortcut) {
        e.preventDefault();
        e.stopPropagation();

        const active = getActive();

        // If toggle enabled and this modal is active → cancel
        if (
          modalConfig.toggleWithShortcut &&
          active?.id === modalConfig.id
        ) {
          active.onCancel?.();
          return;
        }

        // If no modal open → trigger shortcut handler
        if (!active) {
          modalConfig.onShortcut?.();
          return;
        }
      }
    }
  }
  
  const modal = getActive();
  if (!modal) return;

  if (e.key === 'Tab') {
    trapFocus(e, modal.element);
    return;
  }

  if (e.key === 'Escape' && modal.closeOnEsc) {
    e.preventDefault();
    e.stopPropagation();
    modal.onCancel?.();
  }

  if (e.key === 'Enter' && modal.acceptOnEnter
    && !e.target.closest?.('button, summary, select, textarea, [role="slider"], .app-color-picker')
    && !e.target.matches?.('input[type="checkbox"], input[type="color"], input[type="file"]')) {
    e.preventDefault();
    e.stopPropagation();
    modal.onAccept?.();
    return;
  }
});

/**
 * Registers a modal with the manager.
 *
 * A modal must be registered once before it can be opened.
 *
 * @param {Object} config
 * @param {string} config.id - Unique modal identifier
 * @param {HTMLElement} config.element - Root modal element
 * @param {boolean} [config.closeOnEsc=true]
 * @param {boolean} [config.closeOnOverlay=true]
 * @param {boolean} [config.acceptOnEnter=false]
 * @param {HTMLElement|null} [config.initialFocus=null]
 * @param {boolean|Function} [config.requiresWideViewport=false]
 */
export function registerModal({
  id,
  element,
  closeOnEsc = true,
  closeOnOverlay = true,
  acceptOnEnter = false,
  initialFocus = null,
  shortcut = null,
  toggleWithShortcut = false,
  onShortcut = null,
  requiresWideViewport = false
}) {
  if (!id || !element) {
    throw new Error('Modal must have id and element');
  }

  if (registry.has(id)) {
    console.warn(`Modal "${id}" already registered`);
    return;
  }

  element.dataset.modalId = id;
  element.hidden = true;
  element.classList.remove('is-open');
  element.tabIndex = -1;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');

  const heading = element.querySelector('h1, h2, h3');
  if (heading) {
    heading.id ||= `${id}-title`;
    element.setAttribute('aria-labelledby', heading.id);
  }

  if (closeOnOverlay) {
    const overlay = element.querySelector('.modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        const active = getActive();
        if (active?.id === id) {
          active.onCancel?.();
        }
      });
    }
  }

  registry.set(id, {
    id,
    element,
    closeOnEsc,
    closeOnOverlay,
    acceptOnEnter,
    initialFocus,
    shortcut,
    toggleWithShortcut,
    onShortcut,
    requiresWideViewport
  });
}

/**
 * Opens a registered modal.
 *
 * Pushes the modal onto the stack and manages focus.
 *
 * @param {string} id - Modal id
 * @param {Object} [options]
 * @param {Function} [options.onAccept]
 * @param {Function} [options.onCancel]
 * @param {HTMLElement|null} [options.initialFocus]
 * @param {boolean} [options.requiresWideViewport]
 */
export function openModal(id, {
  onAccept,
  onCancel,
  initialFocus,
  requiresWideViewport
} = {}) {
  const config = registry.get(id);
  if (!config) {
    console.error(`Modal "${id}" not registered`);
    return;
  }

  if (stack.some(modal => modal.id === id)) return;

  const previouslyFocused = document.activeElement;

  const activeModal = {
    ...config,
    previouslyFocused,
    parent: getActive(),
    suspended: false,
    requiresWideViewport: requiresWideViewport ?? config.requiresWideViewport,
    initialFocus: initialFocus || config.initialFocus
  };

  if (onAccept) activeModal.onAccept = onAccept;
  if (onCancel) activeModal.onCancel = onCancel;

  stack.push(activeModal);
  debug.info('Open modal', { modal: id, depth: stack.length });

  config.element.hidden = false;
  config.element.classList.add('is-open');
  syncModalStacking();
  syncModalViewport();
  syncPageAccessibility();

  const focusEl =
    activeModal.initialFocus
    || config.element.querySelector('[autofocus]')
    || config.element;

  focusModal(activeModal, focusEl);
}

/**
 * Closes the visible active modal, or a specific modal after an async action.
 *
 * Removes it from the stack and restores focus when the visible dialog closes.
 */
export function closeModal(id) {
  const modal = typeof id === 'string'
    ? stack.find(item => item.id === id)
    : getActive();
  if (!modal) return;
  const wasActive = modal === getActive();
  stack.splice(stack.indexOf(modal), 1);
  for (const child of stack) {
    if (child.parent === modal) child.parent = modal.parent;
  }
  debug.info('Close modal', { modal: modal.id, depth: stack.length });

  modal.element.classList.remove('is-open');
  modal.element.hidden = true;
  syncModalStacking();
  syncPageAccessibility();

  const nextModal = getActive();
  const focusTarget = nextModal?.initialFocus
    || nextModal?.element.querySelector('[autofocus]')
    || (modal.previouslyFocused?.isConnected ? modal.previouslyFocused : null)
    || nextModal?.element;

  if (wasActive) focusModal(nextModal, focusTarget);
}

function focusModal(modal, preferred) {
  requestAnimationFrame(() => {
    if (getActive() !== modal || modal?.suspended) return;
    const target = preferred?.isConnected && !preferred.closest('[hidden], [inert]')
      ? preferred
      : modal?.element || document.getElementById('bookmark-container');
    target?.focus({ preventScroll: true });
  });
}

function syncModalStacking() {
  for (const config of registry.values()) {
    config.element.style.removeProperty('--modal-stack-index');
  }

  stack.forEach((modal, index) => {
    modal.element.style.setProperty('--modal-stack-index', String(index));
  });
}

function trapFocus(event, modalElement) {
  const focusable = Array.from(modalElement.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(element => !element.hidden && !element.classList.contains('is-hidden'));

  if (!focusable.length) {
    event.preventDefault();
    modalElement.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function syncPageAccessibility() {
  const activeElement = getActive()?.element ?? null;

  for (const child of document.body.children) {
    if (child.matches('script, template')) continue;

    const shouldBeInert = Boolean(activeElement)
      && child !== activeElement
      && !child.contains(activeElement);

    if (shouldBeInert) {
      child.inert = true;
      child.setAttribute('aria-hidden', 'true');
      child.dataset.modalInert = 'true';
    } else if (child.dataset.modalInert === 'true') {
      child.inert = false;
      child.removeAttribute('aria-hidden');
      delete child.dataset.modalInert;
    }
  }
}
