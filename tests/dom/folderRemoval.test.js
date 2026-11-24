import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ showAlert: vi.fn(), flashSuccess: vi.fn(), flashError: vi.fn() }));
vi.mock('../../src/shared/ui/alertModal.js', () => ({ showAlert: mocks.showAlert }));
vi.mock('../../src/shared/ui/flash.js', () => ({ ...mocks, flashInfo: vi.fn() }));
vi.mock('../../src/platform/i18n/i18n.js', () => ({
  t: (key, params) => `${key}:${JSON.stringify(params ?? {})}`, subscribeLanguageChange: vi.fn()
}));
vi.mock('../../src/shared/ui/draggableToolbar.js', () => ({
  makeToolbarDraggable: () => ({ resetPosition() {} })
}));
vi.mock('../../src/features/folders/folderModal.js', () => ({ openFolderModal: vi.fn() }));
vi.mock('../../src/features/folders/folderEditorModal.js', () => ({ openFolderEditor: vi.fn() }));
vi.mock('../../src/features/folders/folderCard.js', () => ({ createFolderElement: vi.fn(), enableFolderEditing: vi.fn() }));
vi.mock('../../src/features/folders/folderListItem.js', () => ({ createFolderListItem: vi.fn() }));

let store;
let confirmItemRecycle;
let restoreTrashEntries;
let folderGridItem;
let selection;
const storedData = {};
const folder = (id, parentId = null) => ({ id, name: id, parentId, groupId: null, gx: 0, gy: 0, w: 1, h: 1 });
const bookmark = (id, folderId = null) => ({ id, name: id, url: `https://example.test/${id}`,
  folderId, groupId: null, gx: 2, gy: 0, w: 1, h: 1 });

beforeAll(async () => {
  Object.defineProperty(navigator, 'locks', {
    configurable: true, value: { request: (_name, operation) => operation() }
  });
  const area = {
    get(keys, callback) {
      const requested = keys === null ? Object.keys(storedData) : Array.isArray(keys) ? keys : [keys];
      callback(Object.fromEntries(requested.filter(key => Object.hasOwn(storedData, key))
        .map(key => [key, structuredClone(storedData[key])])));
    },
    set(items, callback) { Object.assign(storedData, structuredClone(items)); callback?.(); },
    remove(keys, callback) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storedData[key];
      callback?.();
    }
  };
  globalThis.chrome = {
    runtime: { lastError: null, getManifest: () => ({ version: '1.1.1' }) },
    storage: { local: area, sync: area, onChanged: { addListener() {} } }
  };
  document.body.innerHTML = '<main id="bookmark-viewport"></main><div id="bulk-actions">'
    + '<strong id="bulk-selection-count"></strong><select id="bulk-workspace-select"></select>'
    + ['bulk-clear', 'bulk-apply-preset', 'bulk-duplicate', 'bulk-delete'].map(id => `<button id="${id}"></button>`).join('')
    + '</div>';
  store = await import('../../src/state/appStore.js');
  await store.hydrateStore();
  ({ confirmItemRecycle } = await import('../../src/features/grid/gridItemRemoval.js'));
  ({ restoreTrashEntries } = await import('../../src/features/recycle-bin/recycleBinActions.js'));
  ({ folderGridItem } = await import('../../src/features/folders/folderGridItem.js'));
  selection = await import('../../src/features/grid/gridSelection.js');
  (await import('../../src/features/grid/gridBulkActions.js')).initGridBulkActions();
});

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.showAlert.mockResolvedValue(false);
  selection.clearGridItemSelection();
  await store.setState({ data: {
    bookmarks: [], widgets: [], trash: [], folders: [folder('empty'), folder('root'), folder('child', 'root'),
      folder('grandchild', 'child')], settings: { ...store.getState().data.settings, showRecycleBin: false }
  } });
  await store.requirePersistence();
});

test.each(['empty', 'root', 'child'])('recycles %s without a dialog and persists a restorable folder tree', async id => {
  const before = store.getState().data.folders;
  await confirmItemRecycle('folder', id);
  expect(mocks.showAlert).not.toHaveBeenCalled();
  expect(store.getState().data.folders.some(item => item.id === id)).toBe(false);
  expect(storedData.folders.some(item => item.id === id)).toBe(false);
  const entry = store.getState().data.trash[0];
  expect(entry.type).toBe('folder');
  expect(entry.folder.id).toBe(id);
  expect(entry.bookmarks).toEqual([]);
  expect(storedData.trash[0].id).toBe(entry.id);
  expect(mocks.flashSuccess).toHaveBeenCalledWith('flash.recycleBin.moved');
  restoreTrashEntries([entry.id]);
  await store.requirePersistence();
  expect(store.getState().data.folders.map(item => [item.id, item.parentId]).sort())
    .toEqual(before.map(item => [item.id, item.parentId]).sort());
  expect(storedData.trash).toEqual([]);
});

test('requires confirmation for bookmarks anywhere in the subtree and retains them after cancellation', async () => {
  await store.setState({ data: { bookmarks: [bookmark('deep', 'grandchild')] } });
  await confirmItemRecycle('folder', 'root');
  expect(mocks.showAlert).toHaveBeenCalledWith('folder.confirmDelete:{"name":"root","count":1}', { type: 'confirm' });
  expect(store.getState().data.bookmarks.map(item => item.id)).toEqual(['deep']);
  expect(store.getState().data.trash).toEqual([]);
  mocks.showAlert.mockResolvedValue(true);
  await confirmItemRecycle('folder', 'root');
  expect(store.getState().data.trash[0].bookmarks.map(item => item.id)).toEqual(['deep']);
  expect(store.getState().data.trash[0].folders.map(item => item.id)).toEqual(['child', 'grandchild']);
});

test('bookmark removal still requires confirmation', async () => {
  await store.setState({ data: { bookmarks: [bookmark('page')] } });
  await confirmItemRecycle('bookmark', 'page');
  expect(mocks.showAlert).toHaveBeenCalledWith('alert.bookmark.confirmDelete:{"name":"page","count":0}', { type: 'confirm' });
  expect(store.getState().data.bookmarks).toHaveLength(1);
  expect(store.getState().data.trash).toEqual([]);
});

test('keyboard folder confirmation skips only empty recoverable trees and counts deep contents', async () => {
  const context = () => ({ item: store.getState().data.folders.find(item => item.id === 'root'), state: store.getState() });
  expect(folderGridItem.getRemovalConfirmation(context())).toBeNull();
  expect(folderGridItem.getRemovalConfirmation({ ...context(), permanent: true }))
    .toBe('folder.confirmPermanentDelete:{"name":"root","count":0}');
  await store.setState({ data: { bookmarks: [bookmark('deep', 'grandchild')] } });
  expect(folderGridItem.getRemovalConfirmation(context())).toBe('folder.confirmDelete:{"name":"root","count":1}');
});

test('bulk deletion of empty folder trees skips confirmation and retains descendants in trash', async () => {
  selection.toggleGridItemSelection('folder', 'empty');
  selection.toggleGridItemSelection('folder', 'root');
  document.getElementById('bulk-delete').click();
  await vi.waitFor(() => expect(store.getState().data.folders).toEqual([]));
  await vi.waitFor(() => expect(mocks.flashSuccess).toHaveBeenCalledWith('flash.bookmarks.deletedSelected'));
  expect(mocks.showAlert).not.toHaveBeenCalled();
  expect(storedData.trash).toHaveLength(2);
  expect(storedData.trash.find(entry => entry.folder.id === 'root').folders.map(item => item.id))
    .toEqual(['child', 'grandchild']);
  expect(selection.getSelectedGridItems()).toEqual([]);
});

test.each(['bookmark', 'widget', 'populated folder'])('bulk selection with a %s still requires confirmation', async kind => {
  await store.setState({ data: {
    bookmarks: [bookmark('page', kind === 'populated folder' ? 'grandchild' : null)],
    widgets: kind === 'widget' ? [{ id: 'clock', type: 'clock', gx: 3, gy: 0, w: 1, h: 1 }] : []
  } });
  selection.toggleGridItemSelection('folder', kind === 'populated folder' ? 'root' : 'empty');
  if (kind !== 'populated folder') selection.toggleGridItemSelection(kind, kind === 'widget' ? 'clock' : 'page');
  document.getElementById('bulk-delete').click();
  await vi.waitFor(() => expect(mocks.showAlert).toHaveBeenCalledOnce());
  expect(store.getState().data.trash).toEqual([]);
  expect(store.getState().data.folders).toHaveLength(4);
});
