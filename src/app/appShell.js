import { t } from '../platform/i18n/i18n.js';
import { getState, toggleEditing } from '../state/appStore.js';

import { resizeGridView } from '../features/grid/gridRenderer.js';
import { cancelGridGesture } from '../features/grid/gridPointerController.js';
import { ensurePanelFits, isListView } from '../shared/ui/viewportMode.js';

import { flash } from '../shared/ui/flash.js';

/** @type {HTMLElement|null} */
let containerRef = null;

/** @type {HTMLElement|null} */
let gridOverlayRef = null;

/** @type {HTMLElement|null} */
let toggleButtonRef = null;

/** @type {number|null} */
let resizeFrame = null;

/**
 * Initializes global UI controller behavior.
 * 
 * Responsibilities:
 * - Handles resize re-render logic
 * - Binds the global Edit toggle
 *
 * @param {Object} options
 * @param {HTMLElement} options.container - Bookmark container element
 * @param {HTMLElement} options.gridOverlay - Grid overlay element
 * @param {HTMLElement} options.toggleButton - Edit mode toggle button
 */
export function initAppShell({
  container,
  gridOverlay,
  toggleButton
}) {
  containerRef = container;
  gridOverlayRef = gridOverlay;
  toggleButtonRef = toggleButton;

  window.addEventListener('resize', handleResize);

  toggleButtonRef?.addEventListener('click', toggleEditMode);
}

/**
 * Updates visual UI state when edit mode changes.
 *
 * @param {boolean} isEditing - Whether edit mode is enabled
 */
export function updateAppShellEditing(isEditing) {
  if (!toggleButtonRef || !gridOverlayRef) return;

  const labelKey = isEditing ? 'launcher.editMode.exit' : 'launcher.editMode.enter';
  toggleButtonRef.dataset.i18nAriaLabel = labelKey;
  toggleButtonRef.setAttribute('aria-label', t(labelKey));
  toggleButtonRef.setAttribute('aria-pressed', String(isEditing));
  toggleButtonRef.classList.toggle('is-editing', isEditing);
  gridOverlayRef.style.display = isEditing ? 'block' : 'none';
}

/**
 * Toggles edit mode in the store and displays a feedback message.
 *
 * @returns {Promise<void>}
 */
async function toggleEditMode() {
  if (!getState().ui.isEditing && !ensurePanelFits()) return;
  const isEditing = await toggleEditing();

  if (isEditing) containerRef?.focus({ preventScroll: true });

  flash(
    isEditing
      ? t('flash.editMode.enabled')
      : t('flash.editMode.disabled'),
    'info',
    1000
  );
}

/**
 * Updates the view once per frame and cancels unfinished grid gestures.
 * List mode is read-only, including when entered from an editing session.
 */
function handleResize() {
  if (!containerRef) return;
  cancelGridGesture();

  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    if (isListView() && getState().ui.isEditing) {
      void toggleEditing();
      return;
    }
    resizeGridView(containerRef);
    containerRef.querySelector('.is-keyboard-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}
