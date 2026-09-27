import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expectAppReady(page);
});

async function revealSideDock(page) {
  await page.mouse.move(5, page.viewportSize().height / 2);
  await expect.poll(async () => (await page.locator('#floating-menu').boundingBox())?.x)
    .toBeGreaterThanOrEqual(0);
}

async function waitForSaved(page) {
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/js/core/store.js');
    return getState().ui.persistence.status;
  })).toMatch(/^(idle|saved)$/);
}

test('creates, configures, resizes, persists and removes the bundled clock', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-clock').click();

  const modal = page.locator('#clock-widget-modal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#clock-widget-hour-cycle')).toHaveValue('24');
  await expect(page.locator('#clock-widget-show-seconds')).not.toBeChecked();
  await page.locator('#clock-widget-save').click();

  const clock = page.locator('.clock-widget[data-widget-type="clock"]');
  await expect(clock).toBeVisible();
  await expect(clock.locator('.clock-widget-time')).toHaveText(/^\d{2}:\d{2}$/);

  await revealSideDock(page);
  await page.getByRole('button', { name: '✎' }).click();
  await clock.locator('.item-action-button.edit').click();
  await page.locator('#clock-widget-hour-cycle').selectOption('12');
  await page.locator('#clock-widget-show-seconds').check();
  const preview = page.locator('#clock-widget-preview-time');
  const previewBeforeTick = await preview.textContent();
  await expect.poll(() => preview.textContent()).not.toBe(previewBeforeTick);
  await page.locator('#clock-widget-save').click();
  await expect(clock.locator('.clock-widget-time')).toHaveText(/^\d{2}:\d{2}:\d{2}\s?[AP]M$/i);

  await clock.locator('.resizer.right').click({ modifiers: ['Shift'] });
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/js/core/store.js');
    return getState().data.widgets[0]?.w;
  })).toBe(1);
  await expect(clock).toHaveClass(/is-single-cell/);
  await expect(clock.locator('.clock-widget-time-main')).toHaveText(/^\d{2}:\d{2}$/);
  await expect(clock.locator('.clock-widget-time-seconds')).toHaveText(/^\d{2}$/);
  const compactClockStyles = await clock.evaluate(element => {
    const time = element.querySelector('.clock-widget-time');
    const main = element.querySelector('.clock-widget-time-main');
    const detail = element.querySelector('.clock-widget-time-detail');
    const separator = element.querySelector('.clock-widget-time-separator');
    return {
      display: getComputedStyle(time).display,
      mainFontSize: Number.parseFloat(getComputedStyle(main).fontSize),
      detailFontSize: Number.parseFloat(getComputedStyle(detail).fontSize),
      separatorDisplay: getComputedStyle(separator).display
    };
  });
  expect(compactClockStyles.display).toBe('grid');
  expect(compactClockStyles.detailFontSize).toBeLessThan(compactClockStyles.mainFontSize);
  expect(compactClockStyles.separatorDisplay).toBe('none');

  await clock.locator('.resizer.right').click();
  await clock.locator('.resizer.right').click();
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/js/core/store.js');
    return getState().data.widgets[0]?.w;
  })).toBe(3);

  await waitForSaved(page);
  await page.reload();
  await expectAppReady(page);
  await expect(clock).toBeVisible();
  await expect(clock.locator('.clock-widget-time')).toHaveText(/^\d{2}:\d{2}:\d{2}\s?[AP]M$/i);
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/js/core/store.js');
    const widget = getState().data.widgets[0];
    return { w: widget?.w, config: widget?.config };
  })).toEqual({
    w: 3,
    config: { hourCycle: '12', showSeconds: true }
  });

  await revealSideDock(page);
  await page.getByRole('button', { name: '✎' }).click();
  await clock.locator('.item-action-button.edit').click();
  await page.locator('#clock-widget-delete').click();
  await page.locator('#alert-modal-accept').click();
  await expect(clock).toHaveCount(0);
  await expect(modal).toBeHidden();
  await expect.poll(() => page.evaluate(() => [...document.body.children]
    .filter(element => element.inert)
    .map(element => element.id || element.tagName))).toEqual([]);

  await page.locator('#history-undo').focus();
  await page.keyboard.press('Enter');
  await expect(clock).toBeVisible();
});

test('selects, moves and permanently deletes a clock through bulk actions', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-clock').click();
  await page.locator('#clock-widget-save').click();
  const clock = page.locator('.clock-widget[data-widget-type="clock"]');
  await expect(clock).toBeVisible();

  const workspaceDock = page.getByRole('navigation', { name: 'Workspace controls' });
  await workspaceDock.hover();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByPlaceholder('Work, leisure…').fill('Work');
  await page.getByRole('button', { name: 'Accept' }).click();
  await waitForSaved(page);

  const workspaceSelect = page.getByRole('combobox', { name: 'Workspace' });
  const workId = await workspaceSelect.inputValue();
  await workspaceSelect.selectOption('');
  await expect(clock).toBeVisible();

  await revealSideDock(page);
  await page.getByRole('button', { name: '✎' }).click();
  await clock.click();
  const bulkActions = page.getByRole('toolbar', { name: 'Selected item actions' });
  await expect(clock).toHaveClass(/is-selected/);
  await expect(bulkActions).toContainText('1 selected');
  await expect(bulkActions.getByRole('button', { name: 'Apply default style' })).toBeDisabled();
  await expect(bulkActions.getByRole('button', { name: 'Duplicate selection' })).toBeDisabled();

  await page.locator('#bulk-workspace-select').selectOption(workId);
  await expect(clock).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/js/core/store.js');
    return getState().data.widgets[0]?.groupId;
  })).toBe(workId);

  await workspaceSelect.selectOption(workId);
  await expect(clock).toBeVisible();
  await clock.click();
  await bulkActions.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('#alert-modal-title')).toHaveText(
    'Permanently delete this clock? This cannot be undone.'
  );
  await page.locator('#alert-modal-accept').click();
  await expect(clock).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/js/core/store.js');
    const { widgets, trash } = getState().data;
    return `${widgets.length}:${trash.length}`;
  })).toBe('0:0');
});

test('asks before permanently deleting a clock dropped on the recycle bin', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-clock').click();
  await page.locator('#clock-widget-save').click();

  const clock = page.locator('.clock-widget[data-widget-type="clock"]');
  const recycleBin = page.locator('.recycle-bin[data-recycle-bin-id]');
  await revealSideDock(page);
  await page.getByRole('button', { name: '✎' }).click();

  const dropClockOnRecycleBin = async () => {
    const clockBox = await clock.boundingBox();
    const recycleBinBox = await recycleBin.boundingBox();
    expect(clockBox).not.toBeNull();
    expect(recycleBinBox).not.toBeNull();
    await page.mouse.move(
      clockBox.x + clockBox.width / 2,
      clockBox.y + clockBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      recycleBinBox.x + recycleBinBox.width / 2,
      recycleBinBox.y + recycleBinBox.height / 2,
      { steps: 10 }
    );
    await expect(recycleBin).toHaveClass(/is-drop-target/);
    await expect(clock).toHaveClass(/is-drop-landing/);
    await page.mouse.up();
  };

  await dropClockOnRecycleBin();

  await expect(page.locator('#alert-modal-title')).toHaveText(
    'Permanently delete this clock? This cannot be undone.'
  );
  await expect(clock).toBeHidden();
  await expect(clock).toHaveClass(/is-drop-committed/);
  await page.locator('#alert-modal-cancel').click();
  await expect(clock).toBeVisible();
  await expect(clock).not.toHaveClass(/is-drop-committed/);
  await expect.poll(() => clock.evaluate(element => (
    element.classList.contains('is-drop-restoring')
  ))).toBe(false);

  await dropClockOnRecycleBin();
  await expect(clock).toBeHidden();
  await page.locator('#alert-modal-accept').click();
  await expect(clock).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const { getState } = await import('/src/js/core/store.js');
    const { widgets, trash } = getState().data;
    return `${widgets.length}:${trash.length}`;
  })).toBe('0:0');
});

test('treats keyboard deletion of a widget as permanent', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-clock').click();
  await page.locator('#clock-widget-save').click();
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/js/core/store.js');
    await setState({
      data: {
        bookmarks: [],
        folders: [],
        settings: { ...getState().data.settings, showRecycleBin: false }
      }
    });
  });

  const clock = page.locator('.clock-widget[data-widget-type="clock"]');
  await revealSideDock(page);
  await page.getByRole('button', { name: '✎' }).click();
  await page.locator('#bookmark-container').focus();
  await page.keyboard.press('Tab');
  await expect(clock).toHaveClass(/is-keyboard-active/);
  await page.keyboard.press('Delete');
  await expect(page.locator('#alert-modal-title')).toHaveText(
    'Permanently delete this clock? This cannot be undone.'
  );
  await page.locator('#alert-modal-accept').click();
  await expect(clock).toHaveCount(0);
});

test('renders the clock as an accessible row in compact view', async ({ page }) => {
  await revealSideDock(page);
  await page.locator('#add-toggle').click();
  await page.locator('#add-clock').click();
  await page.locator('#clock-widget-save').click();

  await page.setViewportSize({ width: 600, height: 700 });

  const grid = page.locator('#bookmark-container');
  const clock = grid.locator('.clock-widget-list-item[data-widget-type="clock"]');
  await expect(grid).toHaveClass(/is-list-view/);
  await expect(clock).toBeVisible();
  await expect(clock.locator('.bookmark-list-name')).toHaveText('Clock');
  await expect(clock.locator('time')).toHaveText(/^\d{2}:\d{2}$/);

  await clock.locator('.clock-widget-list-link').click();
  await expect(page.locator('#clock-widget-modal')).toBeVisible();
  await expect(page.locator('#clock-widget-delete')).toBeVisible();
});
