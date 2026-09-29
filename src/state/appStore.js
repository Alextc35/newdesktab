import '../types/types.js'; // typedefs
import { debug } from '../shared/diagnostics/debug.js';
import { createDefaultPersistedData } from '../platform/storage/persistedDataDefaults.js';
import { storage, STORAGE_MODES } from '../platform/storage/storageFacade.js';
import { mergeChanges } from '../shared/data/mergeChanges.js';
import { clearLocalImages } from '../platform/images/localImages.js';
import { clearLocalVideos } from '../platform/images/localVideos.js';
import { clearDeviceImageSelections } from '../platform/storage/deviceImageSelections.js';
import { clearDeviceTrash } from '../platform/storage/deviceTrashStorage.js';
import { createGridHistory, hasGridDataChange } from './gridHistory.js';
import { describeStateChange } from './stateChangeDescription.js';

/**
 * Global application state.
 * @type {AppState}
 */
let state = createDefaultState();

/**
 * Indicates whether the store is still in the hydration phase.
 * While `true`, state changes will not be persisted to storage.
 * @type {boolean}
 */
let isHydrating = true;

/** @type {ReturnType<typeof setTimeout>|null} */
let storageRefreshTimer = null;

/** @type {{areaName: 'local'|'sync', origin: 'same-device'|'other-device'}|null} */
let pendingStorageChange = null;

/** @type {(() => void)|null} */
let unsubscribeFromStorage = null;

/** @type {Promise<void>} */
let persistenceQueue = Promise.resolve();

const gridHistory = createGridHistory();

/**
 * List of subscribed listeners executed on every state change.
 * @type {Array<(state: AppState, prevState: AppState|null) => void>}
 */
const listeners = [];

/** @type {Array<(event: {type: 'updated'|'deleted'}) => void>} */
const remoteSyncUpdateListeners = [];

/**
 * Returns a deep clone of the current state.
 * @returns {AppState}
 */
export function getState() {
  return structuredClone(state);
}

/**
 * Updates the global state with the provided partial values.
 * Persists bookmarks, folders and settings to storage if not hydrating.
 * Notifies all subscribed listeners.
 * 
 * @param {Partial<AppState>} partial
 * @param {{recordHistory?: boolean, debugTrace?: ReturnType<typeof debug.start>}} [options]
 * @returns {Promise<void>}
 */
export async function setState(partial, { recordHistory = true, debugTrace } = {}) {
  const prevState = state;
  const trace = debugTrace ?? debug.start(debug.enabled
    ? (isHydrating ? 'Hydrate data' : describeStateChange(partial, prevState.data))
    : '');
  let persistenceError = null;
  let persisted = false;
  let persistenceMode = storage.getMode();
  const gridDataWillChange = hasGridDataChange(partial.data, state.data);

  if (!isHydrating && recordHistory && gridDataWillChange) {
    gridHistory.record(state.data);
  }

  state = {
    data: {
      ...state.data,
      ...(partial.data || {})
    },
    ui: {
      ...state.ui,
      ...(partial.ui || {}),
      history: gridHistory.getStatus()
    }
  };

  const details = debug.enabled ? {
    bookmarksBefore: prevState.data.bookmarks.length,
    bookmarksAfter: state.data.bookmarks.length,
    foldersBefore: prevState.data.folders.length,
    foldersAfter: state.data.folders.length,
    widgetsBefore: prevState.data.widgets.length,
    widgetsAfter: state.data.widgets.length
  } : {};
  const shouldPersist = !isHydrating && (
    state.data.bookmarks !== prevState.data.bookmarks ||
    state.data.folders !== prevState.data.folders ||
    state.data.widgets !== prevState.data.widgets ||
    state.data.recycleBin !== prevState.data.recycleBin ||
    state.data.trash !== prevState.data.trash ||
    state.data.settings !== prevState.data.settings
  );
  if (shouldPersist) {
    const dataToPersist = structuredClone(state.data);
    state.ui.persistence = {
      status: 'saving',
      error: null,
      updatedAt: state.ui.persistence?.updatedAt ?? null
    };
    trace.mark('Data preparation');

    try {
      persistenceQueue = persistenceQueue
        .catch(() => undefined)
        .then(async () => {
          trace.mark('Queue wait');
          persistenceMode = storage.getMode();
          try {
            const result = await storage.commit(prevState.data, dataToPersist);
            if (result.rebased) {
              // Keep operations queued locally since this snapshot was taken.
              state.data = mergeChanges(dataToPersist, state.data, result.data);
              clearBookmarkHistory();
            }
          } finally {
            trace.mark('Storage write');
          }
        });

      await persistenceQueue;
      state.ui.persistence = {
        status: 'saved',
        error: null,
        updatedAt: Date.now()
      };

      persisted = true;
    } catch (err) {
      persistenceError = err?.message || 'Storage persistence failed';
      console.error('[STORE] Storage persist failed:', err);
      state.ui.persistence = {
        status: 'error',
        error: err?.message || 'Storage persistence failed',
        updatedAt: Date.now()
      };
    }
  } else {
    trace.mark('Data preparation');
  }

  try {
    notify(state, prevState);
    trace.mark('Notify UI');
    trace.end({ ...details, storageMode: persistenceMode, persisted,
      status: persistenceError ? 'error' : 'ok', ...(persistenceError ? { error: persistenceError } : {}) });
  } catch (error) {
    trace.end({ ...details, status: 'error', error: error.message, persisted });
    throw error;
  }
}

/**
 * Restores the previous bookmark/folder collection. Settings and UI state are not
 * included so an accidental shortcut cannot revert synchronization choices.
 *
 * @returns {Promise<boolean>}
 */
export async function undoBookmarks() {
  const transition = gridHistory.takeUndo(state.data);
  if (!transition) return false;

  await setState({ data: transition.data }, { recordHistory: false, debugTrace: debug.start('Undo') });
  return true;
}

/** @returns {Promise<boolean>} */
export async function redoBookmarks() {
  const transition = gridHistory.takeRedo(state.data);
  if (!transition) return false;

  await setState({ data: transition.data }, { recordHistory: false, debugTrace: debug.start('Redo') });
  return true;
}

/** Clears transient undo history after hydration or a full data replacement. */
export function clearBookmarkHistory() {
  state.ui.history = gridHistory.clear();
}

/**
 * Returns the persistence mode selected on this device.
 *
 * @returns {'local'|'sync'}
 */
export function getStorageMode() {
  return storage.getMode();
}

/** @returns {SyncCompatibilityBlock|null} */
export function getSyncCompatibility() {
  return storage.getSyncCompatibility();
}

/** @returns {Promise<{hasData: boolean, updatedAt: number|null}>} */
export function getSyncedDataMetadata() {
  return storage.getSyncMetadata();
}

/**
 * Returns quota usage for a browser storage area.
 *
 * @param {'local'|'sync'} mode
 * @returns {ReturnType<typeof storage.getUsage>}
 */
export function getStorageUsage(mode) {
  return storage.getUsage(mode);
}

/**
 * Waits until every storage write queued by the current page has settled.
 * Save flows use this before closing so an immediate page reload cannot race
 * the write that persists the user's latest edit.
 *
 * @returns {Promise<AppState['ui']['persistence']>}
 */
export async function waitForPersistence() {
  await persistenceQueue.catch(() => undefined);
  return structuredClone(state.ui.persistence);
}

/**
 * Permanently removes the remote NewDeskTab payload. If synchronized storage is
 * active, the current state is copied locally before the remote data is
 * removed so the device never loses its working data.
 *
 * @returns {Promise<{deleted: boolean, switchedToLocal: boolean}>}
 */
export async function deleteSyncedData() {
  await persistenceQueue.catch(() => undefined);
  const switchedToLocal = storage.getMode() === STORAGE_MODES.SYNC;

  if (switchedToLocal) {
    await changeStorageMode(STORAGE_MODES.LOCAL, state.data);
  }

  const deleted = await storage.clearSyncData();
  return { deleted, switchedToLocal };
}

/**
 * Removes every piece of user data owned by this device and restores defaults.
 * When Sync is active, the device switches to Local before the reset so the
 * remote payload is never overwritten or deleted. Starter bookmarks are
 * deliberately excluded so the cleared grid stays empty.
 *
 * @returns {Promise<void>}
 */
export async function clearAllLocalData() {
  const data = createDefaultPersistedData();
  data.bookmarks = [];
  data.folders = [];
  data.widgets = [];

  await persistenceQueue.catch(() => undefined);
  if (storage.getMode() === STORAGE_MODES.SYNC) {
    await changeStorageMode(STORAGE_MODES.LOCAL, data);
  } else {
    await setState({ data }, { recordHistory: false });
    if (state.ui.persistence.status === 'error') {
      throw new Error(state.ui.persistence.error || 'Could not clear persisted data.');
    }
  }

  await Promise.all([
    clearLocalImages(),
    clearLocalVideos(),
    clearDeviceImageSelections(),
    clearDeviceTrash()
  ]);
  clearBookmarkHistory();
}

/**
 * Switches between device-only and browser-synchronized persistence.
 *
 * When synchronized data already exists, it becomes the active state. When it
 * does not exist, the current state is migrated to sync storage. Switching
 * back to local keeps a local copy and leaves remote data untouched.
 *
 * @param {'local'|'sync'} mode
 * @param {PersistedData} [nextData=state.data]
 * @returns {Promise<'unchanged'|'existing'|'migrated'>}
 */
export async function changeStorageMode(mode, nextData = state.data) {
  if (!Object.values(STORAGE_MODES).includes(mode)) {
    throw new TypeError(`Unsupported storage mode: ${mode}`);
  }

  const previousMode = storage.getMode();
  const trace = debug.start('Switch storage', { from: previousMode, to: mode });
  try {
    await persistenceQueue.catch(() => undefined);
    trace.mark('Queue wait');
    const result = await storage.changeMode(mode, nextData);
    trace.mark('Storage switch');
    const dataChanged = replacePersistedData(result.data);
    if (!dataChanged && storage.getMode() !== previousMode) notify(state, state);
    trace.end({ source: result.source, activeMode: storage.getMode() });
    return result.source;
  } catch (error) {
    trace.end({ status: 'error', error: error.message, activeMode: storage.getMode() });
    throw error;
  }
}

/**
 * Subscribes a listener that will run on every state change.
 * The listener is immediately invoked with the current state.
 *
 * @param {(state: AppState, prevState: AppState|null) => void} listener
 * @returns {() => void} Function to unsubscribe.
 */
export function subscribe(listener) {
  listeners.push(listener);
  listener(state, null);

  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
}

/**
 * Subscribes to data updates received from another synchronized device.
 * Unlike the regular store subscription, this is not invoked immediately.
 *
 * @param {(event: {type: 'updated'|'deleted'}) => void} listener
 * @returns {() => void} Function to unsubscribe.
 */
export function subscribeToRemoteSyncUpdates(listener) {
  remoteSyncUpdateListeners.push(listener);

  return () => {
    const index = remoteSyncUpdateListeners.indexOf(listener);
    if (index > -1) remoteSyncUpdateListeners.splice(index, 1);
  };
}

/**
 * Toggles the UI editing mode.
 * @returns {Promise<boolean>}
 */
export async function toggleEditing() {
  const newValue = !state.ui.isEditing;
  await setState({ ui: { isEditing: newValue } });
  return newValue;
}

/**
 * Hydrates the store from persisted storage.
 *
 * Retrieves all persisted data (bookmarks and settings),
 * initializes the in-memory state in a single update,
 * and then marks the hydration phase as completed.
 *
 * During hydration, persistence is temporarily disabled
 * to prevent writing back the same data to storage.
 *
 * @returns {Promise<void>}
 */
export async function hydrateStore() {
  await storage.initialize();
  const persisted = await storage.get(null);

  await setState({ data: persisted });

  finishHydration();
  clearBookmarkHistory();
  subscribeToStorageChanges();
}

/**
 * Marks the hydration phase as completed.
 * After this, state changes affecting bookmarks or settings
 * will be persisted automatically.
 */
function finishHydration() { isHydrating = false; }

/**
 * Replaces persisted state without writing it back to storage.
 * Used for changes received from another tab or synchronized device.
 *
 * @param {PersistedData} data
 * @returns {boolean} Whether the in-memory data changed.
 */
function replacePersistedData(data) {
  if (JSON.stringify(state.data) === JSON.stringify(data)) return false;

  const prevState = state;
  state = {
    ...state,
    data: structuredClone(data)
  };

  clearBookmarkHistory();

  notify(state, prevState);
  return true;
}

/**
 * Keeps open NewDeskTab pages up to date when another tab or device changes the
 * active storage area. Closely grouped chunk events are collapsed into one
 * refresh.
 */
function subscribeToStorageChanges() {
  if (unsubscribeFromStorage) return;

  unsubscribeFromStorage = storage.subscribe(change => {
    if (
      change.origin === 'other-device'
      || pendingStorageChange?.origin !== 'other-device'
    ) {
      pendingStorageChange = change;
    }

    if (storageRefreshTimer) clearTimeout(storageRefreshTimer);

    storageRefreshTimer = setTimeout(async () => {
      storageRefreshTimer = null;
      const refreshChange = pendingStorageChange;
      pendingStorageChange = null;

      try {
        // Never replace optimistic edits with an older storage event while a
        // local commit is queued. Read again only after that queue has drained.
        const queue = persistenceQueue;
        await queue.catch(() => undefined);

        const isRemoteSyncChange = refreshChange?.areaName === STORAGE_MODES.SYNC
          && refreshChange.origin === 'other-device';
        if (isRemoteSyncChange && storage.getMode() === STORAGE_MODES.SYNC) {
          const syncMetadata = await storage.getSyncMetadata();
          if (!syncMetadata.hasData) {
            // Preserve the last synchronized state visible on this device.
            // Closed devices perform the equivalent fallback in storage.get().
            await changeStorageMode(STORAGE_MODES.LOCAL, state.data);
            for (const listener of remoteSyncUpdateListeners) {
              listener({ type: 'deleted' });
            }
            return;
          }
        }

        const persisted = await storage.get(null);
        // Another edit may have started while the asynchronous read ran. Its
        // storage event will refresh again after it finishes.
        if (queue !== persistenceQueue) return;
        const dataChanged = replacePersistedData(persisted);
        if (dataChanged) debug.info('Data refreshed from storage', refreshChange);

        if (
          dataChanged
          && refreshChange?.areaName === STORAGE_MODES.SYNC
          && refreshChange.origin === 'other-device'
        ) {
          for (const listener of remoteSyncUpdateListeners) {
            listener({ type: 'updated' });
          }
        }
      } catch (err) {
        console.error('[STORE] Storage refresh failed:', err);
      }
    }, 50);
  });
}

/**
 * Notifies all subscribed listeners about a state change.
 * 
 * @param {AppState} state
 * @param {AppState} prevState
 */
function notify(state, prevState) {
  for (const listener of listeners) {
    listener(state, prevState);
  }
}

function createDefaultState() {
  return {
    data: createDefaultPersistedData(),
    ui: {
      isEditing: false,
      persistence: {
        status: 'idle',
        error: null,
        updatedAt: null
      },
      history: {
        canUndo: false,
        canRedo: false
      }
    }
  };
}
