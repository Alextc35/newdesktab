import { expect } from '@playwright/test';

export async function expectAppSaved(page) {
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/state/appStore.js');
    return getState().ui.persistence.status;
  })).toBe('saved');
}

export async function expectAppReady(page) {
  const grid = page.locator('#bookmark-container');
  const timeouts = [5_000, 10_000];

  for (const [attempt, timeout] of timeouts.entries()) {
    try {
      await expect(grid).toHaveAttribute('tabindex', '-1', { timeout });
      return;
    } catch (error) {
      if (attempt === timeouts.length - 1) throw error;
      // A dropped module response leaves the static shell mounted forever.
      // Retry one clean navigation instead of waiting on a state it cannot reach.
      await page.reload();
    }
  }
}
