import {
  createWorkspace,
  deleteWorkspace,
  setActiveWorkspace
} from './workspaceActions.js';
import {
  getActiveWorkspaceId,
  getAdjacentWorkspaceId,
  getWorkspaceById,
  getWorkspaceIds,
  getWorkspaceItemCounts,
  getWorkspaces
} from './workspaceSelectors.js';
import { getState, subscribe } from '../../state/appStore.js';
import { t } from '../../platform/i18n/i18n.js';
import { clearGridItemSelection } from '../grid/gridSelection.js';
import { showAlert, showPrompt } from '../../shared/ui/alertModal.js';
import { flashInfo, flashSuccess } from '../../shared/ui/flash.js';
import { hasOpenModal } from '../../shared/ui/modalManager.js';

const WORKSPACE_EXIT_DURATION = 120;
const WORKSPACE_ENTER_DURATION = 220;

/** @type {boolean} */
let isSwitchingWorkspace = false;

export function initWorkspaceToolbar() {
  const container = document.getElementById('bookmark-container');
  const select = document.getElementById('workspace-select');
  const selectButton = select.querySelector('button');
  const addButton = document.getElementById('workspace-add');
  const deleteButton = document.getElementById('workspace-delete');

  // Keep Space and type-ahead in the picker from triggering page shortcuts.
  select.addEventListener('keydown', event => event.stopPropagation());
  select.addEventListener('change', async () => {
    const targetId = select.value || null;
    const { data } = getState();
    const ids = getWorkspaceIds(data);
    const direction = ids.indexOf(targetId) < ids.indexOf(getActiveWorkspaceId(data))
      ? -1
      : 1;
    await switchWorkspace(container, targetId, direction);
  });
  addButton.addEventListener('click', async () => {
    const name = await showPrompt(t('workspace.prompt'), {
      placeholder: t('workspace.namePlaceholder')
    });
    if (name && createWorkspace(name)) {
      flashSuccess('flash.workspace.created');
    }
  });
  deleteButton.addEventListener('click', async () => {
    if (!select.value) return;
    const { data } = getState();
    const workspace = getWorkspaceById(data, select.value);
    if (!workspace) return;

    const { bookmarks: bookmarkCount, folders: folderCount } = getWorkspaceItemCounts(
      data,
      workspace.id
    );
    const confirmed = await showAlert(t('workspace.confirmDelete', {
      name: workspace.name,
      bookmarkCount,
      folderCount
    }), { type: 'confirm' });
    if (confirmed && deleteWorkspace(workspace.id)) {
      flashSuccess('flash.workspace.deleted');
    }
  });
  subscribe(state => {
    const workspaces = getWorkspaces(state.data);
    const selected = getActiveWorkspaceId(state.data) ?? '';
    select.replaceChildren(...(selectButton ? [selectButton] : []), new Option(t('workspace.main'), ''));
    for (const workspace of workspaces) select.add(new Option(workspace.name, workspace.id));
    select.value = selected;
    select.title = select.selectedOptions[0]?.textContent ?? '';
    deleteButton.disabled = !selected;
  });

  document.addEventListener('keydown', event => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (isSwitchingWorkspace || hasOpenModal() || isTypingTarget(event.target)) return;

    const direction = event.key === 'ArrowUp' ? -1 : 1;
    const { data } = getState();
    const targetId = getAdjacentWorkspaceId(data, direction);
    if (targetId === getActiveWorkspaceId(data)) return;

    event.preventDefault();
    void switchWorkspace(container, targetId, direction);
  });
}

/**
 * Changes workspace after animating the current grid out, then animates the
 * newly rendered grid in from the requested direction.
 *
 * @param {HTMLElement|null} container
 * @param {string|null} targetId
 * @param {-1|1|number} direction
 */
async function switchWorkspace(container, targetId, direction) {
  if (isSwitchingWorkspace) return false;
  if (getActiveWorkspaceId(getState().data) === targetId) return false;

  isSwitchingWorkspace = true;
  clearGridItemSelection();
  container?.classList.add('is-switching-workspace');

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const distance = direction < 0 ? 18 : -18;
  let exitAnimation = null;

  try {
    if (!reducedMotion && typeof container?.animate === 'function') {
      exitAnimation = container.animate([
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: `translateY(${distance}px) scale(.992)` }
      ], {
        duration: WORKSPACE_EXIT_DURATION,
        easing: 'cubic-bezier(.4, 0, 1, 1)',
        fill: 'forwards'
      });
      await exitAnimation.finished;
    }

    const changed = await setActiveWorkspace(targetId);
    exitAnimation?.cancel();
    exitAnimation = null;
    if (!changed) return false;

    const { data } = getState();
    const activeWorkspaceId = getActiveWorkspaceId(data);
    const activeWorkspaceName = getWorkspaceById(data, activeWorkspaceId)?.name
      ?? t('workspace.main');
    flashInfo(t('flash.workspace.switched', { name: activeWorkspaceName }));

    if (!reducedMotion && typeof container?.animate === 'function') {
      const enterAnimation = container.animate([
        { opacity: 0, transform: `translateY(${-distance}px) scale(.992)` },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], {
        duration: WORKSPACE_ENTER_DURATION,
        easing: 'cubic-bezier(.22, 1, .36, 1)'
      });
      await enterAnimation.finished;
    }
    return true;
  } catch (error) {
    if (error?.name !== 'AbortError') throw error;
    return false;
  } finally {
    exitAnimation?.cancel();
    container?.classList.remove('is-switching-workspace');
    isSwitchingWorkspace = false;
  }
}

/** @param {EventTarget|null} target */
function isTypingTarget(target) {
  return target instanceof HTMLElement && (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    || target.isContentEditable
  );
}
