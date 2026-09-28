import { VERSION } from '../platform/browser/extensionMetadata.js';
import { debug, formatDebugTime } from '../shared/diagnostics/debug.js';
import { getSyncBrowserSupport } from '../platform/browser/browserCapabilities.js';
import { resolveImageSource } from '../platform/images/localImages.js';
import { isLocalImageReference } from '../shared/images/backgroundImage.js';
import {
  getState,
  getStorageMode,
  getStorageUsage,
  getSyncCompatibility,
  subscribe
} from '../core/store.js';

let initialized = false;
let storageTimer;
let startup = null;
let startupReady = Promise.resolve();

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
}

async function readStorageUsage() {
  const modes = ['local', 'sync'];
  const results = await Promise.allSettled(modes.map(mode => getStorageUsage(mode)));
  return results.map((result, index) => {
    const mode = modes[index];
    if (result.status === 'rejected') return { mode, error: result.reason?.message || 'Unavailable' };
    const { usedBytes, quotaBytes, availableBytes } = result.value;
    return {
      mode, active: mode === getStorageMode(), usedBytes, quotaBytes,
      used: formatBytes(usedBytes), available: formatBytes(availableBytes),
      quota: formatBytes(quotaBytes),
      percent: quotaBytes > 0 ? `${(usedBytes / quotaBytes * 100).toFixed(2)}%` : 'Unavailable'
    };
  });
}

/** Reads a fresh snapshot on demand; it never writes user settings. */
export async function reportDebugState() {
  const revision = debug.revision;
  await startupReady;
  if (revision !== debug.revision) return;
  const { data, ui } = getState();
  const support = getSyncBrowserSupport();
  const styles = [data.settings.theme, data.settings.bookmarkDefault, ...data.bookmarks,
    ...data.folders, ...data.settings.bookmarkPresets.map(preset => preset.style)];
  const localImages = new Set(styles.map(style => style?.backgroundImageLocal).filter(isLocalImageReference));
  const summary = {
    debugEnabled: debug.enabled,
    version: VERSION,
    schemaVersion: data.schemaVersion,
    storageMode: getStorageMode(),
    syncEnabled: getStorageMode() === 'sync',
    syncSupported: support.canSync,
    syncBrowser: support.browser,
    syncBlock: getSyncCompatibility(),
    lastSave: ui.persistence.updatedAt ? new Date(ui.persistence.updatedAt).toISOString() : null,
    bookmarks: data.bookmarks.length,
    folders: data.folders.length,
    workspaces: data.settings.bookmarkGroups.length + 1,
    localImages: localImages.size,
    loadedLocalImages: [...localImages].filter(reference => resolveImageSource(reference)).length,
    language: `${data.settings.language} → ${document.documentElement.lang}`,
    interfaceTheme: data.settings.interfaceTheme,
    deviceColorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    platform: navigator.userAgentData?.platform || navigator.platform,
    viewport: `${innerWidth} × ${innerHeight} @${devicePixelRatio}`
  };
  const usage = await readStorageUsage();
  if (revision !== debug.revision) return;
  const outputOptions = { force: true };
  debug.table(`General information · v${VERSION}`, {
    'Debug': summary.debugEnabled ? 'Enabled' : 'Disabled',
    'Version': summary.version,
    'Data schema': summary.schemaVersion,
    'Storage': summary.storageMode === 'sync' ? 'Sync' : 'Local',
    'Sync supported': summary.syncSupported ? 'Yes' : 'No',
    'Browser': summary.syncBrowser,
    'Sync restriction': summary.syncBlock ?? 'None',
    'Last save': summary.lastSave ? formatDebugTime(summary.lastSave) : 'No saved changes',
    'Bookmarks': summary.bookmarks,
    'Folders': summary.folders,
    'Workspaces': summary.workspaces,
    'Local images': `${summary.loadedLocalImages} loaded / ${summary.localImages} selected`,
    'Language': summary.language,
    'Appearance': summary.interfaceTheme,
    'Browser appearance': summary.deviceColorScheme,
    'Platform': summary.platform,
    'Viewport': summary.viewport
  }, outputOptions);
  debug.table('Storage · images are stored locally', storageRows(usage), outputOptions);
  if (startup) debug.table('Initial load for this tab', startup, outputOptions);
  debug.table('Understanding timings', {
    Operations: 'Preparation + queue + save.',
    Render: 'Measured separately.',
    Sync: 'Browser write time; propagation between devices happens afterward.'
  }, outputOptions);
  return { summary, storage: usage, startup: startup ? structuredClone(startup) : null };
}

export function initDebugTools() {
  if (initialized) return;
  initialized = true;
  window.NewDeskTabDebug = Object.freeze({
    get enabled() { return debug.enabled; },
    toggle() {
      debug.setEnabled(!debug.enabled);
      cancelStorageReport();
      if (debug.enabled) printDebugHelp();
      else debug.info('Debug disabled', undefined, { force: true, tone: 'muted' });
      return debug.enabled;
    },
    report: () => reportDebugState(),
    history() {
      const records = debug.history();
      if (records.length) {
        debug.table(`History · ${records.length} of 100 operations`, records.map(({ id, label, status, durationMs, startedAt }) => (
          { '#': id, Time: formatDebugTime(startedAt), Operation: label,
            Duration: `${durationMs} ms`, Status: status === 'ok' ? 'OK' : status === 'error' ? 'Error' : 'No changes' }
        )), { force: true });
      } else debug.info('History is empty', undefined, { force: true, tone: 'muted' });
      return records;
    },
    clear() {
      cancelStorageReport();
      const result = { cleared: debug.clear(), enabled: debug.enabled };
      debug.info(`Console and history cleared · ${result.cleared} operations removed`, undefined, { force: true, tone: 'success' });
      return result;
    }
  });
  if (debug.enabled) printDebugHelp();
  else debug.guide('Debug available', [
    { command: 'NewDeskTabDebug.toggle()', description: 'Enable Debug mode and view the commands.' }
  ], { force: true, tone: 'muted' });

  subscribe((state, previous) => {
    if (!debug.enabled || !previous || state.ui.persistence.status === 'saving') return;
    if (['bookmarks', 'folders', 'settings'].every(key => state.data[key] === previous.data[key])) return;
    cancelStorageReport();
    const revision = debug.revision;
    storageTimer = setTimeout(async () => {
      storageTimer = undefined;
      const usage = await readStorageUsage();
      if (debug.enabled && revision === debug.revision) debug.table('Storage updated', storageRows(usage));
    }, 400);
  });
}

function printDebugHelp() {
  debug.guide('Debug enabled · Commands', [
    { command: 'NewDeskTabDebug.toggle()', description: 'Enable or disable live operation logging.' },
    { command: 'await NewDeskTabDebug.report()', description: 'Show general information, storage usage and initial load timings.' },
    { command: 'NewDeskTabDebug.history()', description: 'Show the last 100 operations and their timings.' },
    { command: 'NewDeskTabDebug.clear()', description: 'Clear the console and history.' },
    { command: 'NewDeskTabDebug.enabled', description: 'Check whether Debug is enabled.' }
  ], { tone: 'success' });
}

function storageRows(usage) {
  return usage.map(area => area.error ? { Storage: area.mode, Error: area.error } : {
    Storage: `${area.mode === 'sync' ? 'Sync' : 'Local'}${area.active ? ' · active' : ''}`,
    Used: `${area.used} / ${area.quota}`,
    Available: area.available,
    Usage: area.percent
  });
}

function cancelStorageReport() {
  clearTimeout(storageTimer);
  storageTimer = undefined;
}

export function finishDebugStartup(trace, startedAt) {
  startupReady = captureStartup(trace, startedAt);
  return startupReady;
}

// Keep just the initial load metrics even when live operation logging is off.
async function captureStartup(trace, startedAt) {
  const visible = document.visibilityState === 'visible';
  if (visible) await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  trace.mark(visible ? 'Wait for the next visible frame' : 'Background tab');
  const navigation = performance.getEntriesByType('navigation')[0];
  const firstPaint = performance.getEntriesByName('first-contentful-paint')[0];
  const readyAt = performance.now();
  const pendingImages = [...document.images].filter(image => !image.complete).length;
  trace.end({
    sinceNavigationMs: Number(readyAt.toFixed(2)),
    navigationType: navigation?.type ?? 'unknown',
    pendingImages
  });
  startup = {
    'JS start → UI ready (ms)': Number((readyAt - startedAt).toFixed(2)),
    'Navigation → UI ready (ms)': Number(readyAt.toFixed(2)),
    'First contentful paint (ms)': firstPaint?.startTime ?? 'Unavailable',
    'Navigation type': navigation?.type ?? 'Unavailable',
    'Pending images (without waiting for remote images)': pendingImages
  };
}
