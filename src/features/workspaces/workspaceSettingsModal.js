import { normalizeWorkspaceName } from '../../domain/workspaces/workspaceModel.js';
import { inferWallpaperType, MAX_WALLPAPER_ITEMS, normalizeWallpaperInterval, normalizeWallpaperUrl } from '../../domain/settings/wallpaperMedia.js';
import { resolveWallpaperItem } from '../../shared/ui/pageTheme.js';
import { t } from '../../platform/i18n/i18n.js';
import { getState, requirePersistence } from '../../state/appStore.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { closeModal, openModal, registerModal } from '../../shared/ui/modalManager.js';
import { getWorkspaceById, getWorkspaceItemCounts } from './workspaceSelectors.js';
import { deleteWorkspace, updateWorkspace } from './workspaceActions.js';
import { runPersistedAction } from '../persistence/persistedAction.js';
import { createWallpaperFiles } from '../settings/wallpaperFiles.js';
import { createWallpaperLibrary } from '../settings/wallpaperLibrary.js';
import { toggleCustomColorPicker } from '../../shared/ui/colorPicker.js';
import { ensurePanelFits } from '../../shared/ui/viewportMode.js';

const MODAL_ID = 'workspace-settings';
const MAX_NAME_LENGTH = 60;
let initialized = false;
let activeWorkspaceId = null;
let initialValue = null;
let draftValue = null;
let submitting = false;
let deletionPending = false;
let isUploading = false;
let solidColorPickerOpen = false;
let modal;
let title;
let nameInput;
let nameError;
let useGlobalThemeInput;
let themeControls;
let solidBackgroundInput;
let solidColorInput;
let wallpaperControls;
let urlInput;
let urlError;
let fileInput;
let mediaList;
let intervalInput;
let cancelButton;
let preview;
let previewImage;
let previewVideo;
let previewMessage;
let saveButton;
let deleteButton;
let library;
let localFiles;

export function initWorkspaceSettingsModal() {
  if (initialized) return;
  modal = requiredElement('workspace-settings-modal');
  title = requiredElement('workspace-settings-title');
  nameInput = requiredElement('workspace-settings-name');
  nameError = requiredElement('workspace-settings-name-error');
  useGlobalThemeInput = requiredElement('workspace-settings-use-global-theme');
  themeControls = requiredElement('workspace-settings-theme-controls');
  solidBackgroundInput = requiredElement('workspace-settings-solid-background');
  solidColorInput = requiredElement('workspace-settings-solid-color');
  solidColorInput.hidden = true;
  wallpaperControls = requiredElement('workspace-settings-wallpaper-controls');
  urlInput = requiredElement('workspace-settings-wallpaper-url');
  urlError = requiredElement('workspace-settings-url-error');
  fileInput = requiredElement('workspace-settings-file');
  mediaList = requiredElement('workspace-settings-media-list');
  intervalInput = requiredElement('workspace-settings-media-interval');
  cancelButton = requiredElement('workspace-settings-cancel');
  preview = requiredElement('workspace-wallpaper-preview');
  previewImage = requiredElement('workspace-wallpaper-preview-image');
  previewVideo = requiredElement('workspace-wallpaper-preview-video');
  previewMessage = requiredElement('workspace-wallpaper-preview-message');
  saveButton = requiredElement('workspace-settings-save');
  deleteButton = requiredElement('workspace-settings-delete');
  localFiles = createWallpaperFiles({
    getRetainedTheme: () => getWorkspaceById(getState().data, activeWorkspaceId)
  });
  library = createWallpaperLibrary({
    mediaList,
    getTheme: () => ({ ...draftValue, backgroundImageColor: getState().data.settings.theme.backgroundImageColor }),
    setMedia: entries => {
      draftValue.backgroundMedia = entries;
      library.render();
      renderPreview();
      syncSaveButton();
    },
    onPreview: item => renderPreview(item.id),
    onPreviewEnd: () => renderPreview(),
    resetPreviewIndex: () => {}
  });

  nameInput.addEventListener('input', () => {
    clearError(nameInput, nameError);
    syncSaveButton();
  });
  useGlobalThemeInput.addEventListener('change', () => {
    draftValue.themeEnabled = !useGlobalThemeInput.checked;
    syncThemeControls();
    renderPreview();
    syncSaveButton();
  });
  solidBackgroundInput.addEventListener('change', () => {
    draftValue.backgroundSolid = solidBackgroundInput.checked;
    syncThemeControls();
    renderPreview();
    syncSaveButton();
  });
  solidColorInput.addEventListener('input', () => {
    draftValue.backgroundColor = solidColorInput.value;
    renderPreview();
    syncSaveButton();
  });
  preview.addEventListener('click', openSolidColorPicker);
  preview.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key) || !draftValue?.themeEnabled
      || !draftValue.backgroundSolid) return;
    event.preventDefault();
    openSolidColorPicker();
  });
  urlInput.addEventListener('input', () => {
    clearError(urlInput, urlError);
    syncSaveButton();
  });
  urlInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addWallpaperUrl();
  });
  requiredElement('workspace-settings-media-add').addEventListener('click', addWallpaperUrl);
  requiredElement('workspace-settings-upload').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelection);
  intervalInput.addEventListener('change', () => {
    draftValue.backgroundRotationSeconds = normalizeWallpaperInterval(Number(intervalInput.value));
    syncSaveButton();
  });
  cancelButton.addEventListener('click', () => { void handleCancel(); });
  saveButton.addEventListener('click', () => { void handleSave(); });
  deleteButton.addEventListener('click', () => { void handleDelete(); });

  registerModal({
    id: MODAL_ID, element: modal, closeOnEsc: true, closeOnOverlay: true,
    acceptOnEnter: true, initialFocus: nameInput, requiresWideViewport: true
  });
  initialized = true;
}

export function openWorkspaceSettings(workspaceId) {
  if (!initialized || !ensurePanelFits()) return;
  const workspace = getWorkspaceById(getState().data, workspaceId);
  if (!workspace) return;
  activeWorkspaceId = workspaceId;
  initialValue = structuredClone(workspace);
  draftValue = structuredClone(workspace);
  draftValue.backgroundMedia ??= [];
  draftValue.themeEnabled ??= Boolean(draftValue.backgroundMedia.length
    || draftValue.backgroundImageUrl || draftValue.backgroundImageLocal || draftValue.backgroundSolid);
  draftValue.backgroundSolid ??= false;
  draftValue.backgroundColor ??= '#101827';
  submitting = false;
  deletionPending = false;
  deleteButton.hidden = workspaceId === null;
  title.textContent = t('workspace.settingsTitleFor', { name: workspace.name || t('workspace.main') });
  nameInput.value = workspace.name || t('workspace.main');
  nameInput.maxLength = MAX_NAME_LENGTH;
  useGlobalThemeInput.checked = !draftValue.themeEnabled;
  solidBackgroundInput.checked = draftValue.backgroundSolid;
  solidColorInput.value = draftValue.backgroundColor;
  urlInput.value = '';
  fileInput.value = '';
  intervalInput.value = String(normalizeWallpaperInterval(draftValue.backgroundRotationSeconds));
  syncThemeControls();
  clearAllErrors();
  library.render();
  renderPreview();
  syncSaveButton();
  openModal(MODAL_ID, { onAccept: handleSave, onCancel: handleCancel, initialFocus: nameInput });
}

function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Workspace settings cannot initialize: missing #${id}`);
  return element;
}

function addWallpaperUrl() {
  const type = inferWallpaperType(urlInput.value.trim());
  const url = normalizeWallpaperUrl(urlInput.value.trim(), type);
  if (!url) {
    showError(urlInput, urlError, t('workspace.invalidWallpaperUrl'));
    return;
  }
  if (draftValue.backgroundMedia.length >= MAX_WALLPAPER_ITEMS) {
    flashError('flash.settings.wallpaperLimit');
    return;
  }
  const item = type === 'video'
    ? { id: crypto.randomUUID(), type, url, local: null, source: 'url' }
    : { id: crypto.randomUUID(), type, backgroundImageUrl: url,
      backgroundImageLocal: null, backgroundImageSource: 'url' };
  draftValue.backgroundMedia = [...draftValue.backgroundMedia, item];
  urlInput.value = '';
  clearError(urlInput, urlError);
  library.render();
  renderPreview();
  syncSaveButton();
}

async function handleFileSelection() {
  const files = [...(fileInput.files ?? [])];
  fileInput.value = '';
  if (!files.length || submitting || isUploading) return;
  if (draftValue.backgroundMedia.length + files.length > MAX_WALLPAPER_ITEMS) {
    flashError('flash.settings.wallpaperLimit');
    return;
  }
  isUploading = true;
  requiredElement('workspace-settings-upload').disabled = true;
  cancelButton.disabled = true;
  syncSaveButton();
  const created = [];
  try {
    for (const file of files) created.push(await localFiles.save(file));
    const entries = created.map(({ type, reference }) => type === 'video'
      ? { id: crypto.randomUUID(), type, url: null, local: reference, source: 'local' }
      : { id: crypto.randomUUID(), type, backgroundImageUrl: null,
        backgroundImageLocal: reference, backgroundImageSource: 'local' });
    draftValue.backgroundMedia = [...draftValue.backgroundMedia, ...entries];
    localFiles.retain(created);
    created.length = 0;
    library.render();
    renderPreview();
  } catch (error) {
    console.error('[WORKSPACE] Could not upload wallpapers:', error);
    flashError(uploadErrorKey(error));
  } finally {
    await localFiles.discardCreated(created);
    isUploading = false;
    requiredElement('workspace-settings-upload').disabled = false;
    cancelButton.disabled = false;
    syncSaveButton();
  }
}

function getDraft() {
  return {
    name: normalizeWorkspaceName(nameInput.value),
    themeEnabled: draftValue.themeEnabled,
    backgroundSolid: draftValue.backgroundSolid,
    backgroundColor: draftValue.backgroundColor,
    backgroundMedia: draftValue.backgroundMedia,
    backgroundRotationSeconds: Number(intervalInput.value),
    backgroundImageUrl: null,
    backgroundImageLocal: null,
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: false
  };
}

function renderPreview(itemId) {
  const globalTheme = getState().data.settings.theme;
  const usingGlobalTheme = !draftValue?.themeEnabled;
  const hasWorkspaceWallpaper = Boolean(draftValue?.backgroundMedia?.length
    || draftValue?.backgroundImageUrl || draftValue?.backgroundImageLocal);
  const usingDefaultTheme = usingGlobalTheme
    ? globalTheme.backgroundDefault
    : !draftValue?.backgroundSolid && !hasWorkspaceWallpaper;
  if (usingDefaultTheme) {
    clearPreviewMedia();
    preview.style.backgroundColor = '';
    preview.style.removeProperty('background-image');
    previewMessage.hidden = true;
    preview.classList.add('is-default-bg');
    preview.classList.remove('has-wallpaper', 'is-solid-color-trigger');
    preview.removeAttribute('role');
    preview.removeAttribute('tabindex');
    preview.removeAttribute('aria-label');
    preview.removeAttribute('aria-haspopup');
    return;
  }
  const themeIsSolid = usingGlobalTheme ? globalTheme.backgroundSolid : draftValue?.backgroundSolid;
  if (themeIsSolid) {
    clearPreviewMedia();
    preview.classList.remove('is-default-bg');
    preview.style.backgroundImage = 'none';
    preview.style.backgroundColor = usingGlobalTheme
      ? globalTheme.backgroundColor : draftValue.backgroundColor;
    previewMessage.hidden = usingGlobalTheme || solidColorPickerOpen;
    if (!usingGlobalTheme) {
      previewMessage.textContent = t('settingsModal.theme.editSolidColor');
    }
    preview.classList.add('has-wallpaper');
    preview.classList.toggle('is-solid-color-trigger', !usingGlobalTheme);
    if (usingGlobalTheme) {
      preview.removeAttribute('role');
      preview.removeAttribute('tabindex');
      preview.removeAttribute('aria-label');
      preview.removeAttribute('aria-haspopup');
    } else {
      preview.setAttribute('role', 'button');
      preview.setAttribute('tabindex', '0');
      preview.setAttribute('aria-haspopup', 'dialog');
      preview.setAttribute('aria-label',
        `${t('settingsModal.theme.editSolidColor')}: ${solidColorInput.value.toUpperCase()}`);
    }
    return;
  }
  preview.classList.remove('is-solid-color-trigger');
  preview.classList.remove('is-default-bg');
  preview.style.removeProperty('background-image');
  preview.removeAttribute('role');
  preview.removeAttribute('tabindex');
  preview.removeAttribute('aria-label');
  preview.removeAttribute('aria-haspopup');
  let first;
  if (usingGlobalTheme) {
    first = globalTheme.backgroundMedia?.[0] ?? (globalTheme.backgroundImageUrl
      ? { id: 'global-primary', type: globalTheme.backgroundPrimaryType === 'video' ? 'video' : 'image',
        url: globalTheme.backgroundVideo?.url,
        backgroundImageUrl: globalTheme.backgroundImageUrl,
        backgroundImageLocal: globalTheme.backgroundImageLocal,
        backgroundImageSource: globalTheme.backgroundImageSource,
        local: globalTheme.backgroundVideo?.local,
        source: globalTheme.backgroundVideo?.source }
      : null);
  } else {
    first = (draftValue?.backgroundMedia ?? []).find(item => item.id === itemId)
      ?? draftValue?.backgroundMedia?.[0];
  }
  const source = first && resolveWallpaperItem(first);
  clearPreviewMedia();
  previewMessage.hidden = false;
  previewMessage.textContent = usingGlobalTheme && globalTheme.backgroundDefault
    ? t('workspace.globalThemePreview')
    : !first ? t('workspace.wallpaperPreview')
    : source?.url ? '' : t('settingsModal.theme.unavailableLocal');
  preview.classList.remove('has-wallpaper');
  preview.style.backgroundColor = first?.type === 'video' ? '#05070a'
    : first?.backgroundColor ?? globalTheme.backgroundImageColor;

  if (!source?.url) return;
  if (source.type === 'video') {
    previewVideo.hidden = false;
    previewVideo.onloadeddata = () => {
      preview.classList.add('has-wallpaper');
      previewMessage.hidden = true;
    };
    previewVideo.onerror = () => {
      previewVideo.hidden = true;
      previewMessage.textContent = t('settingsModal.theme.unavailableLocal');
      previewMessage.hidden = false;
    };
    previewVideo.src = source.url;
    void previewVideo.play().catch(() => {});
    return;
  }
  previewImage.hidden = false;
  previewImage.onload = () => {
    preview.classList.add('has-wallpaper');
    previewMessage.hidden = true;
  };
  previewImage.onerror = () => {
    previewImage.hidden = true;
    previewMessage.textContent = t('settingsModal.theme.unavailableLocal');
    previewMessage.hidden = false;
  };
  previewImage.src = source.url;
}

function clearPreviewMedia() {
  previewImage.onload = null;
  previewImage.onerror = null;
  previewVideo.onloadeddata = null;
  previewVideo.onerror = null;
  previewVideo.pause();
  previewVideo.removeAttribute('src');
  previewVideo.load();
  previewImage.removeAttribute('src');
  previewImage.hidden = true;
  previewVideo.hidden = true;
}

function syncThemeControls() {
  const enabled = Boolean(draftValue?.themeEnabled);
  const solid = Boolean(draftValue?.backgroundSolid);
  themeControls.hidden = !enabled;
  wallpaperControls.hidden = !enabled || solid;
}

function openSolidColorPicker() {
  if (!draftValue?.themeEnabled || !draftValue.backgroundSolid) return;
  toggleCustomColorPicker(solidColorInput, {
    anchor: preview,
    returnFocusTo: preview,
    onOpen: () => {
      solidColorPickerOpen = true;
      previewMessage.hidden = true;
    },
    onClose: () => {
      solidColorPickerOpen = false;
      previewMessage.hidden = !draftValue?.themeEnabled || !draftValue.backgroundSolid;
    }
  });
}

function validateDraft() {
  clearAllErrors();
  const name = nameInput.value.trim();
  if (!name || name.length > MAX_NAME_LENGTH) {
    showError(nameInput, nameError, t('workspace.invalidName'));
    return false;
  }
  return true;
}

function isDirty() {
  return Boolean(initialValue && JSON.stringify(getDraft()) !== JSON.stringify({
    name: initialValue.name || t('workspace.main'),
    themeEnabled: initialValue.themeEnabled ?? Boolean(initialValue.backgroundMedia?.length
      || initialValue.backgroundImageUrl || initialValue.backgroundImageLocal || initialValue.backgroundSolid),
    backgroundSolid: initialValue.backgroundSolid ?? false,
    backgroundColor: initialValue.backgroundColor ?? '#101827',
    backgroundMedia: initialValue.backgroundMedia ?? [],
    backgroundRotationSeconds: initialValue.backgroundRotationSeconds ?? 0,
    backgroundImageUrl: null,
    backgroundImageLocal: null,
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: false
  }));
}

function syncSaveButton() {
  const busy = submitting || isUploading;
  saveButton.disabled = busy || deletionPending || !isDirty();
  deleteButton.disabled = busy;
  cancelButton.disabled = busy;
}

async function handleSave() {
  if (!ensurePanelFits()) return;
  if (submitting || isUploading || deletionPending || activeWorkspaceId === undefined
    || !validateDraft() || !isDirty()) return;
  submitting = true;
  syncSaveButton();
  try {
    const updated = updateWorkspace(activeWorkspaceId, getDraft());
    if (!updated) throw new Error('Workspace update failed.');
    await requirePersistence();
    await localFiles.cleanupLocalMedia(initialValue, updated);
    flashSuccess('workspace.settingsSaved');
    closeEditor();
  } catch {
    flashError('settingsModal.sync.status.error');
  } finally {
    submitting = false;
    syncSaveButton();
  }
}

async function handleDelete() {
  if (!ensurePanelFits() || submitting || isUploading || activeWorkspaceId === null) return;
  const workspaceId = activeWorkspaceId;
  const editorDraft = draftValue;
  submitting = true;
  syncSaveButton();
  try {
    if (!deletionPending) {
      const { data } = getState();
      const workspace = getWorkspaceById(data, workspaceId);
      if (!workspace) return;
      const { bookmarks: bookmarkCount, folders: folderCount } = getWorkspaceItemCounts(data, workspaceId);
      const confirmed = await showAlert(t('workspace.confirmDelete', {
        name: workspace.name, bookmarkCount, folderCount
      }), { type: 'confirm', requiresWideViewport: true });
      if (!confirmed || !ensurePanelFits()) return;
      deletionPending = true;
    }
    let completion;
    await runPersistedAction(`workspace-delete:${workspaceId}`, () => {
      if (!deleteWorkspace(workspaceId)) throw new Error('Workspace deletion failed.');
      return true;
    }, () => { completion = finishDeletion(editorDraft); });
    await completion;
  } finally {
    if (draftValue === editorDraft) {
      submitting = false;
      syncSaveButton();
    }
  }
}

async function finishDeletion(editorDraft) {
  flashSuccess('flash.workspace.deleted');
  // A durable retry may finish after this editor was cancelled or reopened.
  if (draftValue !== editorDraft) return;
  submitting = true;
  syncSaveButton();
  try {
    await localFiles.discardUploadedMedia();
  } catch (error) {
    console.error('[WORKSPACE] Could not discard deleted workspace draft media:', error);
  } finally {
    if (draftValue === editorDraft) {
      closeEditor();
      submitting = false;
      syncSaveButton();
    }
  }
}

async function handleCancel() {
  if (submitting || isUploading) return;
  if (isDirty()) {
    const confirmed = await showAlert(t('workspace.discardSettings'), { type: 'confirm' });
    if (!confirmed) return;
  }
  await localFiles.discardUploadedMedia();
  closeEditor();
}

function closeEditor() {
  closeModal(MODAL_ID);
  solidColorPickerOpen = false;
  activeWorkspaceId = null;
  initialValue = null;
  draftValue = null;
  deletionPending = false;
  fileInput.value = '';
}

function clearError(input, error) {
  input.removeAttribute('aria-invalid');
  error.textContent = '';
  error.classList.add('is-hidden');
}
function clearAllErrors() { clearError(nameInput, nameError); clearError(urlInput, urlError); }
function showError(input, error, message) {
  input.setAttribute('aria-invalid', 'true');
  error.textContent = message;
  error.classList.remove('is-hidden');
  input.focus();
}
function uploadErrorKey(error) {
  switch (error?.code) {
    case 'LOCAL_IMAGE_INVALID': case 'LOCAL_VIDEO_INVALID': return 'flash.localImage.invalid';
    case 'LOCAL_IMAGE_TOO_LARGE': case 'LOCAL_VIDEO_TOO_LARGE': return 'flash.localImage.tooLarge';
    case 'LOCAL_IMAGE_STORAGEFULL': case 'LOCAL_VIDEO_STORAGEFULL': return 'flash.localImage.storageFull';
    default: return 'flash.localImage.processing';
  }
}
