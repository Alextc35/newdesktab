import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  countBrowserBookmarks, parseBrowserBookmarksHtml, prepareBrowserBookmarkImport,
  safeImportedBookmarkUrl
} from '../src/domain/bookmarks/browserBookmarkImport.js';
import { migratePersistedData, createBackupEnvelope, parseBackupPayload } from '../src/platform/storage/dataSchema.js';

const Parser = new JSDOM('').window.DOMParser;
const emptyData = () => migratePersistedData({ bookmarks: [], folders: [] });
const source = [{ id: '0', children: [{ id: '1', title: 'Bookmarks bar', children: [
  { title: 'Before', url: 'https://before.test', dateAdded: 1000 },
  { title: 'Work & study', children: [
    { title: 'Deep', children: [{ title: 'Document', url: 'https://document.test' }] }
  ] },
  { title: 'After', url: 'chrome://settings/' }
] }] }];

test('counts user folders inside native browser roots without counting the roots themselves', () => {
  const tree = [{ id: '0', children: [
    { id: '1', title: 'Localized toolbar', children: [
      { id: '2', title: 'User folder', children: [
        { title: 'Safe', url: 'https://safe.test' },
        { title: 'Unsafe', url: 'javascript:alert(1)' }
      ] },
      { id: '3', title: 'Empty user folder', children: [] }
    ] },
    { id: '2', title: 'Localized other bookmarks', children: [] },
    { id: '3', title: 'Localized mobile bookmarks', children: [] }
  ] }];
  const original = structuredClone(tree);
  assert.deepEqual(countBrowserBookmarks(tree), { bookmarkCount: 1, folderCount: 2, skippedCount: 1 });
  assert.deepEqual(tree, original);
});

test('recognizes browser root metadata while counting ordinary top-level and nested folders', () => {
  const tree = [
    { id: 'toolbar-account', folderType: 'bookmarks-bar', children: [
      { title: 'Nested user folder', children: [] }
    ] },
    { id: 'other-account', folderType: 'other', children: [] },
    { id: 'mobile-account', folderType: 'mobile', children: [] },
    { title: 'User collection', children: [] }
  ];
  assert.deepEqual(countBrowserBookmarks(tree), { bookmarkCount: 0, folderCount: 2, skippedCount: 0 });
});

test('empty browser roots do not make an empty import valid but a user folder does', () => {
  const tree = [{ id: '0', children: [
    { id: '1', title: 'Toolbar', children: [] },
    { id: '2', title: 'Other', children: [] }
  ] }];
  assert.deepEqual(countBrowserBookmarks(tree), { bookmarkCount: 0, folderCount: 0, skippedCount: 0 });
  assert.throws(() => prepareBrowserBookmarkImport(tree, emptyData()), { code: 'EMPTY_BOOKMARK_IMPORT' });
  tree[0].children[0].children.push({ title: 'Empty user folder', children: [] });
  assert.deepEqual(countBrowserBookmarks(tree), { bookmarkCount: 0, folderCount: 1, skippedCount: 0 });
  assert.equal(prepareBrowserBookmarkImport(tree, emptyData()).folderCount, 1);
});

test('native import keeps mixed order, dates, names, nested folders and existing data', () => {
  const data = emptyData();
  data.settings.showRecycleBin = false;
  data.bookmarks.push({ id: 'existing', name: 'Existing', url: 'https://existing.test',
    gx: 5, gy: 5, w: 1, h: 1, groupId: null, folderId: null });
  const result = prepareBrowserBookmarkImport(source, data, { now: 2000 });
  const folders = result.data.folders;
  assert.equal(result.bookmarkCount, 3);
  assert.equal(result.folderCount, 2); // User folders only: Work and Deep.
  assert.equal(result.data.bookmarks[0].id, 'existing');
  const work = folders.find(item => item.name === 'Work & study');
  const deep = folders.find(item => item.name === 'Deep');
  assert.equal(folders.some(item => item.name === 'Bookmarks bar'), false);
  assert.equal(work.parentId, null);
  assert.equal(deep.parentId, work.id);
  assert.equal(work.gx, 1);
  assert.equal(result.data.bookmarks.find(item => item.name === 'After').gx, 2);
  assert.equal(result.data.bookmarks.find(item => item.name === 'Before').createdAt, 1000);
  assert.equal(result.data.bookmarks.find(item => item.name === 'Document').folderId, deep.id);
});

test('flat Other bookmarks become desktop links without empty browser buckets or a wrapper', () => {
  const tree = [{ id: '0', children: [
    { id: '1', title: 'Barra de marcadores', children: [] },
    { id: '2', title: 'Otros marcadores', children: [
      { title: 'New tab', url: 'chrome://newtab/' },
      { title: 'Twitch', url: 'https://twitch.tv/' }
    ] }
  ] }];
  const first = prepareBrowserBookmarkImport(tree, emptyData());
  assert.equal(first.folderCount, 0);
  assert.deepEqual(first.data.folders, []);
  assert.deepEqual(first.data.bookmarks.map(item => [item.name, item.folderId]), [['New tab', null], ['Twitch', null]]);
  const second = prepareBrowserBookmarkImport(tree, first.data);
  assert.equal(second.bookmarkCount, 0);
  assert.equal(second.duplicateCount, 2);
  assert.deepEqual(second.data.folders, []);
  assert.equal(first.workspaceId, null);
  assert.ok(first.data.bookmarks.every(item => item.groupId === null));
  assert.deepEqual(first.data.settings.bookmarkGroups, []);
});

test('desktop import fills rows left to right and keeps source order across the twelfth column', () => {
  const tree = [{ id: '0', children: [{ id: '1', title: 'Toolbar', children:
    Array.from({ length: 15 }, (_, index) => ({ title: `Page ${index}`, url: `https://row.test/${index}` }))
  }] }];
  const data = emptyData();
  data.settings.showRecycleBin = false;
  const result = prepareBrowserBookmarkImport(tree, data);
  assert.deepEqual(result.data.bookmarks.map(bookmark => [bookmark.gx, bookmark.gy]),
    Array.from({ length: 15 }, (_, index) => [index % 12, Math.floor(index / 12)]));
  assert.deepEqual(result.data.bookmarks.slice(0, 3).map(bookmark => [bookmark.gx, bookmark.gy]), [[0, 0], [1, 0], [2, 0]]);
});

test('desktop import scans row-major holes while respecting bookmarks, folders, widgets and recycle bin', () => {
  const data = emptyData();
  data.bookmarks = [{ id: 'old', name: 'Old', url: 'https://old.test',
    gx: 0, gy: 0, w: 1, h: 1, groupId: null, folderId: null }];
  data.folders = [{ id: 'folder', name: 'Folder', gx: 2, gy: 0, w: 1, h: 1, groupId: null, parentId: null }];
  data.widgets = [{ id: 'clock', type: 'clock', gx: 3, gy: 0, w: 1, h: 1, groupId: null }];
  data.recycleBin = { ...data.recycleBin, gx: 4, gy: 0, w: 1, h: 1 };
  data.settings.showRecycleBin = true;
  const tree = [{ id: '0', children: [{ id: '1', title: 'Toolbar', children: [
    { title: 'One', url: 'https://one.test' }, { title: 'Two', url: 'https://two.test' }
  ] }] }];
  const result = prepareBrowserBookmarkImport(tree, data);
  assert.deepEqual(result.data.bookmarks.slice(1).map(bookmark => [bookmark.gx, bookmark.gy]), [[1, 0], [5, 0]]);
  assert.deepEqual(result.data.bookmarks[0], data.bookmarks[0]);
  assert.deepEqual(result.data.widgets, data.widgets);
  assert.deepEqual(result.data.recycleBin, data.recycleBin);
});

test('reimport preserves cards already arranged on Main and puts only new records into row-major holes', () => {
  const firstTree = [{ id: '0', children: [{ id: '1', title: 'Toolbar', children: [
    { title: 'Page', url: 'https://page.test' },
    { title: 'My folder', children: [{ title: 'Inside', url: 'https://inside.test' }] }
  ] }] }];
  const data = emptyData();
  data.settings.showRecycleBin = false;
  const first = prepareBrowserBookmarkImport(firstTree, data);
  const bookmark = first.data.bookmarks.find(item => item.name === 'Page');
  Object.assign(bookmark, { gx: 8, gy: 3, backgroundColor: '#123456', w: 2, h: 1 });
  const folder = first.data.folders.find(item => item.name === 'My folder');
  Object.assign(folder, { gx: 10, gy: 4, noOuterBackground: false, outerBackgroundColor: '#abcdef' });
  const tree = structuredClone(firstTree);
  tree[0].children[0].children.push({ title: 'New', url: 'https://new.test' });
  const result = prepareBrowserBookmarkImport(tree, first.data);
  assert.deepEqual(result.data.bookmarks.find(item => item.id === bookmark.id), bookmark);
  assert.deepEqual(result.data.folders.find(item => item.id === folder.id), folder);
  assert.deepEqual(result.data.bookmarks.filter(item => item.name === 'New').map(item => [item.gx, item.gy]), [[0, 0]]);
  assert.equal(result.duplicateCount, 2);
});

test('an overflow wrapper takes the first row-major hole without disturbing existing imported cards', () => {
  const first = prepareBrowserBookmarkImport([{ title: 'Pinned import', url: 'https://pinned.test' }], emptyData());
  Object.assign(first.data.bookmarks[0], { gx: 8, gy: 2 });
  first.data.bookmarks.push({ id: 'personal', name: 'Personal', url: 'https://personal.test',
    groupId: null, folderId: null, gx: 0, gy: 0, w: 1, h: 1 });
  const tree = [{ title: 'Pinned import', url: 'https://pinned.test' }, ...Array.from({ length: 80 }, (_, index) => ({
    title: `New ${index}`, url: `https://many.test/${index}`
  }))];
  const result = prepareBrowserBookmarkImport(tree, first.data);
  const wrapper = result.data.folders[0];
  assert.deepEqual([wrapper.gx, wrapper.gy], [1, 0]);
  assert.deepEqual(result.data.bookmarks.find(item => item.name === 'Pinned import'), first.data.bookmarks[0]);
  assert.ok(result.data.bookmarks.filter(item => item.name.startsWith('New ')).every(item => item.folderId === wrapper.id));
});

test('Main import reserves existing cards and uses one free cell for an overflow folder', () => {
  const data = emptyData();
  data.settings.showRecycleBin = false;
  data.bookmarks = Array.from({ length: 71 }, (_, index) => ({
    id: `existing-${index}`, name: `Existing ${index}`, url: `https://old.test/${index}`,
    groupId: null, folderId: null, gx: index % 12, gy: Math.floor(index / 12), w: 1, h: 1
  }));
  const tree = [{ id: '0', children: [{ id: '2', title: 'Other', children: [
    { title: 'One', url: 'https://one.test' }, { title: 'Two', url: 'https://two.test' }
  ] }] }];
  const result = prepareBrowserBookmarkImport(tree, data);
  assert.equal(result.folderCount, 1);
  const wrapper = result.data.folders[0];
  assert.deepEqual([wrapper.gx, wrapper.gy, wrapper.groupId], [11, 5, null]);
  assert.deepEqual(result.data.bookmarks.slice(0, 71), data.bookmarks);
  assert.ok(result.data.bookmarks.slice(71).every(bookmark => bookmark.folderId === wrapper.id));
  const full = { ...data, bookmarks: [...data.bookmarks, { ...data.bookmarks[0], id: 'last', gx: 11, gy: 5 }] };
  assert.throws(() => prepareBrowserBookmarkImport(tree, full), { code: 'MAIN_WORKSPACE_FULL' });
  assert.equal(full.bookmarks.length, 72);
});

test('reimport brings legacy imported records to Main and removes only an empty legacy workspace', () => {
  const tree = [{ id: '0', children: [{ id: '2', title: 'Other', children: [
    { title: 'One', url: 'https://one.test' }
  ] }] }];
  const initial = prepareBrowserBookmarkImport(tree, emptyData());
  const sourceId = initial.data.bookmarks[0].id.split('-b-')[0];
  const wrapperId = `${sourceId}-root`;
  const legacy = { ...initial.data,
    bookmarks: initial.data.bookmarks.map(bookmark => ({ ...bookmark, groupId: sourceId, folderId: wrapperId })),
    folders: [{ id: wrapperId, name: 'Imported', groupId: sourceId, parentId: null, gx: 0, gy: 0, w: 1, h: 1 }],
    settings: { ...initial.data.settings, bookmarkGroups: [{ id: sourceId, name: 'Old import' }], activeBookmarkGroupId: sourceId }
  };
  const result = prepareBrowserBookmarkImport(tree, legacy);
  assert.equal(result.bookmarkCount, 0);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.data.bookmarks[0].groupId, null);
  assert.equal(result.data.bookmarks[0].folderId, null);
  assert.deepEqual(result.data.folders, []);
  assert.deepEqual(result.data.settings.bookmarkGroups, []);
  const withPersonalBookmark = { ...legacy, bookmarks: [...legacy.bookmarks, {
    id: 'personal', name: 'Personal', url: 'https://personal.test', groupId: sourceId,
    folderId: wrapperId, gx: 1, gy: 0, w: 1, h: 1
  }] };
  const retained = prepareBrowserBookmarkImport(tree, withPersonalBookmark);
  assert.equal(retained.data.bookmarks.find(bookmark => bookmark.id === 'personal').folderId, wrapperId);
  assert.equal(retained.data.folders.find(folder => folder.id === wrapperId).groupId, sourceId);
  assert.equal(retained.data.settings.bookmarkGroups.length, 1);
  assert.equal(retained.data.bookmarks.find(bookmark => bookmark.id !== 'personal').groupId, null);
});

test('toolbar contents reach the desktop while Other bookmarks retain their separate folder', () => {
  const tree = [{ id: '0', children: [
    { id: '1', title: 'Toolbar localized', children: [
      { title: 'Toolbar page', url: 'https://toolbar.test' },
      { title: 'Real folder', children: [{ title: 'Nested', url: 'https://nested.test' }] }
    ] },
    { id: '2', title: 'Other localized', children: [{ title: 'Other page', url: 'https://other.test' }] },
    { id: '3', title: 'Mobile localized', children: [] }
  ] }];
  const result = prepareBrowserBookmarkImport(tree, emptyData());
  assert.deepEqual(result.data.folders.map(item => item.name).sort(), ['Other localized', 'Real folder']);
  const realFolder = result.data.folders.find(item => item.name === 'Real folder');
  const other = result.data.folders.find(item => item.name === 'Other localized');
  assert.equal(realFolder.parentId, null);
  assert.equal(other.parentId, null);
  assert.equal(result.data.bookmarks.find(item => item.name === 'Toolbar page').folderId, null);
  assert.equal(result.data.bookmarks.find(item => item.name === 'Other page').folderId, other.id);
  assert.equal(result.data.bookmarks.find(item => item.name === 'Nested').folderId, realFolder.id);
});

test('a browser bucket containing user folders is retained when the toolbar is empty', () => {
  const tree = [{ id: '0', children: [
    { id: '1', title: 'Empty toolbar', children: [] },
    { id: '2', title: 'Other', children: [{ title: 'Real folder', children: [] }] }
  ] }];
  const result = prepareBrowserBookmarkImport(tree, emptyData());
  assert.deepEqual(result.data.folders.map(item => item.name), ['Other', 'Real folder']);
  assert.equal(result.data.folders[1].parentId, result.data.folders[0].id);
});

test('large flat native collections get one accessible overflow folder, with stable repeated imports', () => {
  const tree = [{ id: '0', children: [{ id: '1', title: 'Toolbar', children:
    Array.from({ length: 1200 }, (_, index) => ({ title: `Page ${index}`, url: `https://large.test/${index}` }))
  }] }];
  const first = prepareBrowserBookmarkImport(tree, emptyData());
  assert.equal(first.folderCount, 1);
  assert.equal(first.data.folders.length, 1);
  assert.ok(first.data.bookmarks.every(item => item.folderId === first.data.folders[0].id));
  const repeat = prepareBrowserBookmarkImport(tree, first.data);
  assert.equal(repeat.folderCount, 0);
  assert.equal(repeat.duplicateCount, 1200);
  assert.equal(repeat.data.folders.length, 1);
});

test('HTML toolbar marker promotes its contents without flattening real user folders', () => {
  const tree = parseBrowserBookmarksHtml('<DL><DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Localized toolbar</H3><DL><DT><A HREF="https://one.test">One</A><DT><H3>Work</H3><DL></DL></DL></DL>', { Parser });
  const result = prepareBrowserBookmarkImport(tree, emptyData(), { source: 'html' });
  assert.equal(result.data.bookmarks[0].folderId, null);
  assert.deepEqual(result.data.folders.map(item => item.name), ['Work']);
});

test('HTML parser reads standard omitted DT closing tags, entities, empty folders and nested order', () => {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
  <TITLE>Bookmarks</TITLE><H1>Bookmarks</H1><DL><p>
    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Barra de marcadores</H3>
    <DL><p>
      <DT><A HREF="https://before.test/?a=1&amp;b=2" ADD_DATE="123">Antes &amp; después</A>
      <DT><H3>Trabajo</H3><DL><p><DT><H3>Vacía</H3><DL><p></DL><p>
      <DT><A HREF="https://inside.test">Dentro</A></DL><p>
      <DT><A HREF="https://after.test">Final</A>
    </DL><p>
    <DT><H3>Otros marcadores</H3><DL><p></DL><p>
  </DL><p>`;
  const tree = parseBrowserBookmarksHtml(html, { Parser });
  assert.deepEqual(tree.map(item => item.title), ['Barra de marcadores', 'Otros marcadores']);
  const bar = tree[0];
  assert.deepEqual(bar.children.map(item => item.title), ['Antes & después', 'Trabajo', 'Final']);
  assert.equal(bar.children[0].url, 'https://before.test/?a=1&b=2');
  assert.equal(bar.children[0].dateAdded, 123000);
  assert.deepEqual(bar.children[1].children.map(item => item.title), ['Vacía', 'Dentro']);
  assert.deepEqual(bar.children[1].children[0].children, []);
  assert.deepEqual(countBrowserBookmarks(tree), { bookmarkCount: 3, folderCount: 3, skippedCount: 0 });
});

test('imports large folders without truncation and repeats without multiplying intentional duplicates', () => {
  const children = Array.from({ length: 1200 }, (_, index) => ({ title: `Link ${index}`, url: `https://example.test/${index}` }));
  children.push({ title: 'Repeated', url: 'https://repeat.test' }, { title: 'Repeated', url: 'https://repeat.test' });
  const tree = [{ title: 'Large', children }, { title: 'Large', children: [{ title: 'Different folder', url: 'https://different.test' }] }];
  const first = prepareBrowserBookmarkImport(tree, emptyData());
  assert.equal(first.bookmarkCount, 1203);
  assert.equal(first.data.folders.filter(item => item.name === 'Large').length, 2);
  assert.equal(first.data.bookmarks.filter(item => item.url === 'https://repeat.test').length, 2);
  assert.equal(first.data.bookmarks.find(item => item.name === 'Link 1199').gy, 199);
  const repeated = prepareBrowserBookmarkImport(tree, first.data);
  assert.equal(repeated.bookmarkCount, 0);
  assert.equal(repeated.folderCount, 0);
  assert.equal(repeated.duplicateCount, 1203);
  assert.equal(repeated.data.settings.bookmarkGroups.length, 0);
});

test('ignores executable/relative URLs and never adopts exported markup', () => {
  const tree = parseBrowserBookmarksHtml(`<DL><DT><A HREF="javascript:alert(1)">Bad</A>
    <DT><A HREF="data:text/html,hello">Data</A><DT><A HREF="/relative">Relative</A>
    <DT><A HREF="https://safe.test" onclick="alert(1)"><b>Safe</b></A></DL>`, { Parser });
  const result = prepareBrowserBookmarkImport(tree, emptyData());
  assert.equal(result.skippedCount, 3);
  assert.equal(result.bookmarkCount, 1);
  assert.equal(result.data.bookmarks[0].name, 'Safe');
  assert.equal(Object.hasOwn(result.data.bookmarks[0], 'onclick'), false);
  assert.equal(safeImportedBookmarkUrl('java\nscript:alert(1)'), null);
  assert.throws(() => parseBrowserBookmarksHtml('<html>Not an export</html>', { Parser }), { code: 'INVALID_BOOKMARK_IMPORT' });
});

test('nested folders and recycled descendants survive migration and backup roundtrip', () => {
  const data = migratePersistedData({ bookmarks: [], folders: [
    { id: 'root', name: 'Root' }, { id: 'nested', name: 'Nested', parentId: 'root' },
    { id: 'cycle-a', parentId: 'cycle-b' }, { id: 'cycle-b', parentId: 'cycle-a' },
    { id: 'missing', parentId: 'does-not-exist' }
  ], trash: [{ id: 'trash', type: 'folder', folder: { id: 'deleted' }, folders: [
    { id: 'deleted-child', parentId: 'deleted' }
  ], bookmarks: [{ id: 'inside-child', folderId: 'deleted-child' }] }] });
  assert.equal(data.folders.find(item => item.id === 'nested').parentId, 'root');
  assert.equal(data.folders.find(item => item.id === 'cycle-a').parentId, null);
  assert.equal(data.folders.find(item => item.id === 'cycle-b').parentId, null);
  assert.equal(data.folders.find(item => item.id === 'missing').parentId, null);
  assert.equal(data.trash[0].folders[0].parentId, 'deleted');
  assert.equal(data.trash[0].bookmarks[0].folderId, 'deleted-child');
  assert.deepEqual(parseBackupPayload(createBackupEnvelope(data)), data);
  const invalid = createBackupEnvelope(data);
  invalid.data.trash[0].bookmarks[0].id = 'deleted-child';
  assert.throws(() => parseBackupPayload(invalid), { code: 'INVALID_BACKUP' });
});
