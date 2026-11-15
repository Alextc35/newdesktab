import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: null,
  preloadImages: vi.fn(),
  preloadVideos: vi.fn(),
  applyPageTheme: vi.fn()
}));

vi.mock('../../src/state/appStore.js', () => ({
  getState: () => mocks.state,
  getStorageMode: () => 'local'
}));
vi.mock('../../src/platform/images/localImages.js', () => ({ preloadLocalImages: mocks.preloadImages }));
vi.mock('../../src/platform/images/localVideos.js', () => ({ preloadLocalVideos: mocks.preloadVideos }));
vi.mock('../../src/shared/ui/pageTheme.js', () => ({ applyPageTheme: mocks.applyPageTheme }));
vi.mock('../../src/platform/i18n/i18n.js', () => ({ changeLanguage: vi.fn(), t: key => key }));
vi.mock('../../src/shared/diagnostics/debug.js', () => ({
  debug: { start: () => ({ mark() {}, end() {} }) }
}));
vi.mock('../../src/shared/ui/interfaceTheme.js', () => ({ applyInterfaceTheme: vi.fn() }));
vi.mock('../../src/features/keyboard/keyboardShortcutController.js', () => ({
  syncKeyboardShortcutAccessibility: vi.fn()
}));
vi.mock('../../src/features/grid/gridSelection.js', () => ({ clearGridItemSelection: vi.fn() }));
vi.mock('../../src/app/appShell.js', () => ({ updateAppShellEditing: vi.fn() }));
vi.mock('../../src/features/grid/gridKeyboardController.js', () => ({ clearGridKeyboardNavigation: vi.fn() }));
vi.mock('../../src/features/search/listSearch.js', () => ({ createListSearch: vi.fn() }));
vi.mock('../../src/shared/ui/viewportMode.js', () => ({ isListView: () => false }));
vi.mock('../../src/features/grid/gridLayout.js', () => ({
  updateGridSize: vi.fn(), getRowWidth: () => 100, getRowHeight: () => 100
}));
vi.mock('../../src/shared/grid/gridItemRegistry.js', () => ({
  gridItemRegistry: {
    entries: state => [{ definition: { render() {
      const card = document.createElement('article');
      card.textContent = state.data.settings.activeBookmarkGroupId ?? 'Main';
      return card;
    } } }]
  }
}));

import { createAppController } from '../../src/app/appController.js';
import { waitForGridRender } from '../../src/features/grid/gridRenderer.js';

let container;
let controller;
let initial;
let replacements;

beforeEach(() => {
  document.body.innerHTML = '<nav id="floating-menu"></nav><nav id="workspace-toolbar"></nav>'
    + '<main id="bookmark-container"></main>';
  container = document.getElementById('bookmark-container');
  initial = stateFor(null);
  mocks.state = initial;
  mocks.preloadImages.mockReset();
  mocks.preloadVideos.mockReset().mockResolvedValue(undefined);
  mocks.applyPageTheme.mockReset().mockImplementation(settings => {
    document.documentElement.dataset.wallpaper = settings.activeBookmarkGroupId ?? 'Main';
  });
  controller = createAppController({ container });
  controller.handleStateChange(initial, null);
  mocks.applyPageTheme.mockClear();
  replacements = vi.spyOn(container, 'replaceChildren');
});

test('keeps the transition waiting when a newer view is requested during media preparation', async () => {
  const alphaMedia = deferred();
  const betaMedia = deferred();
  mocks.preloadImages.mockReturnValueOnce(alphaMedia.promise).mockReturnValueOnce(betaMedia.promise);
  const alpha = stateFor('Alpha');
  schedule(alpha, initial);
  let ready = false;
  const waiting = waitForGridRender(container).then(() => { ready = true; });
  schedule(stateFor('Beta'), alpha);

  alphaMedia.resolve();
  await flushTasks();
  expect(ready).toBe(false);
  expect(container.textContent).toBe('Main');
  expect(document.documentElement.dataset.wallpaper).toBe('Main');
  expect(replacements).not.toHaveBeenCalled();

  betaMedia.resolve();
  await waiting;
  expect(ready).toBe(true);
  expect(container.textContent).toBe('Beta');
  expect(document.documentElement.dataset.wallpaper).toBe('Beta');
  expect(replacements).toHaveBeenCalledTimes(1);
});

for (const completion of ['resolve', 'reject']) {
  test(`an older preload that finishes last via ${completion} cannot repaint the current workspace`, async () => {
    const alphaMedia = deferred();
    const betaMedia = deferred();
    mocks.preloadImages.mockReturnValueOnce(alphaMedia.promise).mockReturnValueOnce(betaMedia.promise);
    const alpha = stateFor('Alpha');
    schedule(alpha, initial);
    schedule(stateFor('Beta'), alpha);
    betaMedia.resolve();
    await waitForGridRender(container);
    expect(container.textContent).toBe('Beta');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    alphaMedia[completion](new Error('Superseded image read'));
    await flushTasks();
    expect(container.textContent).toBe('Beta');
    expect(document.documentElement.dataset.wallpaper).toBe('Beta');
    expect(replacements).toHaveBeenCalledTimes(1);
    expect(mocks.applyPageTheme).toHaveBeenCalledTimes(1);
    expect(errorLog).not.toHaveBeenCalled();
  });
}

test('still renders the current workspace when its own media preparation fails', async () => {
  const media = deferred();
  mocks.preloadImages.mockReturnValue(media.promise);
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  schedule(stateFor('Alpha'), initial);
  media.reject(new Error('Current image unavailable'));
  await waitForGridRender(container);
  expect(container.textContent).toBe('Alpha');
  expect(document.documentElement.dataset.wallpaper).toBe('Alpha');
  expect(replacements).toHaveBeenCalledTimes(1);
  expect(errorLog).toHaveBeenCalledOnce();
});

function schedule(state, previous) {
  mocks.state = state;
  controller.handleStateChange(state, previous);
}

function stateFor(workspaceId) {
  return {
    data: {
      bookmarks: [], folders: [], widgets: [], trash: [], recycleBin: {},
      settings: {
        activeBookmarkGroupId: workspaceId,
        mainWorkspace: { themeEnabled: false },
        bookmarkGroups: ['Alpha', 'Beta'].map(id => ({ id, themeEnabled: false })),
        theme: { backgroundDefault: true }, keyboardShortcuts: {},
        showLauncher: true, showWorkspaceToolbar: true
      }
    },
    ui: { isEditing: false }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function flushTasks() {
  return new Promise(resolve => setTimeout(resolve, 0));
}
