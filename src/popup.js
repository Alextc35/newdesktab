import { getState, hydrateStore } from './state/appStore.js';
import { initI18n, t, applyI18n } from './platform/i18n/i18n.js';
import { applyInterfaceTheme } from './shared/ui/interfaceTheme.js';
import { getActiveWorkspaceId } from './features/workspaces/workspaceSelectors.js';
import { saveQuickBookmark } from './features/quick-save/quickSaveActions.js';
import {
  getQuickSaveFolders,
  getQuickSaveMatches,
  getQuickSaveWorkspaces,
  isSaveableTabUrl
} from './features/quick-save/quickSaveModel.js';

const form = document.getElementById('quick-save-form');
const nameInput = document.getElementById('quick-save-name');
const workspaceSelect = document.getElementById('quick-save-workspace');
const folderSelect = document.getElementById('quick-save-folder');
const submitButton = document.getElementById('quick-save-submit');
const status = document.getElementById('quick-save-status');
const title = document.getElementById('quick-save-tab-title');
const urlLabel = document.getElementById('quick-save-tab-url');
const favicon = document.getElementById('quick-save-favicon');
const matchBadge = document.getElementById('quick-save-match');
const matchDetail = document.getElementById('quick-save-match-detail');

let tabUrl = '';
let saving = false;
let allowDuplicate = false;

document.getElementById('quick-save-open').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/newtab.html') });
});
workspaceSelect.addEventListener('change', () => {
  renderFolders();
  renderMatch();
  resetWarning();
});
folderSelect.addEventListener('change', () => {
  renderMatch();
  resetWarning();
});
nameInput.addEventListener('input', () => {
  resetWarning();
  submitButton.disabled = !tabUrl || !nameInput.value.trim();
});
form.addEventListener('submit', handleSubmit);

void initialize();

async function initialize() {
  try {
    await hydrateStore();
    const { data } = getState();
    applyInterfaceTheme(data.settings.interfaceTheme);
    await initI18n(data.settings);
    applyI18n();
    renderWorkspaces(data);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !isSaveableTabUrl(tab.url)) {
      title.textContent = t('quickSave.unavailableTitle');
      setStatus('unavailable', 'error');
      return;
    }

    tabUrl = tab.url;
    title.textContent = tab.title || new URL(tabUrl).hostname;
    urlLabel.textContent = tabUrl;
    urlLabel.title = tabUrl;
    nameInput.value = (tab.title || new URL(tabUrl).hostname).slice(0, nameInput.maxLength);
    if (tab.favIconUrl && isSafeIconUrl(tab.favIconUrl)) favicon.src = tab.favIconUrl;
    favicon.addEventListener('error', () => {
      favicon.src = chrome.runtime.getURL('src/assets/icons/bookmark-light.svg');
    }, { once: true });
    renderMatch();
    nameInput.disabled = false;
    workspaceSelect.disabled = false;
    folderSelect.disabled = false;
    submitButton.disabled = !nameInput.value.trim();
    nameInput.focus();
  } catch (error) {
    console.error('[Quick Save] Initialization failed:', error);
    title.textContent = 'New DeskTab';
    setStatus('loadError', 'error');
  }
}

function isSafeIconUrl(value) {
  try {
    return ['http:', 'https:', 'data:', 'chrome-extension:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function renderWorkspaces(data) {
  workspaceSelect.replaceChildren(...getQuickSaveWorkspaces(data).map(workspace => {
    const option = document.createElement('option');
    option.value = workspace.id ?? '';
    option.textContent = workspace.id === null ? t('quickSave.mainWorkspace') : workspace.name;
    return option;
  }));
  workspaceSelect.value = getActiveWorkspaceId(data) ?? '';
  renderFolders();
}

function renderFolders() {
  const data = getState().data;
  const groupId = workspaceSelect.value || null;
  folderSelect.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t('quickSave.noFolder');
  folderSelect.append(none);
  for (const folder of getQuickSaveFolders(data, groupId)) {
    const option = document.createElement('option');
    option.value = folder.id;
    option.textContent = folder.name;
    folderSelect.append(option);
  }
}

function renderMatch() {
  const data = getState().data;
  const matches = tabUrl ? getQuickSaveMatches(data, tabUrl) : [];
  matchBadge.hidden = matches.length === 0;
  matchDetail.hidden = matches.length === 0;
  if (!matches.length) {
    matchDetail.textContent = '';
    return;
  }

  const selectedGroupId = workspaceSelect.value || null;
  const selectedFolderId = folderSelect.value || null;
  const match = matches.find(bookmark => (
    (bookmark.groupId ?? null) === selectedGroupId
    && (bookmark.folderId ?? null) === selectedFolderId
  )) ?? matches[0];
  const workspace = getQuickSaveWorkspaces(data).find(item => item.id === (match.groupId ?? null));
  const folder = data.folders.find(item => item.id === match.folderId);
  const location = [
    workspace?.id === null || !workspace ? t('quickSave.mainWorkspace') : workspace.name,
    folder?.name
  ].filter(Boolean).join(' › ');
  const others = matches.length - 1;
  matchDetail.textContent = t(others ? 'quickSave.savedInMore' : 'quickSave.savedIn', {
    location,
    count: others
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  if (saving || !tabUrl || !nameInput.value.trim()) return;
  saving = true;
  submitButton.disabled = true;
  setStatus('saving');
  try {
    const result = await saveQuickBookmark({
      name: nameInput.value,
      url: tabUrl,
      groupId: workspaceSelect.value || null,
      folderId: folderSelect.value || null,
      allowDuplicate
    });
    if (result.reason === 'duplicate') {
      allowDuplicate = true;
      setStatus('duplicate', 'warning');
      submitButton.textContent = t('quickSave.saveAnyway');
    } else if (result.reason) {
      setStatus(result.reason === 'no-space' ? 'noSpace' :
        result.reason === 'storage-error' ? 'saveError' : 'invalid', 'error');
    } else {
      setStatus('saved', 'success');
      submitButton.textContent = t('quickSave.savedButton');
      submitButton.disabled = true;
      window.close();
      return;
    }
  } catch (error) {
    console.error('[Quick Save] Save failed:', error);
    setStatus('saveError', 'error');
  } finally {
    saving = false;
    if (status.dataset.kind !== 'success') submitButton.disabled = false;
  }
}

function resetWarning() {
  allowDuplicate = false;
  submitButton.textContent = t('quickSave.save');
  setStatus('');
}

function setStatus(key, kind = '') {
  status.textContent = key ? t(`quickSave.${key}`) : '';
  status.dataset.kind = kind;
}
