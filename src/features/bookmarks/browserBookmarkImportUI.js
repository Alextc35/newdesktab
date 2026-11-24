import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { closeModal, openModal, registerModal } from '../../shared/ui/modalManager.js';
import {
  detectChromeBookmarks,
  importBrowserBookmarkTree
} from './browserBookmarkImport.js';
import { parseBrowserBookmarksHtml } from '../../domain/bookmarks/browserBookmarkImport.js';
import { DEFAULT_FOLDER_STYLE } from '../../domain/folders/folderDefaults.js';
import { createFolderVisual } from '../folders/folderVisual.js';
import { createFavicon } from './bookmarkFavicon.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { flashInfo, flashSuccess } from '../../shared/ui/flash.js';
import {
  createBrowserBookmarkSelection, filterSelectedBrowserBookmarks,
  getBrowserBookmarkSelectionState, getSelectedBrowserBookmarkCounts,
  setAllBrowserBookmarksSelected, setBrowserBookmarkSelected
} from '../../domain/bookmarks/browserBookmarkSelection.js';

const PREVIEW_PAGE_SIZE = 100;

let controller;

/** Shared import dialog for the first welcome and the bookmark settings. */
function getController() {
  if (controller) return controller;
  const modal = document.getElementById('browser-bookmark-import-modal');
  const description = document.getElementById('browser-bookmark-import-description');
  const details = document.getElementById('browser-bookmark-import-details');
  const status = document.getElementById('browser-bookmark-import-status');
  const confirm = document.getElementById('browser-bookmark-import-confirm');
  const cancel = document.getElementById('browser-bookmark-import-cancel');
  const preview = document.getElementById('browser-bookmark-import-preview');
  const selectionPanel = document.getElementById('browser-bookmark-import-selection');
  const selectionTree = document.getElementById('browser-bookmark-import-tree');
  const selectionSearch = document.getElementById('browser-bookmark-import-search');
  const selectedCount = document.getElementById('browser-bookmark-import-selected-count');
  const selectAll = document.getElementById('browser-bookmark-import-select-all');
  const selectNone = document.getElementById('browser-bookmark-import-select-none');
  const showMore = document.getElementById('browser-bookmark-import-show-more');
  let session = null;

  function initializeSelection(current, tree) {
    current.selection = createBrowserBookmarkSelection(tree);
    for (const id of current.selection.roots) {
      const entry = current.selection.nodes.get(id);
      const isToolbar = entry.node.folderType === 'bookmarks-bar'
        || current.detected && String(entry.node.id) === '1';
      if (entry.kind === 'folder' && isToolbar) current.expanded.add(id);
    }
  }

  function renderSelection() {
    preview.hidden = Boolean(session.result);
    preview.disabled = session.busy || session.confirming;
    preview.setAttribute('aria-expanded', String(session.previewOpen));
    preview.textContent = t(session.previewOpen ? 'browserImport.hideItems' : 'browserImport.chooseItems');
    selectionPanel.hidden = !session.previewOpen || Boolean(session.result);
    if (!session.selection || selectionPanel.hidden) return;
    const selection = session.selection;
    const blocked = session.busy || session.confirming;
    const counts = getSelectedBrowserBookmarkCounts(selection);
    selectedCount.textContent = t('browserImport.selectedItems', {
      count: counts.bookmarkCount, folders: counts.folderCount
    });
    selectionTree.setAttribute('aria-label', t('browserImport.chooseItems'));
    selectionSearch.placeholder = t('browserImport.searchItems');
    selectionSearch.setAttribute('aria-label', t('browserImport.searchItems'));
    const query = selectionSearch.value.trim().toLocaleLowerCase();
    const visible = [];
    if (query) {
      for (const node of selection.nodes.values()) {
        if (`${node.node.title ?? ''}\n${node.node.url ?? ''}`.toLocaleLowerCase().includes(query)) {
          visible.push({ node, depth: 0 });
        }
      }
    } else {
      const stack = selection.roots.toReversed().map(id => ({ id, depth: 0 }));
      while (stack.length) {
        const { id, depth } = stack.pop();
        const node = selection.nodes.get(id);
        visible.push({ node, depth });
        if (session.expanded.has(id)) {
          for (const childId of node.children.toReversed()) stack.push({ id: childId, depth: depth + 1 });
        }
      }
    }
    const rows = visible.slice(0, session.visibleLimit).map(({ node, depth }) => {
      const row = document.createElement('li');
      row.className = 'browser-import-node';
      row.style.setProperty('--node-depth', Math.min(depth, 8));
      if (node.kind === 'folder' && node.children.length) {
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'browser-import-expand';
        expand.dataset.toggleId = node.id;
        const icon = createFolderVisual(DEFAULT_FOLDER_STYLE, [], { compact: true });
        const chevron = document.createElement('span');
        chevron.className = 'browser-import-folder-chevron';
        chevron.textContent = session.expanded.has(node.id) ? '▾' : '▸';
        chevron.setAttribute('aria-hidden', 'true');
        expand.append(icon, chevron);
        expand.setAttribute('aria-label', t('browserImport.expandFolder', { name: node.node.title }));
        expand.setAttribute('aria-expanded', String(session.expanded.has(node.id)));
        expand.disabled = blocked;
        expand.addEventListener('click', () => {
          if (session.expanded.has(node.id)) session.expanded.delete(node.id);
          else session.expanded.add(node.id);
          renderSelection();
          selectionTree.querySelector(`[data-toggle-id="${node.id}"]`)?.focus({ preventScroll: true });
        });
        row.append(expand);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'browser-import-expand';
        if (node.kind === 'folder') spacer.append(createFolderVisual(DEFAULT_FOLDER_STYLE, [], { compact: true }));
        else {
          let favicon = session.favicons.get(node.id);
          if (!favicon) {
            favicon = createFavicon({ name: node.node.title, url: node.node.url });
            favicon.alt = '';
            session.favicons.set(node.id, favicon);
          }
          spacer.append(favicon);
        }
        spacer.setAttribute('aria-hidden', 'true');
        row.append(spacer);
      }
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.nodeId = node.id;
      const state = getBrowserBookmarkSelectionState(selection, node.id);
      checkbox.checked = state.checked;
      checkbox.indeterminate = state.indeterminate;
      checkbox.disabled = blocked || state.disabled;
      const copy = document.createElement('span');
      copy.className = 'browser-import-node-copy';
      let emptyBadge = null;
      const name = document.createElement('span');
      name.textContent = node.node.title || node.node.url || t('browserImport.unnamedFolder');
      name.title = name.textContent;
      copy.append(name);
      if (node.kind === 'bookmark') {
        const url = document.createElement('small');
        url.textContent = node.node.url;
        url.title = node.node.url;
        copy.append(url);
      } else if (!node.children.length) {
        emptyBadge = document.createElement('span');
        emptyBadge.className = 'browser-import-empty-badge';
        emptyBadge.textContent = t('browserImport.emptyFolder');
        checkbox.setAttribute('aria-description', emptyBadge.textContent);
      }
      checkbox.addEventListener('change', () => {
        setBrowserBookmarkSelected(selection, node.id, checkbox.checked);
        render();
        selectionTree.querySelector(`[data-node-id="${node.id}"]`)?.focus({ preventScroll: true });
      });
      label.append(checkbox, copy);
      row.append(label);
      if (emptyBadge) row.append(emptyBadge);
      return row;
    });
    if (!visible.length) {
      const empty = document.createElement('li');
      empty.className = 'browser-import-selection-empty';
      empty.textContent = t('browserImport.noMatches');
      rows.push(empty);
    }
    selectionTree.replaceChildren(...rows);
    showMore.hidden = visible.length <= session.visibleLimit;
    showMore.disabled = selectAll.disabled = selectNone.disabled = selectionSearch.disabled = blocked;
  }

  registerModal({
    id: 'browser-bookmark-import', element: modal, initialFocus: confirm,
    closeOnOverlay: false
  });
  modal.setAttribute('aria-describedby', description.id);

  function render() {
    if (!session) return;
    const { detected, file, busy, result, error, automatic, confirming } = session;
    description.textContent = detected
      ? t('browserImport.detected', { count: detected.bookmarkCount, folders: detected.folderCount })
      : t('browserImport.htmlDescription', { filename: file.name });
    details.textContent = t('browserImport.description');
    modal.setAttribute('aria-busy', String(busy));
    const counts = session.selection ? getSelectedBrowserBookmarkCounts(session.selection) : null;
    confirm.disabled = busy || confirming || (!result && counts && !counts.bookmarkCount && !counts.folderCount);
    cancel.disabled = busy || confirming;
    confirm.textContent = t(busy && !session.loadingSelection ? 'browserImport.importing' : result
      ? 'browserImport.done' : error ? 'browserImport.retry' : 'browserImport.import');
    cancel.textContent = t(automatic ? 'browserImport.notNow' : 'browserImport.cancel');
    cancel.hidden = Boolean(result);
    status.classList.toggle('is-import-error', Boolean(error));
    status.setAttribute('role', error ? 'alert' : 'status');
    if (busy) {
      status.textContent = '';
    } else if (error) {
      status.textContent = t(error.code === 'SYNC_QUOTA_EXCEEDED'
        ? 'browserImport.quotaError' : error.code === 'MAIN_WORKSPACE_FULL'
          ? 'browserImport.mainFull' : error.code === 'EMPTY_BOOKMARK_IMPORT'
            ? 'browserImport.empty' : 'browserImport.error');
    } else if (result) {
      const messages = [t('browserImport.success', {
        count: result.bookmarkCount, folders: result.folderCount
      })];
      if (result.skippedCount) messages.push(t('browserImport.skipped', { count: result.skippedCount }));
      if (result.duplicateCount) messages.push(t('browserImport.duplicates', { count: result.duplicateCount }));
      status.textContent = messages.join(' ');
    } else {
      status.textContent = '';
    }
    status.hidden = !status.textContent;
    renderSelection();
  }

  function finish() {
    if (!session || session.busy || session.confirming) return;
    const { resolve, result } = session;
    clearTimeout(session.searchTimeout);
    session = null;
    closeModal('browser-bookmark-import');
    resolve(Boolean(result));
  }

  confirm.addEventListener('click', async () => {
    if (!session || session.busy || session.confirming) return;
    const current = session;
    current.busy = true;
    current.loadingSelection = true;
    current.error = null;
    render();
    // Paint the importing state before parsing or converting a large collection.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const options = { workspaceName: t('browserImport.workspaceName') };
      if (!current.selection) {
        const tree = current.detected?.tree ?? parseBrowserBookmarksHtml(await current.file.text());
        initializeSelection(current, tree);
      }
      const counts = getSelectedBrowserBookmarkCounts(current.selection);
      if (!counts.bookmarkCount && !counts.folderCount) {
        const error = new Error('No bookmarks or folders were selected.');
        error.code = 'EMPTY_BOOKMARK_IMPORT';
        throw error;
      }
      current.busy = current.loadingSelection = false;
      current.confirming = true;
      render();
      const accepted = await showAlert(t('browserImport.confirmImport'), { type: 'confirm' });
      current.confirming = false;
      if (!accepted) return;
      current.busy = true;
      render();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      current.result = await importBrowserBookmarkTree(filterSelectedBrowserBookmarks(current.selection), {
        ...options, source: current.file ? 'html' : 'chrome'
      });
      const result = current.result;
      current.busy = false;
      finish();
      flashSuccess('browserImport.success', 4500, { count: result.bookmarkCount, folders: result.folderCount });
      if (result.skippedCount) flashInfo('browserImport.skipped', 4500, { count: result.skippedCount });
      if (result.duplicateCount) flashInfo('browserImport.duplicates', 4500, { count: result.duplicateCount });
    } catch (error) {
      current.error = error;
      console.warn('[NewDeskTab] Could not import browser bookmarks:', error);
    } finally {
      current.busy = current.loadingSelection = current.confirming = false;
      if (session === current) {
        render();
        confirm.focus({ preventScroll: true });
      }
    }
  });
  cancel.addEventListener('click', finish);
  preview.addEventListener('click', async () => {
    if (!session || session.busy || session.confirming) return;
    const current = session;
    current.previewOpen = !current.previewOpen;
    if (current.previewOpen && !current.selection) {
      current.busy = current.loadingSelection = true;
      current.error = null;
      render();
      try {
        const tree = current.detected?.tree ?? parseBrowserBookmarksHtml(await current.file.text());
        initializeSelection(current, tree);
      } catch (error) {
        current.error = error;
        current.previewOpen = false;
      } finally {
        current.busy = current.loadingSelection = false;
      }
    }
    render();
  });
  for (const [button, checked] of [[selectAll, true], [selectNone, false]]) {
    button.addEventListener('click', () => {
      if (!session?.selection || session.busy || session.confirming) return;
      setAllBrowserBookmarksSelected(session.selection, checked);
      render();
    });
  }
  showMore.addEventListener('click', () => {
    if (!session || session.busy || session.confirming) return;
    session.visibleLimit += PREVIEW_PAGE_SIZE;
    renderSelection();
  });
  selectionSearch.addEventListener('input', () => {
    if (!session) return;
    clearTimeout(session.searchTimeout);
    const current = session;
    current.searchTimeout = setTimeout(() => {
      if (session !== current) return;
      current.visibleLimit = PREVIEW_PAGE_SIZE;
      renderSelection();
    }, 100);
  });
  subscribeLanguageChange(render);

  controller = {
    open(options) {
      if (session) return session.promise;
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      selectionSearch.value = '';
      session = { ...options, resolve, promise, busy: false, result: null, error: null,
        previewOpen: false, selection: null, expanded: new Set(), favicons: new Map(), visibleLimit: PREVIEW_PAGE_SIZE };
      render();
      openModal('browser-bookmark-import', { onCancel: finish });
      return promise;
    }
  };
  return controller;
}

/** Offer only a previously detected, nonempty collection after the welcome guide. */
export async function offerWelcomeBookmarkImport(detection) {
  const detected = await detection;
  if (!detected?.available || !detected.bookmarkCount) return false;
  return getController().open({ detected, automatic: true });
}

/** Connects explicit native and HTML import actions without altering JSON backups. */
export function initBrowserBookmarkImportSettings() {
  const nativeButton = document.getElementById('import-chrome-bookmarks');
  const htmlButton = document.getElementById('import-html-bookmarks');
  const input = document.getElementById('import-html-bookmarks-input');
  const status = document.getElementById('browser-bookmark-import-settings-status');
  let nativeStatusKey = '';

  const renderStatus = () => {
    status.textContent = nativeStatusKey ? t(nativeStatusKey) : '';
    status.hidden = !nativeStatusKey;
  };
  subscribeLanguageChange(renderStatus);
  nativeButton.addEventListener('click', async () => {
    if (nativeButton.disabled) return;
    nativeButton.disabled = true;
    nativeStatusKey = 'browserImport.detecting';
    renderStatus();
    try {
      const detected = await detectChromeBookmarks();
      nativeStatusKey = !detected.available ? 'browserImport.unavailable'
        : !detected.bookmarkCount ? 'browserImport.empty' : '';
      renderStatus();
      if (!nativeStatusKey) await getController().open({ detected });
    } catch (error) {
      nativeStatusKey = 'browserImport.error';
      renderStatus();
      console.warn('[NewDeskTab] Could not detect Chrome bookmarks:', error);
    } finally {
      nativeButton.disabled = false;
    }
  });
  htmlButton.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) await getController().open({ file });
  });
}
