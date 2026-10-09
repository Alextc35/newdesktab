import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getState: vi.fn(), requirePersistence: vi.fn(), retryPersistence: vi.fn(), flashError: vi.fn()
}));
vi.mock('../../src/state/appStore.js', () => ({ ...mocks, subscribe: vi.fn() }));
vi.mock('../../src/platform/i18n/i18n.js', () => ({ t: key => key, subscribeLanguageChange: vi.fn() }));
vi.mock('../../src/shared/ui/flash.js', () => ({ flashError: mocks.flashError, flashSuccess: vi.fn() }));
vi.mock('../../src/shared/ui/modalManager.js', () => ({ subscribeModalChanges: vi.fn() }));

let runPersistedAction;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.getState.mockReturnValue({ ui: { persistence: { status: 'error' } } });
  mocks.requirePersistence.mockResolvedValue(undefined);
  mocks.retryPersistence.mockResolvedValue(undefined);
  ({ runPersistedAction } = await import('../../src/features/persistence/persistedAction.js'));
});

test('a repeated failed destructive command retries persistence without repeating its mutation', async () => {
  const operation = vi.fn(() => ({ removed: 2 }));
  const onSaved = vi.fn();
  mocks.requirePersistence.mockRejectedValueOnce(new Error('Full storage'));
  expect(await runPersistedAction('delete', operation, onSaved)).toBe(false);
  expect(onSaved).not.toHaveBeenCalled();
  expect(await runPersistedAction('delete', operation, onSaved)).toBe(true);
  expect(operation).toHaveBeenCalledTimes(1);
  expect(mocks.retryPersistence).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledWith({ removed: 2 });
});

test('success of one command cannot acknowledge a second command whose write is still pending', async () => {
  let finishFirst;
  let finishSecond;
  mocks.requirePersistence
    .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
  const firstSaved = vi.fn();
  const secondSaved = vi.fn();
  const first = runPersistedAction('first', () => 1, firstSaved);
  const second = runPersistedAction('second', () => 2, secondSaved);
  await vi.waitFor(() => expect(finishSecond).toBeTypeOf('function'));
  finishFirst();
  await first;
  expect(firstSaved).toHaveBeenCalledOnce();
  expect(secondSaved).not.toHaveBeenCalled();
  finishSecond();
  await second;
  expect(secondSaved).toHaveBeenCalledWith(2);
});
