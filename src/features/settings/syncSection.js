import {
  getDraftStorageMode,
  reconcileDraftStorageMode,
  setDraftStorageMode
} from './settingsDraft.js';
import {
  deleteSyncedData,
  getStorageMode,
  getStorageUsage,
  getSyncCompatibility,
  getSyncedDataMetadata,
  subscribe
} from '../../state/appStore.js';
import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import {
  getSyncBrowserSupport,
  SYNC_BROWSERS
} from '../../platform/browser/browserCapabilities.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';

function getBrowserNoticeKey(browser) {
  if (browser === SYNC_BROWSERS.CHROME) {
    return 'settingsModal.sync.browserSupport.chrome';
  }

  if (browser === SYNC_BROWSERS.BRAVE) {
    return 'settingsModal.sync.browserSupport.brave';
  }

  return 'settingsModal.sync.browserSupport.unsupported';
}

function formatExactBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const language = document.documentElement.lang || 'en';
  const formatted = new Intl.NumberFormat(language, {
    maximumFractionDigits: 0
  }).format(Math.round(bytes));

  return `${formatted} B`;
}

function formatHumanBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const language = document.documentElement.lang || 'en';
  const units = [
    ['GiB', 1024 ** 3],
    ['MiB', 1024 ** 2],
    ['KiB', 1024]
  ];
  const unit = units.find(([, size]) => bytes >= size);
  if (!unit) return formatExactBytes(bytes);

  const [name, size] = unit;
  const formatted = new Intl.NumberFormat(language, {
    maximumFractionDigits: 1
  }).format(bytes / size);

  return `${formatted} ${name}`;
}

function formatPercentage(value, exact = false) {
  const language = document.documentElement.lang || 'en';
  const minimumVisible = exact ? 0.0001 : 0.01;
  if (value > 0 && value < minimumVisible) {
    return `<${new Intl.NumberFormat(language, {
      maximumFractionDigits: exact ? 4 : 2
    }).format(minimumVisible)}`;
  }

  return new Intl.NumberFormat(language, {
    maximumFractionDigits: exact && value < 1 ? 4 : 2
  }).format(value);
}

/**
 * Initializes the Local/Sync persistence selector.
 *
 * The selection is kept as modal draft state and is only applied when the
 * user saves the settings modal.
 *
 * @param {Object} params
 * @param {Function} params.onRequestSaveStateUpdate
 * @returns {{syncUI: Function}}
 */
export function initSyncSection({ onRequestSaveStateUpdate }) {
  const modeInputs = Array.from(
    document.querySelectorAll('input[name="storage-mode"]')
  );
  const browserSupport = getSyncBrowserSupport();
  const settingsModal = document.getElementById('settings-modal');
  const syncHelp = document.getElementById('storage-sync-help');
  const syncNotice = document.getElementById('storage-sync-notice');
  const usageFormatToggle = document.getElementById('storage-usage-format-toggle');
  const compatibilityNotice = document.getElementById('storage-sync-compatibility-notice');
  const browserNotice = document.getElementById('storage-sync-browser-notice');
  const unsupportedReason = document.getElementById('storage-sync-unavailable-reason');
  const existingNotice = document.getElementById('storage-sync-existing-notice');
  const persistenceStatus = document.getElementById('storage-persistence-status');
  const persistenceIndicator = document.getElementById('storage-persistence-indicator');
  const lastUpdated = document.getElementById('storage-sync-last-updated');
  const deleteSyncData = document.getElementById('storage-sync-delete');
  function createUsageView(item, selectors = {}) {
    const query = (key, fallback) => item?.querySelector(selectors[key] ?? fallback);

    return {
      item,
      mode: query('mode', '[data-storage-usage-mode]'),
      summary: query('summary', '[data-storage-usage-summary]'),
      available: query('available', '[data-storage-usage-available]'),
      progress: query('progress', '[role="progressbar"]'),
      imageBreakdown: query('imageBreakdown', '[data-storage-image-breakdown]'),
      imageTotal: query('imageTotal', '[data-storage-image-total]'),
      segments: {
        system: query('systemSegment', '[data-storage-segment="system"]'),
        folders: query('foldersSegment', '[data-storage-segment="folders"]'),
        widgets: query('widgetsSegment', '[data-storage-segment="widgets"]'),
        bookmarks: query('bookmarksSegment', '[data-storage-segment="bookmarks"]'),
        synced: query('syncedSegment', '[data-storage-segment="synced"]'),
        trash: query('trashSegment', '[data-storage-segment="trash"]')
      },
      categoryValues: {
        system: query('systemValue', '[data-storage-category="system"]'),
        folders: query('foldersValue', '[data-storage-category="folders"]'),
        widgets: query('widgetsValue', '[data-storage-category="widgets"]'),
        bookmarks: query('bookmarksValue', '[data-storage-category="bookmarks"]'),
        synced: query('syncedValue', '[data-storage-category="synced"]'),
        trash: query('trashValue', '[data-storage-category="trash"]')
      },
      imageValues: {
        theme: query('themeImageValue', '[data-storage-image-category="theme"]'),
        bookmarks: query('bookmarkImageValue', '[data-storage-image-category="bookmarks"]'),
        folders: query('folderImageValue', '[data-storage-image-category="folders"]'),
        trash: query('trashImageValue', '[data-storage-image-category="trash"]'),
        other: query('otherImageValue', '[data-storage-image-category="other"]')
      }
    };
  }

  const localUsageItem = document.querySelector('[data-storage-usage-local]');
  const usageViews = {
    active: createUsageView(document.querySelector('[data-storage-usage-active]')),
    local: createUsageView(localUsageItem, {
      mode: '#storage-usage-local-mode',
      summary: '#storage-usage-local-summary',
      available: '#storage-usage-local-available',
      progress: '#storage-usage-local-progress',
      systemSegment: '#storage-usage-local-progress [data-storage-segment="system"]',
      syncedSegment: '#storage-usage-local-progress [data-storage-segment="synced"]',
      trashSegment: '#storage-usage-local-progress [data-storage-segment="trash"]',
      systemValue: '#storage-usage-local-system',
      syncedValue: '#storage-usage-local-synced',
      trashValue: '#storage-usage-local-trash'
    })
  };
  let syncMetadata = null;
  let metadataError = false;
  let metadataRequestId = 0;
  let storageUsage = null;
  let storageUsageError = false;
  let localStorageUsage = null;
  let localStorageUsageError = false;
  let localImageUsageError = false;
  let usageRequestId = 0;
  let isDeleting = false;
  let observedStorageMode = getStorageMode();
  let isTooltipPinned = false;
  let isHelpHovered = false;
  let suppressTooltip = false;
  let showExactBytes = false;

  function formatStorageBytes(bytes) {
    return showExactBytes ? formatExactBytes(bytes) : formatHumanBytes(bytes);
  }

  // Keep the tooltip inside the dialog for accessibility, but outside every
  // scrolling/clipping container so it can float over the complete modal.
  if (settingsModal && syncNotice?.parentElement !== settingsModal) {
    settingsModal.append(syncNotice);
  }

  function positionSyncTooltip() {
    if (!syncHelp || !syncNotice?.classList.contains('is-open')) return;

    const viewportMargin = 12;
    const gap = 10;
    const helpRect = syncHelp.getBoundingClientRect();
    const tooltipRect = syncNotice.getBoundingClientRect();
    const spaceAbove = helpRect.top - gap - viewportMargin;
    const spaceBelow = window.innerHeight - helpRect.bottom - gap - viewportMargin;
    const placement = spaceAbove >= tooltipRect.height || spaceAbove >= spaceBelow
      ? 'above'
      : 'below';
    const requestedTop = placement === 'above'
      ? helpRect.top - tooltipRect.height - gap
      : helpRect.bottom + gap;
    const maxLeft = Math.max(viewportMargin, window.innerWidth - tooltipRect.width - viewportMargin);
    const maxTop = Math.max(viewportMargin, window.innerHeight - tooltipRect.height - viewportMargin);
    const left = Math.min(
      Math.max(viewportMargin, helpRect.right - tooltipRect.width),
      maxLeft
    );
    const top = Math.min(Math.max(viewportMargin, requestedTop), maxTop);
    const arrowLeft = Math.min(
      Math.max(12, helpRect.left + (helpRect.width / 2) - left),
      tooltipRect.width - 12
    );

    syncNotice.dataset.placement = placement;
    syncNotice.style.left = `${left}px`;
    syncNotice.style.top = `${top}px`;
    syncNotice.style.setProperty('--sync-tooltip-arrow-left', `${arrowLeft}px`);
  }

  function setSyncTooltipOpen(open) {
    if (!syncHelp || !syncNotice) return;
    if (syncHelp.hidden) open = false;
    syncNotice.classList.toggle('is-open', open);
    syncHelp.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(positionSyncTooltip);
  }

  function resetSyncTooltip() {
    isTooltipPinned = false;
    suppressTooltip = false;
    setSyncTooltipOpen(false);
  }

  syncHelp?.addEventListener('mouseenter', () => {
    isHelpHovered = true;
    if (!suppressTooltip) setSyncTooltipOpen(true);
  });

  syncHelp?.addEventListener('mouseleave', () => {
    isHelpHovered = false;
    suppressTooltip = false;
    if (!isTooltipPinned) setSyncTooltipOpen(false);
  });

  syncHelp?.addEventListener('focus', () => {
    if (!suppressTooltip) setSyncTooltipOpen(true);
  });

  syncHelp?.addEventListener('blur', () => {
    suppressTooltip = false;
    if (!isTooltipPinned && !isHelpHovered) setSyncTooltipOpen(false);
  });

  syncHelp?.addEventListener('click', () => {
    if (isTooltipPinned) {
      isTooltipPinned = false;
      suppressTooltip = true;
      setSyncTooltipOpen(false);
      return;
    }

    isTooltipPinned = true;
    suppressTooltip = false;
    setSyncTooltipOpen(true);
  });

  window.addEventListener('resize', positionSyncTooltip);
  document.addEventListener('scroll', positionSyncTooltip, true);

  if (settingsModal) {
    new MutationObserver(() => {
      if (settingsModal.hidden || !settingsModal.classList.contains('is-open')) {
        resetSyncTooltip();
      }
    }).observe(settingsModal, { attributes: true, attributeFilter: ['class', 'hidden'] });
  }

  function getUsageDisplayMode() {
    return getDraftStorageMode() ?? getStorageMode();
  }

  function getUsageBreakdown(view, usage) {
    if (view.categoryValues.synced) {
      const localBreakdown = usage?.localBreakdown;
      const systemBytes = localBreakdown?.localSystemBytes;
      const widgetBytes = Number.isFinite(systemBytes) && Number.isFinite(usage?.widgetBytes)
        ? Math.min(systemBytes, Math.max(0, usage.widgetBytes))
        : undefined;
      return {
        systemBytes: Number.isFinite(widgetBytes) ? systemBytes - widgetBytes : systemBytes,
        widgetBytes,
        folderBytes: 0,
        syncedBytes: Number.isFinite(localBreakdown?.syncSystemBytes)
          && Number.isFinite(localBreakdown?.syncBookmarkBytes)
          ? localBreakdown.syncSystemBytes + localBreakdown.syncBookmarkBytes
          : undefined,
        trashBytes: localBreakdown?.trashBytes
      };
    }

    const systemBytes = usage?.breakdown?.systemBytes;
    const widgetBytes = Number.isFinite(systemBytes) && Number.isFinite(usage?.widgetBytes)
      ? Math.min(systemBytes, Math.max(0, usage.widgetBytes))
      : undefined;
    const combinedBookmarkBytes = usage?.breakdown?.bookmarkBytes;
    const folderBytes = Number.isFinite(combinedBookmarkBytes) && Number.isFinite(usage?.folderBytes)
      ? Math.min(combinedBookmarkBytes, Math.max(0, usage.folderBytes))
      : undefined;
    return {
      systemBytes: Number.isFinite(widgetBytes) ? systemBytes - widgetBytes : systemBytes,
      widgetBytes,
      bookmarkBytes: Number.isFinite(folderBytes)
        ? combinedBookmarkBytes - folderBytes
        : combinedBookmarkBytes,
      folderBytes,
      trashBytes: usage?.breakdown?.trashBytes
    };
  }

  function renderStorageBreakdown(view, breakdown, quotaBytes, modeKey) {
    const showTrash = modeKey !== 'sync';
    const categories = view.categoryValues.synced
      ? {
          system: breakdown?.systemBytes,
          synced: breakdown?.syncedBytes,
          folders: breakdown?.folderBytes,
          widgets: breakdown?.widgetBytes,
          trash: breakdown?.trashBytes
        }
      : {
          system: breakdown?.systemBytes,
          bookmarks: breakdown?.bookmarkBytes,
          folders: breakdown?.folderBytes,
          widgets: breakdown?.widgetBytes,
          trash: breakdown?.trashBytes
        };

    for (const [category, bytes] of Object.entries(categories)) {
      const hasValue = Number.isFinite(bytes);
      const isEmpty = hasValue && bytes === 0;
      const isHidden = (category === 'trash' && !showTrash) || isEmpty;
      const formattedBytes = hasValue ? formatStorageBytes(bytes) : '—';
      const percentage = hasValue && quotaBytes > 0
        ? Math.min(100, (bytes / quotaBytes) * 100)
        : 0;
      const segment = view.segments[category];
      const legendItem = view.categoryValues[category]
        ?.closest('.storage-usage-legend-item');

      if (segment) {
        segment.toggleAttribute('hidden', isHidden);
        segment.style.width = `${percentage}%`;
        segment.title = hasValue
          ? `${t(`settingsModal.sync.usage.${category === 'synced' ? 'localSyncCopy' : category}`)}: ${formattedBytes}`
          : '';
      }
      legendItem?.toggleAttribute('hidden', isHidden);
      if (view.categoryValues[category]) {
        view.categoryValues[category].textContent = formattedBytes;
        if (category === 'widgets') {
          const item = view.categoryValues[category].closest('.storage-usage-legend-item');
          if (modeKey === 'sync') {
            item?.setAttribute('title', t('settingsModal.sync.usage.widgetsHint'));
          } else {
            item?.removeAttribute('title');
          }
        }
      }
    }
  }

  function setStorageProgress(view, percentage) {
    const value = Number.isFinite(percentage) ? percentage : 0;
    view.progress?.setAttribute('aria-valuenow', String(value));
    view.progress?.setAttribute('value', String(value));
  }

  function renderLocalImageBreakdown(view, imageBreakdown, show) {
    const categories = {
      theme: imageBreakdown?.themeBytes,
      bookmarks: imageBreakdown?.bookmarkBytes,
      folders: imageBreakdown?.folderBytes,
      trash: imageBreakdown?.trashBytes,
      other: imageBreakdown?.otherBytes
    };
    const hasCompleteBreakdown = Number.isFinite(imageBreakdown?.totalBytes)
      && Object.values(categories).every(Number.isFinite);
    const hasStoredImages = Number.isFinite(imageBreakdown?.totalBytes)
      && imageBreakdown.totalBytes > 0;
    const hasStoredCategoryImages = Object.values(categories)
      .some(bytes => Number.isFinite(bytes) && bytes > 0);
    const isEmpty = hasCompleteBreakdown && !hasStoredImages && !hasStoredCategoryImages;

    view.imageBreakdown?.toggleAttribute('hidden', !show || isEmpty);
    if (!show) return;

    if (view.imageTotal) {
      view.imageTotal.textContent = localImageUsageError ? '—'
        : Number.isFinite(imageBreakdown?.totalBytes) ? formatStorageBytes(imageBreakdown.totalBytes) : '—';
    }

    for (const [category, bytes] of Object.entries(categories)) {
      const item = view.imageValues[category]?.closest('.storage-image-item');
      item?.toggleAttribute('hidden', Number.isFinite(bytes) && bytes <= 0);
      if (view.imageValues[category]) {
        view.imageValues[category].textContent = Number.isFinite(bytes)
          ? formatStorageBytes(bytes)
          : '—';
      }
    }
  }

  function renderStorageUsageView(view, modeKey, usage, usageError) {
    if (!view.item) return;

    renderLocalImageBreakdown(view, usage?.imageBreakdown, modeKey === 'local');

    view.item.dataset.storageUsage = modeKey;
    if (view.mode) view.mode.textContent = t(`settingsModal.sync.usage.${modeKey}`);
    view.progress?.setAttribute(
      'aria-label',
      t(`settingsModal.sync.usage.${modeKey}Aria`)
    );

    if (usageError) {
      if (view.summary) view.summary.textContent = t('settingsModal.sync.usage.error');
      if (view.available) view.available.textContent = '';
      setStorageProgress(view, 0);
      renderStorageBreakdown(view, null, 0, modeKey);
      return;
    }

    if (!usage || usage.mode !== modeKey) {
      if (view.summary) view.summary.textContent = t('settingsModal.sync.usage.loading');
      if (view.available) view.available.textContent = '';
      setStorageProgress(view, 0);
      renderStorageBreakdown(view, null, 0, modeKey);
      return;
    }

    const percentage = usage.quotaBytes > 0
      ? Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100)
      : 0;
    const used = formatStorageBytes(usage.usedBytes);
    const total = formatStorageBytes(usage.quotaBytes);
    const free = formatStorageBytes(usage.availableBytes);
    const percent = formatPercentage(percentage, showExactBytes);

    if (view.summary) {
      view.summary.textContent = t(
        'settingsModal.sync.usage.summary',
        { used, total, percent }
      );
    }
    if (view.available) {
      view.available.textContent = t('settingsModal.sync.usage.available', { free });
    }
    setStorageProgress(view, percentage);
    renderStorageBreakdown(view, getUsageBreakdown(view, usage), usage.quotaBytes, modeKey);
  }

  function renderStorageUsage() {
    if (usageFormatToggle) {
      const key = showExactBytes
        ? 'settingsModal.sync.usage.showHuman'
        : 'settingsModal.sync.usage.showExact';
      usageFormatToggle.dataset.i18n = key;
      usageFormatToggle.textContent = t(key);
      usageFormatToggle.setAttribute('aria-pressed', String(showExactBytes));
    }
    const modeKey = getUsageDisplayMode() === 'sync' ? 'sync' : 'local';
    const showLocalUsage = modeKey === 'sync';

    usageViews.local.item?.toggleAttribute('hidden', !showLocalUsage);
    renderStorageUsageView(
      usageViews.active,
      modeKey,
      storageUsage,
      storageUsageError
    );

    if (showLocalUsage) {
      renderStorageUsageView(
        usageViews.local,
        'local',
        localStorageUsage,
        localStorageUsageError
      );
    }
  }

  async function refreshStorageUsage() {
    const requestId = ++usageRequestId;
    const modeKey = getUsageDisplayMode() === 'sync' ? 'sync' : 'local';
    storageUsage = null;
    storageUsageError = false;
    localStorageUsage = null;
    localStorageUsageError = false;
    localImageUsageError = false;
    renderStorageUsage();

    const modes = modeKey === 'sync' ? ['sync', 'local'] : ['local'];
    const results = await Promise.allSettled(modes.map(mode => getStorageUsage(mode)));
    if (requestId !== usageRequestId || modeKey !== getUsageDisplayMode()) return;

    const [activeResult, localResult] = results;
    if (activeResult.status === 'fulfilled') {
      storageUsage = activeResult.value;
    } else {
      console.error(`[SETTINGS] Could not read ${modes[0]} storage usage:`, activeResult.reason);
      storageUsageError = true;
    }

    if (modeKey === 'sync') {
      if (localResult.status === 'fulfilled') {
        localStorageUsage = localResult.value;
      } else {
        console.error('[SETTINGS] Could not read local storage usage:', localResult.reason);
        localStorageUsageError = true;
      }
    }

    const localUsageResult = modeKey === 'sync' ? localResult : activeResult;
    if (localUsageResult.status !== 'fulfilled') {
      localImageUsageError = true;
    }

    if (requestId !== usageRequestId || modeKey !== getUsageDisplayMode()) return;
    renderStorageUsage();
  }

  function renderSyncMetadata() {
    if (!lastUpdated) return;

    const hasCloudData = syncMetadata?.hasData === true;
    if (persistenceIndicator) persistenceIndicator.hidden = !hasCloudData;
    if (syncHelp) syncHelp.hidden = !hasCloudData;
    if (!hasCloudData) resetSyncTooltip();
    if (unsupportedReason) {
      unsupportedReason.hidden = hasCloudData || browserSupport.canSync;
      if (!unsupportedReason.hidden) {
        unsupportedReason.textContent = t(getBrowserNoticeKey(browserSupport.browser));
      }
    }

    let key = 'settingsModal.sync.metadata.loading';
    let params = {};

    if (metadataError) {
      key = 'settingsModal.sync.metadata.error';
    } else if (syncMetadata && !syncMetadata.hasData) {
      key = 'settingsModal.sync.metadata.empty';
    } else if (syncMetadata?.hasData && syncMetadata.updatedAt === null) {
      key = 'settingsModal.sync.metadata.unknown';
    } else if (syncMetadata?.updatedAt) {
      const language = document.documentElement.lang || 'en';
      const formattedDate = new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(syncMetadata.updatedAt));
      key = 'settingsModal.sync.metadata.updatedAt';
      params = { date: formattedDate };
    }

    lastUpdated.textContent = t(key, params);
    if (deleteSyncData) {
      deleteSyncData.disabled = isDeleting || metadataError || !syncMetadata?.hasData;
    }
  }

  async function refreshSyncMetadata() {
    const requestId = ++metadataRequestId;

    try {
      const metadata = await getSyncedDataMetadata();
      if (requestId !== metadataRequestId) return;
      syncMetadata = metadata;
      metadataError = false;
    } catch (error) {
      if (requestId !== metadataRequestId) return;
      console.error('[SETTINGS] Could not read synchronized metadata:', error);
      syncMetadata = null;
      metadataError = true;
    }

    renderSyncMetadata();
  }

  subscribe(state => {
    const currentStorageMode = getStorageMode();
    if (currentStorageMode !== observedStorageMode) {
      observedStorageMode = currentStorageMode;
      reconcileDraftStorageMode(currentStorageMode);
      syncUI();
    }

    const persistence = state.ui.persistence;
    if (!persistence) return;
    const statusKey = `settingsModal.sync.status.${persistence.status}`;
    if (persistenceStatus) {
      persistenceStatus.dataset.status = persistence.status;
      persistenceStatus.dataset.i18n = statusKey;
      persistenceStatus.textContent = t(statusKey);
    }
    if (persistenceIndicator) {
      persistenceIndicator.dataset.status = persistence.status;
    }

    if (persistence.status === 'saved' && getStorageMode() === 'sync') {
      void refreshSyncMetadata();
    }

    if (persistence.status === 'saved') void refreshStorageUsage();
  });

  subscribeLanguageChange(() => {
    renderSyncMetadata();
    renderStorageUsage();
    if (syncNotice?.classList.contains('is-open')) {
      requestAnimationFrame(positionSyncTooltip);
    }
  });

  usageFormatToggle?.addEventListener('click', () => {
    showExactBytes = !showExactBytes;
    renderStorageUsage();
  });

  function syncUI() {
    const selectedMode = getDraftStorageMode();
    const browserNoticeKey = getBrowserNoticeKey(browserSupport.browser);
    const compatibility = getSyncCompatibility();
    const isVersionBlocked = compatibility?.reason === 'newer-sync-data';

    if (browserNotice) {
      browserNotice.dataset.i18n = browserNoticeKey;
      browserNotice.textContent = t(browserNoticeKey);
      browserNotice.classList.toggle('is-hidden', isVersionBlocked);
    }

    if (compatibilityNotice) {
      compatibilityNotice.classList.toggle('is-hidden', !isVersionBlocked);
      compatibilityNotice.textContent = t(
        'settingsModal.sync.compatibility.newerVersion'
      );
    }

    existingNotice?.classList.toggle(
      'is-hidden',
      !browserSupport.canSync || isVersionBlocked
    );
    syncNotice?.classList.toggle(
      'is-unsupported',
      !browserSupport.canSync && !isVersionBlocked
    );
    syncNotice?.classList.toggle('is-version-blocked', isVersionBlocked);
    if (syncNotice?.classList.contains('is-open')) {
      requestAnimationFrame(positionSyncTooltip);
    }

    for (const input of modeInputs) {
      const isUnsupportedSync = input.value === 'sync'
        && (!browserSupport.canSync || isVersionBlocked);
      const option = input.closest('.storage-mode-option');

      input.disabled = isUnsupportedSync;
      input.checked = input.value === selectedMode;
      option?.classList.toggle('is-selected', input.checked);
      option?.classList.toggle('is-disabled', isUnsupportedSync);

      if (isUnsupportedSync) {
        option?.setAttribute('aria-disabled', 'true');
      } else {
        option?.removeAttribute('aria-disabled');
      }
    }

    renderSyncMetadata();
    renderStorageUsage();
    void refreshSyncMetadata();
    void refreshStorageUsage();
  }

  for (const input of modeInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      if (input.value === 'sync' && !browserSupport.canSync) {
        syncUI();
        return;
      }

      if (input.value === 'sync' && getSyncCompatibility()) {
        syncUI();
        return;
      }

      setDraftStorageMode(input.value);
      syncUI();
      onRequestSaveStateUpdate();
    });
  }

  deleteSyncData?.addEventListener('click', async () => {
    const confirmed = await showAlert(
      t('alert.settings.sync.delete'),
      { type: 'confirm' }
    );

    if (!confirmed) return;

    isDeleting = true;
    renderSyncMetadata();

    try {
      await deleteSyncedData();
      reconcileDraftStorageMode(getStorageMode());
      syncMetadata = { hasData: false, updatedAt: null };
      metadataError = false;
      flashSuccess('flash.sync.deleted');
    } catch (error) {
      console.error('[SETTINGS] Could not delete synchronized data:', error);
      flashError('flash.sync.deleteError');
      metadataError = true;
    } finally {
      isDeleting = false;
      syncUI();
      onRequestSaveStateUpdate();
    }
  });

  return { syncUI };
}
