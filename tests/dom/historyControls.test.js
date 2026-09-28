import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flash: vi.fn(),
  redoBookmarks: vi.fn(),
  subscribe: vi.fn(),
  t: vi.fn(key => key),
  undoBookmarks: vi.fn()
}));

vi.mock('../../src/state/appStore.js', () => ({
  redoBookmarks: mocks.redoBookmarks,
  subscribe: mocks.subscribe,
  undoBookmarks: mocks.undoBookmarks
}));

vi.mock('../../src/platform/i18n/i18n.js', () => ({ t: mocks.t }));
vi.mock('../../src/shared/ui/flash.js', () => ({ flash: mocks.flash }));

import { initHistoryControls } from '../../src/features/history/historyControls.js';

test('history controls follow store state and route buttons and keyboard shortcuts', async () => {
  document.body.innerHTML = `
    <button id="history-undo" type="button">Undo</button>
    <button id="history-redo" type="button">Redo</button>
    <input id="editor">
  `;
  mocks.subscribe.mockImplementation(listener => listener({
    ui: { history: { canUndo: true, canRedo: true } }
  }));
  mocks.undoBookmarks.mockResolvedValue(true);
  mocks.redoBookmarks.mockResolvedValue(true);

  initHistoryControls();

  const undoButton = document.getElementById('history-undo');
  const redoButton = document.getElementById('history-redo');
  expect(undoButton.disabled).toBe(false);
  expect(redoButton.disabled).toBe(false);

  undoButton.click();
  redoButton.click();
  await vi.waitFor(() => {
    expect(mocks.undoBookmarks).toHaveBeenCalledTimes(1);
    expect(mocks.redoBookmarks).toHaveBeenCalledTimes(1);
    expect(mocks.flash).toHaveBeenCalledWith('flash.history.undone', 'info', 1000);
    expect(mocks.flash).toHaveBeenCalledWith('flash.history.redone', 'info', 1000);
  });

  mocks.undoBookmarks.mockClear();
  mocks.redoBookmarks.mockClear();
  document.getElementById('editor').focus();
  document.dispatchEvent(historyKey());
  expect(mocks.undoBookmarks).not.toHaveBeenCalled();

  document.body.tabIndex = -1;
  document.body.focus();
  document.dispatchEvent(historyKey());
  document.dispatchEvent(historyKey({ shiftKey: true }));
  await vi.waitFor(() => {
    expect(mocks.undoBookmarks).toHaveBeenCalledTimes(1);
    expect(mocks.redoBookmarks).toHaveBeenCalledTimes(1);
  });
});

function historyKey({ shiftKey = false } = {}) {
  return new KeyboardEvent('keydown', {
    key: 'z',
    ctrlKey: true,
    shiftKey,
    bubbles: true,
    cancelable: true
  });
}
