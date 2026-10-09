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
import { runPersistedAction } from '../persistence/persistedAction.js';
import { hasOpenModal } from '../../shared/ui/modalManager.js';

const WORKSPACE_EXIT_DURATION = 120;
const WORKSPACE_ENTER_DURATION = 220;

/** @type {boolean} */
let isSwitchingWorkspace = false;

export function initWorkspaceToolbar() {
  const container = document.getElementById('bookmark-container');
  const toolbar = document.getElementById('workspace-toolbar');
  const select = document.getElementById('workspace-select');
  const toggle = document.getElementById('workspace-toggle');
  const currentName = document.getElementById('workspace-current-name');
  const options = document.getElementById('workspace-options');
  const addButton = document.getElementById('workspace-add');
  const deleteButton = document.getElementById('workspace-delete');

  options.hidden = false;
  setWorkspaceOptionsOpen(false);

  toggle.addEventListener('click', () => {
    setWorkspaceOptionsOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });
  toggle.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    setWorkspaceOptionsOpen(true);
    const buttons = getWorkspaceOptionButtons();
    const activeIndex = buttons.findIndex(button => button.getAttribute('aria-current') === 'true');
    const fallbackIndex = event.key === 'ArrowDown' ? 0 : buttons.length - 1;
    buttons[activeIndex < 0 ? fallbackIndex : activeIndex]?.focus();
  });
  options.addEventListener('click', event => {
    const button = event.target.closest('[data-workspace-id]');
    if (!button) return;
    const targetId = button.dataset.workspaceId || null;
    setWorkspaceOptionsOpen(false);
    toggle.focus();
    void switchToWorkspace(targetId);
  });
  options.addEventListener('keydown', event => {
    const buttons = getWorkspaceOptionButtons();
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setWorkspaceOptionsOpen(false);
      toggle.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  });

  select.addEventListener('change', async () => {
    setWorkspaceOptionsOpen(false);
    await switchToWorkspace(select.value || null);
  });
  addButton.addEventListener('click', async () => {
    setWorkspaceOptionsOpen(false);
    const name = await showPrompt(t('workspace.prompt'), {
      placeholder: t('workspace.namePlaceholder')
    });
    if (name) await runPersistedAction('workspace-create', () => createWorkspace(name), created => {
      if (created) flashSuccess('flash.workspace.created');
    });
  });
  deleteButton.addEventListener('click', async () => {
    setWorkspaceOptionsOpen(false);
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
    if (confirmed) await runPersistedAction(`workspace-delete:${workspace.id}`,
      () => deleteWorkspace(workspace.id), deleted => {
        if (deleted) flashSuccess('flash.workspace.deleted');
      });
  });
  subscribe(state => {
    const workspaces = getWorkspaces(state.data);
    const selected = getActiveWorkspaceId(state.data) ?? '';
    const workspaceChoices = [
      { id: '', name: t('workspace.main') },
      ...workspaces.map(workspace => ({ id: workspace.id, name: workspace.name }))
    ];
    select.replaceChildren(new Option(t('workspace.main'), ''));
    for (const workspace of workspaces) select.add(new Option(workspace.name, workspace.id));
    select.value = selected;
    select.title = select.selectedOptions[0]?.textContent ?? '';
    currentName.textContent = select.title;
    toggle.title = select.title;
    options.replaceChildren(...workspaceChoices.map(choice => createWorkspaceOption(
      choice,
      choice.id === selected
    )));
    deleteButton.disabled = !selected;
  });

  toolbar.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button === toggle || button.closest('#workspace-options')) return;
    setWorkspaceOptionsOpen(false);
  }, true);
  document.addEventListener('pointerdown', event => {
    if (!toolbar.contains(event.target)) setWorkspaceOptionsOpen(false);
  });
  document.addEventListener('focusin', event => {
    if (!toolbar.contains(event.target)) setWorkspaceOptionsOpen(false);
  });

  function setWorkspaceOptionsOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    options.toggleAttribute('inert', !open);
    options.setAttribute('aria-hidden', String(!open));
  }

  function getWorkspaceOptionButtons() {
    return [...options.querySelectorAll('[data-workspace-id]')];
  }

  async function switchToWorkspace(targetId) {
    const { data } = getState();
    const ids = getWorkspaceIds(data);
    const direction = ids.indexOf(targetId) < ids.indexOf(getActiveWorkspaceId(data))
      ? -1
      : 1;
    await switchWorkspace(container, targetId, direction);
  }

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

function createWorkspaceOption({ id, name }, active) {
  const item = document.createElement('div');
  item.setAttribute('role', 'listitem');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.workspaceId = id;
  button.className = 'workspace-option';
  button.setAttribute('aria-current', String(active));

  const label = document.createElement('span');
  label.className = 'workspace-option-name';
  label.textContent = name;
  const check = document.createElement('span');
  check.className = 'workspace-option-check';
  check.setAttribute('aria-hidden', 'true');
  check.textContent = '✓';
  button.append(label, check);
  item.append(button);
  return item;
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
