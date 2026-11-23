import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, expect, test, vi } from 'vitest';

vi.mock('../../src/features/bookmarks/bookmarkModal.js', () => ({ openEditBookmark: vi.fn() }));
vi.mock('../../src/features/folders/folderEditorModal.js', () => ({ openFolderEditor: vi.fn() }));
vi.mock('../../src/features/persistence/persistedAction.js', () => ({
  runPersistedAction: async (_key, operation, onSaved) => {
    const result = await operation();
    onSaved?.(result);
    return true;
  }
}));

let openFolderModal;
let setState;

beforeAll(async () => {
  const createArea = () => ({
    get(_keys, callback) { callback({}); },
    set(_items, callback) { callback?.(); },
    remove(_keys, callback) { callback?.(); }
  });
  globalThis.chrome = {
    runtime: { lastError: null, getManifest: () => ({ version: '1.0.1' }), getURL: path => path },
    storage: { local: createArea(), sync: createArea(), onChanged: { addListener() {} } }
  };
  globalThis.requestAnimationFrame = callback => callback();
  const html = readFileSync(join(process.cwd(), 'src/newtab.html'), 'utf8');
  document.documentElement.innerHTML = html.replace(/^.*?<html[^>]*>/s, '').replace(/<\/html>.*$/s, '');
  ({ setState } = await import('../../src/state/appStore.js'));
  const folderModal = await import('../../src/features/folders/folderModal.js');
  folderModal.initFolderModal();
  openFolderModal = folderModal.openFolderModal;
});

test('renders at most one page of a large folder and finds a bookmark on the last page', async () => {
  await setState({ data: {
    folders: [{ id: 'large', name: 'Large folder', groupId: null, parentId: null }],
    bookmarks: Array.from({ length: 5000 }, (_, index) => ({
      id: `large-${index}`, name: `Bookmark ${index}`, url: `https://example.test/${index}`,
      folderId: 'large', groupId: null, gx: index % 6, gy: Math.floor(index / 6)
    }))
  } });
  openFolderModal('large');
  const list = document.getElementById('folder-modal-items');
  expect(list.querySelectorAll('[data-bookmark-id]')).toHaveLength(54);
  expect(list.querySelector('[data-bookmark-id="large-0"]')).not.toBeNull();
  document.getElementById('folder-modal-next-page').click();
  expect(list.querySelectorAll('[data-bookmark-id]')).toHaveLength(54);
  expect(list.querySelector('[data-bookmark-id="large-54"]')).not.toBeNull();
  const search = document.getElementById('folder-modal-search');
  search.value = '/4999';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  expect(list.querySelectorAll('[data-bookmark-id]')).toHaveLength(1);
  expect(list.querySelector('[data-bookmark-id="large-4999"]')).not.toBeNull();
  expect(document.querySelector('.folder-pagination').hidden).toBe(true);
  document.getElementById('folder-modal-edit-toggle').click();
  expect(list.querySelectorAll('.folder-bookmark-actions')).toHaveLength(1);
});

test('opens real subfolders, preserves mixed order, and returns with breadcrumbs', async () => {
  await setState({ data: {
    folders: [
      { id: 'tree-root', name: 'Root', groupId: null, parentId: null },
      { id: 'tree-child', name: 'Child', groupId: null, parentId: 'tree-root', gx: 1, gy: 0 }
    ],
    bookmarks: [
      { id: 'before-child', name: 'Before', url: 'https://example.test', folderId: 'tree-root', gx: 0, gy: 0 },
      { id: 'after-child', name: 'After', url: 'https://example.test', folderId: 'tree-root', gx: 2, gy: 0 },
      { id: 'inside-child', name: 'Inside', url: 'https://example.test', folderId: 'tree-child', gx: 0, gy: 0 }
    ]
  } });
  openFolderModal('tree-root');
  const list = document.getElementById('folder-modal-items');
  expect([...list.children].map(element => element.dataset.bookmarkId ?? element.dataset.folderId))
    .toEqual(['before-child', 'tree-child', 'after-child']);
  list.querySelector('[data-folder-id="tree-child"] button').click();
  expect(document.getElementById('folder-modal-title').textContent).toBe('Child');
  expect(list.querySelector('[data-bookmark-id="inside-child"]')).not.toBeNull();
  expect(document.querySelector('.folder-breadcrumbs [aria-current="page"]').textContent).toBe('Child');
  document.querySelector('.folder-back').click();
  expect(document.getElementById('folder-modal-title').textContent).toBe('Root');
  expect(list.querySelector('[data-folder-id="tree-child"]')).not.toBeNull();
});

test('selects a compact row and moves it above and below a subfolder', async () => {
  await setState({ data: {
    folders: [
      { id: 'order-root', name: 'Root', groupId: null, parentId: null },
      { id: 'order-child', name: 'Child', groupId: null, parentId: 'order-root', gx: 1, gy: 0 }
    ],
    bookmarks: [
      { id: 'order-first', name: 'First', url: 'https://example.test/first', folderId: 'order-root', gx: 0, gy: 0 },
      { id: 'order-last', name: 'Last', url: 'https://example.test/last', folderId: 'order-root', gx: 2, gy: 0 }
    ]
  } });
  openFolderModal('order-root');
  document.getElementById('folder-modal-edit-toggle').click();
  const list = document.getElementById('folder-modal-items');
  const checkbox = list.querySelector('[data-bookmark-id="order-last"] .folder-row-select');
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  expect(document.querySelector('.folder-reorder-toolbar').hidden).toBe(false);
  document.getElementById('folder-move-up').click();
  const order = () => [...list.children].map(row => row.dataset.bookmarkId ?? row.dataset.folderId);
  await vi.waitFor(() => expect(order()).toEqual(['order-first', 'order-last', 'order-child']));
  await vi.waitFor(() => expect(document.getElementById('folder-move-down').disabled).toBe(false));
  expect(list.querySelector('[data-bookmark-id="order-last"] .folder-row-select').checked).toBe(true);
  document.getElementById('folder-move-down').click();
  await vi.waitFor(() => expect(order()).toEqual(['order-first', 'order-child', 'order-last']));
  expect(document.getElementById('folder-move-down').disabled).toBe(true);
  expect(list.parentElement.classList.contains('custom-scrollbar')).toBe(true);
});
