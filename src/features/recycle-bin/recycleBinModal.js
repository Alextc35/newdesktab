import { getState, subscribe } from '../../state/appStore.js';
import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import {
  emptyRecycleBin,
  permanentlyDeleteTrashEntries,
  purgeExpiredRecycleBinEntries,
  restoreAllTrashEntries,
  restoreTrashEntries
} from './recycleBinActions.js';
import {
  RECYCLE_BIN_DAY_MS,
  normalizeRecycleBinRetentionDays
} from '../../domain/settings/recycleBinRetention.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { flashSuccess } from '../../shared/ui/flash.js';
import { runPersistedAction } from '../persistence/persistedAction.js';
import {
  closeModal,
  isModalActive,
  openModal,
  registerModal
} from '../../shared/ui/modalManager.js';
import {
  createEditIndicatorSvg,
  createRecycleBinSvg
} from '../../shared/ui/svgIcons.js';
import { createBookmarkListIcon } from '../bookmarks/bookmarkListItem.js';
import { createFolderVisual } from '../folders/folderVisual.js';
import { openRecycleBinEditor } from './recycleBinEditorModal.js';
import { applyRecycleBinAppearance } from './recycleBinAppearance.js';
import { debug } from '../../shared/diagnostics/debug.js';

const selectedIds = new Set();
let modal;
let list;
let empty;
let summary;
let selectedCount;
let restoreAllButton;
let deleteAllButton;
let restoreSelectedButton;
let deleteSelectedButton;
let dateFormatter;
let dateLocale;

export function initRecycleBinModal() {
  modal = document.getElementById('recycle-bin-modal');
  const customizeButton = document.getElementById('recycle-bin-modal-customize');
  customizeButton.replaceChildren(createRecycleBinSvg({ open: true }), createEditIndicatorSvg());
  list = document.getElementById('recycle-bin-list');
  empty = document.getElementById('recycle-bin-empty');
  summary = document.getElementById('recycle-bin-summary');
  selectedCount = document.getElementById('recycle-bin-selected-count');
  restoreAllButton = document.getElementById('recycle-bin-restore-all');
  deleteAllButton = document.getElementById('recycle-bin-delete-all');
  restoreSelectedButton = document.getElementById('recycle-bin-restore-selected');
  deleteSelectedButton = document.getElementById('recycle-bin-delete-selected');

  registerModal({
    id: 'recycle-bin',
    element: modal,
    requiresWideViewport: false,
    closeOnEsc: true,
    closeOnOverlay: true,
    acceptOnEnter: false
  });

  document.getElementById('recycle-bin-close').addEventListener('click', closeRecycleBin);
  customizeButton.addEventListener('click', openRecycleBinEditor);
  restoreAllButton.addEventListener('click', restoreAll);
  deleteAllButton.addEventListener('click', deleteAll);
  restoreSelectedButton.addEventListener('click', restoreSelected);
  deleteSelectedButton.addEventListener('click', deleteSelected);

  subscribe((state, previous) => {
    if (isModalActive('recycle-bin') && (!previous
      || state.data.trash !== previous.data.trash
      || state.data.recycleBin !== previous.data.recycleBin
      || state.data.settings.recycleBinRetentionDays !== previous.data.settings.recycleBinRetentionDays)) {
      renderRecycleBin();
    }
  });
  subscribeLanguageChange(() => {
    if (isModalActive('recycle-bin')) renderRecycleBin();
  });
}

export function openRecycleBinModal() {
  purgeExpiredRecycleBinEntries();
  selectedIds.clear();
  renderRecycleBin();
  openModal('recycle-bin', { onCancel: closeRecycleBin });
}

function closeRecycleBin() {
  selectedIds.clear();
  closeModal('recycle-bin');
}

function renderRecycleBin() {
  const trace = debug.start('Render recycle bin');
  const { trash, recycleBin, settings } = getState().data;
  const retentionDays = normalizeRecycleBinRetentionDays(settings.recycleBinRetentionDays);
  const customizeButton = document.getElementById('recycle-bin-modal-customize');
  applyRecycleBinAppearance(customizeButton, recycleBin);
  customizeButton.replaceChildren(createRecycleBinSvg({ open: true }), createEditIndicatorSvg());
  const availableIds = new Set(trash.map(entry => entry.id));
  for (const id of selectedIds) {
    if (!availableIds.has(id)) selectedIds.delete(id);
  }

  summary.textContent = t('recycleBin.summary', {
    count: trash.length,
    retention: getRetentionLabel(retentionDays)
  });
  selectedCount.textContent = t('recycleBin.selected', { count: selectedIds.size });
  empty.hidden = trash.length > 0;
  list.hidden = trash.length === 0;
  list.replaceChildren(...trash
    .slice()
    .sort((a, b) => b.deletedAt - a.deletedAt)
    .map(entry => createTrashRow(entry, retentionDays)));

  const hasItems = trash.length > 0;
  const hasSelection = selectedIds.size > 0;
  restoreAllButton.disabled = !hasItems;
  deleteAllButton.disabled = !hasItems;
  restoreSelectedButton.disabled = !hasSelection;
  deleteSelectedButton.disabled = !hasSelection;
  trace.end({ entries: trash.length });
}

function createTrashRow(entry, retentionDays) {
  const row = document.createElement('label');
  row.className = 'recycle-bin-item';
  row.dataset.trashId = entry.id;
  row.setAttribute('role', 'listitem');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selectedIds.has(entry.id);
  checkbox.setAttribute('aria-label', t('recycleBin.select', { name: entryName(entry) }));
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedIds.add(entry.id);
    else selectedIds.delete(entry.id);
    syncSelectionActions();
  });

  const icon = entry.type === 'folder'
    ? createFolderThumbnail(entry.folder)
    : createBookmarkListIcon(entry.bookmark);
  icon.classList.add('recycle-bin-item-icon');
  icon.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('span');
  copy.className = 'recycle-bin-item-copy';
  const title = document.createElement('strong');
  title.textContent = entryName(entry);
  const detail = document.createElement('small');
  detail.textContent = entry.type === 'folder'
    ? `${formatDeletedAt(entry.deletedAt)} · ${t('recycleBin.folderContents', { count: entry.bookmarks.length })}`
    : formatDeletedAt(entry.deletedAt);
  copy.append(title, detail);

  const expiry = document.createElement('span');
  expiry.className = 'recycle-bin-item-expiry';
  expiry.textContent = retentionDays === 0
    ? t('recycleBin.neverExpires')
    : formatExpiry(remainingDays(entry.deletedAt, retentionDays));
  row.append(checkbox, icon, copy, expiry);
  return row;
}

function createFolderThumbnail(folder) {
  const icon = document.createElement('span');
  icon.className = 'bookmark-list-icon is-folder-icon';
  icon.style.setProperty('--folder-color', folder.backgroundColor || '#38bdf8');
  if (folder.outerBackgroundColor) icon.style.backgroundColor = folder.outerBackgroundColor;
  else if (folder.noOuterBackground) icon.style.backgroundColor = 'transparent';
  icon.append(createFolderVisual(folder, [], { compact: true }));
  return icon;
}

function syncSelectionActions() {
  selectedCount.textContent = t('recycleBin.selected', { count: selectedIds.size });
  restoreSelectedButton.disabled = selectedIds.size === 0;
  deleteSelectedButton.disabled = selectedIds.size === 0;
}

function entryName(entry) {
  return entry.type === 'folder' ? entry.folder.name : entry.bookmark.name;
}

function formatDeletedAt(timestamp) {
  const locale = document.documentElement.lang || undefined;
  if (!dateFormatter || dateLocale !== locale) {
    dateLocale = locale;
    dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }
  return t('recycleBin.deletedAt', {
    date: dateFormatter.format(new Date(timestamp))
  });
}

function getRetentionLabel(days) {
  const option = {
    0: 'never',
    1: 'oneDay',
    7: 'sevenDays',
    14: 'fourteenDays',
    28: 'twentyEightDays'
  }[days];
  return t(`settingsModal.general.recycleBin.retentionOptions.${option}`);
}

function remainingDays(deletedAt, retentionDays) {
  const remaining = retentionDays * RECYCLE_BIN_DAY_MS - (Date.now() - deletedAt);
  return Math.max(0, Math.ceil(remaining / RECYCLE_BIN_DAY_MS));
}

function formatExpiry(days) {
  return days === 1
    ? t('recycleBin.expiresInOne')
    : t('recycleBin.expiresIn', { days });
}

async function restoreAll() {
  await runPersistedAction('trash-restore-all', restoreAllTrashEntries, result => {
    selectedIds.clear();
    showRestoreResult(result);
  });
}

async function restoreSelected() {
  const ids = new Set(selectedIds);
  await runPersistedAction('trash-restore-selected', () => restoreTrashEntries(ids), result => {
    selectedIds.clear();
    showRestoreResult(result);
  });
}

function showRestoreResult(result) {
  if (result.restored) flashSuccess('flash.recycleBin.restored');
  if (result.skipped) {
    void showAlert(t('alert.recycleBin.noSpace', { count: result.skipped }), { type: 'info' });
  }
  renderRecycleBin();
}

async function deleteAll() {
  const confirmed = await showAlert(t('alert.recycleBin.empty'), { type: 'confirm' });
  if (!confirmed) return;
  await runPersistedAction('trash-empty', emptyRecycleBin, () => {
    selectedIds.clear();
    flashSuccess('flash.recycleBin.deletedPermanently');
    renderRecycleBin();
  });
}

async function deleteSelected() {
  const confirmed = await showAlert(t('alert.recycleBin.deleteSelected', {
    count: selectedIds.size
  }), { type: 'confirm' });
  if (!confirmed) return;
  const ids = new Set(selectedIds);
  await runPersistedAction('trash-delete-selected', () => permanentlyDeleteTrashEntries(ids), () => {
    selectedIds.clear();
    flashSuccess('flash.recycleBin.deletedPermanently');
    renderRecycleBin();
  });
}
