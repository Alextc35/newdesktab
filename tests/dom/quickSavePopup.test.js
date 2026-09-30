import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';

vi.mock('../../src/state/appStore.js', () => ({
  hydrateStore: vi.fn(async () => {}),
  getState: vi.fn(() => ({ data: {
    settings: { interfaceTheme: 'system' },
    folders: []
  } }))
}));
vi.mock('../../src/platform/i18n/i18n.js', () => ({
  initI18n: vi.fn(async () => {}),
  applyI18n: vi.fn(),
  t: (key, params = {}) => {
    if (key === 'quickSave.mainWorkspace') return 'Principal';
    if (key === 'quickSave.savedIn') return `En ${params.location}`;
    return key;
  }
}));
vi.mock('../../src/shared/ui/interfaceTheme.js', () => ({
  applyInterfaceTheme: vi.fn()
}));
vi.mock('../../src/features/workspaces/workspaceSelectors.js', () => ({
  getActiveWorkspaceId: () => null
}));
vi.mock('../../src/features/quick-save/quickSaveModel.js', () => ({
  getQuickSaveWorkspaces: () => [{ id: null }],
  getQuickSaveFolders: () => [],
  getQuickSaveMatches: vi.fn(() => [{ id: 'saved', groupId: null, folderId: null }]),
  isSaveableTabUrl: () => true
}));
vi.mock('../../src/features/quick-save/quickSaveActions.js', () => ({
  saveQuickBookmark: vi.fn()
}));

test('shows saved status and closes only the popup after persistence succeeds', async () => {
  const html = readFileSync(join(process.cwd(), 'src/popup.html'), 'utf8');
  document.body.innerHTML = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  const closePopup = vi.spyOn(window, 'close').mockImplementation(() => {});
  const removeTab = vi.fn();
  globalThis.chrome = {
    tabs: {
      query: vi.fn(async () => [{ id: 42, title: 'Example', url: 'https://example.com' }]),
      remove: removeTab,
      create: vi.fn()
    },
    runtime: { getURL: path => `chrome-extension://test/${path}` }
  };

  const { saveQuickBookmark } = await import('../../src/features/quick-save/quickSaveActions.js');
  saveQuickBookmark
    .mockResolvedValueOnce({ reason: 'storage-error' })
    .mockResolvedValueOnce({ reason: null, bookmark: { id: 'saved' } });
  await import('../../src/popup.js');
  await vi.waitFor(() => {
    expect(document.getElementById('quick-save-name').value).toBe('Example');
  });
  for (const id of ['quick-save-name', 'quick-save-workspace', 'quick-save-folder']) {
    expect(document.getElementById(id).disabled).toBe(false);
  }
  expect(document.getElementById('quick-save-match').hidden).toBe(false);
  expect(document.getElementById('quick-save-match-detail').hidden).toBe(false);
  expect(document.getElementById('quick-save-match-detail').textContent).toBe('En Principal');

  const form = document.getElementById('quick-save-form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(saveQuickBookmark).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(document.getElementById('quick-save-status').textContent)
    .toBe('quickSave.saveError'));
  expect(closePopup).not.toHaveBeenCalled();

  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(closePopup).toHaveBeenCalledOnce());
  expect(removeTab).not.toHaveBeenCalled();
});
