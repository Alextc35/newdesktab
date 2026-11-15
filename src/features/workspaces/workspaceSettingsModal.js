import { normalizeWorkspaceName } from '../../domain/workspaces/workspaceModel.js';
import { inferWallpaperType, MAX_WALLPAPER_ITEMS, normalizeWallpaperInterval, normalizeWallpaperUrl } from '../../domain/settings/wallpaperMedia.js';
import { resolveWallpaperItem } from '../../shared/ui/pageTheme.js';
import { t } from '../../platform/i18n/i18n.js';
import { getState, requirePersistence } from '../../state/appStore.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { closeModal, openModal, registerModal } from '../../shared/ui/modalManager.js';
import { getWorkspaceById } from './workspaceSelectors.js';
import { updateWorkspace } from './workspaceActions.js';
import { createWallpaperFiles } from '../settings/wallpaperFiles.js';
import { createWallpaperLibrary } from '../settings/wallpaperLibrary.js';

const MODAL_ID = 'workspace-settings';
const MAX_NAME_LENGTH = 60;
let initialized = false;
let activeWorkspaceId = null;
let initialValue = null;
let draftValue = null;
let submitting = false;
let isUploading = false;
let modal;
let title;
let nameInput;
let nameError;
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
let library;
let localFiles;

export function initWorkspaceSettingsModal() {
  if (initialized) return;
  modal = requiredElement('workspace-settings-modal');
  title = requiredElement('workspace-settings-title');
  nameInput = requiredElement('workspace-settings-name');
  nameError = requiredElement('workspace-settings-name-error');
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

  registerModal({
    id: MODAL_ID, element: modal, closeOnEsc: true, closeOnOverlay: true,
    acceptOnEnter: true, initialFocus: nameInput
  });
  initialized = true;
}

export function openWorkspaceSettings(workspaceId) {
  if (!initialized) return;
  const workspace = getWorkspaceById(getState().data, workspaceId);
  if (!workspace) return;
  activeWorkspaceId = workspaceId;
  initialValue = structuredClone(workspace);
  draftValue = structuredClone(workspace);
  draftValue.backgroundMedia ??= [];
  submitting = false;
  title.textContent = t('workspace.settingsTitleFor', { name: workspace.name || t('workspace.main') });
  nameInput.value = workspace.name || t('workspace.main');
  nameInput.maxLength = MAX_NAME_LENGTH;
  urlInput.value = '';
  fileInput.value = '';
  intervalInput.value = String(normalizeWallpaperInterval(draftValue.backgroundRotationSeconds));
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
    backgroundMedia: draftValue.backgroundMedia,
    backgroundRotationSeconds: Number(intervalInput.value),
    backgroundImageUrl: null,
    backgroundImageLocal: null,
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: false
  };
}

function renderPreview(itemId) {
  const first = (draftValue?.backgroundMedia ?? []).find(item => item.id === itemId)
    ?? draftValue?.backgroundMedia?.[0];
  const source = first && resolveWallpaperItem(first);
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
  previewMessage.hidden = false;
  previewMessage.textContent = !first ? t('workspace.wallpaperPreview')
    : source?.url ? '' : t('settingsModal.theme.unavailableLocal');
  preview.classList.remove('has-wallpaper');
  preview.style.backgroundColor = first?.type === 'video' ? '#05070a'
    : first?.backgroundColor ?? getState().data.settings.theme.backgroundImageColor;

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
    backgroundMedia: initialValue.backgroundMedia ?? [],
    backgroundRotationSeconds: initialValue.backgroundRotationSeconds ?? 0,
    backgroundImageUrl: null,
    backgroundImageLocal: null,
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: false
  }));
}

function syncSaveButton() { saveButton.disabled = submitting || isUploading || !isDirty(); }

async function handleSave() {
  if (submitting || activeWorkspaceId === undefined || !validateDraft() || !isDirty()) return;
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
  activeWorkspaceId = null;
  initialValue = null;
  draftValue = null;
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
