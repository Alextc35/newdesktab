import { expect, test } from './helpers/test.js';
import { expectAppReady } from './helpers/appReady.js';

const notes = page => page.locator('#release-notes-modal');
const readRecord = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-local')).newdesktabReleaseNotes);

async function start(page, query = 'fresh=1&release=1&tips=1', version = '1.0.0') {
  await page.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto(`/tests/browser-harness.html?version=${version}&${query}`);
  await expectAppReady(page);
}

async function information(page) {
  await page.keyboard.press('KeyS');
  await expect(page.locator('#settings-modal')).toBeVisible();
  await page.locator('[data-tab="settings-modal-tab-info"]').click();
}

test('first arrival offers release notes, then the guide, then a daily tip with a running timer', async ({ page }) => {
  await start(page);
  await expect(notes(page)).toBeVisible();
  await expect(page.locator('#release-notes-version')).toHaveText('v1.0.0');
  await expect(page.locator('#release-notes-continue')).toBeFocused();
  await expect(page.locator('#onboarding-modal')).toBeHidden();
  await page.waitForTimeout(1600);
  await expect(page.locator('#daily-tip')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-local')).newdesktabDailyTips)).toBeUndefined();
  await expect(page.locator('#bookmark-viewport')).toHaveAttribute('inert', '');
  const dataBefore = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
  expect([dataBefore.bookmarks.length, dataBefore.folders.length, dataBefore.widgets.length]).toEqual([0, 0, 0]);
  await page.keyboard.press('KeyB');
  await expect(page.locator('#edit-bookmark-modal')).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(page.locator('#release-notes-close')).toBeFocused();
  await page.locator('#release-notes-continue').click();
  await expect(notes(page)).toBeHidden();
  await expect(page.locator('#onboarding-modal')).toBeVisible();
  await expect(page.locator('#daily-tip')).toBeHidden();
  await page.locator('#onboarding-skip').click();
  await expect(page.locator('#daily-tip')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect.poll(() => page.locator('.daily-tip-progress-fill').evaluate(element => element.getAnimations()[0]?.playState)).toBe('running');
  const time = await page.locator('.daily-tip-progress-fill').evaluate(element => element.getAnimations()[0].currentTime);
  await page.waitForTimeout(200);
  expect(await page.locator('.daily-tip-progress-fill').evaluate(element => element.getAnimations()[0].currentTime)).toBeGreaterThan(time);
  expect(await readRecord(page)).toEqual({ version: '1.0.0' });
  await page.reload();
  await expectAppReady(page);
  await expect(notes(page)).toBeHidden();
  await expect(page.locator('#onboarding-modal')).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data)).toEqual(dataBefore);
});

test('existing profiles see the release once and Escape leaves their workspace untouched', async ({ page }) => {
  await start(page, 'release=1');
  await expect(notes(page)).toBeVisible();
  const before = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
  await page.keyboard.press('Escape');
  await expect(notes(page)).toBeHidden();
  await expect(page.locator('#onboarding-modal')).toBeHidden();
  await page.reload();
  await expectAppReady(page);
  await expect(notes(page)).toBeHidden();
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data)).toEqual(before);
});

test('a new patch is offered once, older notes remain readable, and downgrading does not repeat the alert', async ({ page }) => {
  await start(page, 'release=1', '1.1.1');
  await expect(notes(page)).toBeVisible();
  await expect(page.locator('#release-notes-version')).toHaveText('v1.1.1');
  await page.locator('#release-notes-continue').click();
  await page.goto('/tests/browser-harness.html?release=1&version=1.1.2');
  await expectAppReady(page);
  await expect(notes(page)).toBeVisible();
  await expect(page.locator('#release-notes-version')).toHaveText('v1.1.2');
  await expect(page.locator('#release-notes-title')).toHaveText('Sync without switching modes');
  await expect(page.locator('#release-notes-intro')).toContainText('Chrome Sync');
  await expect(page.locator('#release-notes-intro')).toContainText('without switching to Local');
  await expect(page.locator('#release-notes-content')).toContainText('when you return to a tab');
  await expect(page.locator('#release-notes-content')).toContainText('while the desktop opens');
  await page.locator('#release-notes-continue').click();
  await page.reload();
  await expectAppReady(page);
  await expect(notes(page)).toBeHidden();
  await information(page);
  await page.locator('#settings-open-release-notes').click();
  await expect(page.locator('#release-notes-history')).toBeVisible();
  await expect(page.locator('#release-notes-history button')).toHaveText(['v1.1.2', 'v1.1.1', 'v1.1.0', 'v1.0.1', 'v1.0.0']);
  await page.locator('#release-notes-history').getByRole('button', { name: 'v1.1.0', exact: true }).click();
  await expect(page.locator('#release-notes-title')).toHaveText('Your Chrome bookmarks, at home in New DeskTab');
  await expect(page.locator('#release-notes-intro')).toContainText('Main');
  await page.locator('#release-notes-history').getByRole('button', { name: 'v1.0.1', exact: true }).click();
  await expect(page.locator('#release-notes-intro')).toContainText('JSON and ZIP backups');
  await page.locator('#release-notes-history').getByRole('button', { name: 'v1.0.0', exact: true }).click();
  await expect(page.locator('#release-notes-title')).toHaveText('Your desktop of websites. At last.');
  await expect(page.locator('#release-notes-content')).toContainText('still a work in progress');
  await page.goto('/tests/browser-harness.html?release=1&version=1.1.0');
  await expectAppReady(page);
  await expect(notes(page)).toBeHidden();
  expect(await readRecord(page)).toEqual({ version: '1.1.2' });
});

for (const language of ['es', 'es_419']) {
  test(`the latest notes, older import notes and import confirmation use Principal in ${language}`, async ({ page }) => {
    await start(page, 'release=1', '1.1.1');
    await expect(notes(page)).toBeVisible();
    await page.evaluate(async language => {
      await (await import('/src/platform/i18n/i18n.js')).changeLanguage({ language });
    }, language);
    await expect(page.locator('#release-notes-title')).toHaveText('Un escritorio más fluido');
    await expect(page.locator('#release-notes-intro')).toContainText('Los paneles ocultos ya no parpadean al iniciar.');
    await expect(page.locator('#release-notes-content')).toContainText('Mantener tamaño es ahora la opción predeterminada');
    await expect(page.locator('#release-notes-content')).toContainText('Se respetan las preferencias guardadas.');
    await page.locator('#release-notes-continue').click();
    await information(page);
    await page.locator('#settings-open-release-notes').click();
    await page.locator('#release-notes-history').getByRole('button', { name: 'v1.1.0', exact: true }).click();
    await expect(page.locator('#release-notes-intro')).toContainText('en Principal');
    await expect(page.locator('#release-notes-intro')).not.toContainText(/\bMain\b/);
    await page.locator('#release-notes-continue').click();
    await page.locator('[data-tab="settings-modal-tab-bookmark"]').click();
    await expect(page.locator('[data-i18n="browserImport.settingsDescription"]')).toContainText('en Principal');
    await page.locator('#import-html-bookmarks-input').setInputFiles({
      name: 'favoritos.html', mimeType: 'text/html',
      buffer: Buffer.from('<DL><DT><A HREF="https://principal.example/">Favorito</A></DL>')
    });
    await expect(page.locator('#browser-bookmark-import-details')).toContainText('en Principal');
    await page.locator('#browser-bookmark-import-confirm').click();
    await expect(page.locator('#alert-modal')).toBeVisible();
    await expect(page.locator('#alert-modal')).toContainText('en Principal');
    await expect(page.locator('#alert-modal')).not.toContainText(/\bMain\b/);
  });
}

test('Information keeps the settings draft and release history is localized in every language', async ({ page }) => {
  await start(page, 'release=1');
  await expect(notes(page)).toBeVisible();
  await page.locator('#release-notes-continue').click();
  const before = await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
  await information(page);
  await page.locator('[data-tab="settings-modal-tab-general"]').click();
  await page.locator('input[name="interface-theme"][value="dark"]').check();
  for (const [language, title, clock, settingsTitle] of [
    ['es', 'Tu escritorio de webs. Por fin.', 'todavía está en desarrollo', 'Notas de versión'],
    ['es_419', 'Tu escritorio de webs. Por fin.', 'todavía está en desarrollo', 'Notas de versión'],
    ['pt_BR', 'Seu desktop de sites. Finalmente.', 'ainda está em desenvolvimento', 'Notas de versão'],
    ['en', 'Your desktop of websites. At last.', 'still a work in progress', 'Release notes']
  ]) {
    await page.locator('[data-tab="settings-modal-tab-general"]').click();
    await page.locator('#language-select').selectOption(language);
    await page.locator('[data-tab="settings-modal-tab-info"]').click();
    await expect(page.locator('[data-i18n="releaseNotes.settingsTitle"]')).toHaveText(settingsTitle);
    await page.locator('#settings-open-release-notes').click();
    await expect(page.locator('#release-notes-title')).toHaveText(title);
    await expect(page.locator('#release-notes-content')).toContainText(clock);
    await expect(page.locator('#release-notes-date')).not.toBeEmpty();
    expect(await page.locator('.release-notes-reading').evaluate(element => element.scrollTop)).toBe(0);
    await page.locator('.release-notes-reading').evaluate(element => element.scrollTop = element.scrollHeight);
    await page.locator('#release-notes-continue').click();
    await expect(page.locator('#settings-open-release-notes')).toBeFocused();
    await page.locator('[data-tab="settings-modal-tab-general"]').click();
    await expect(page.locator('input[name="interface-theme"][value="dark"]')).toBeChecked();
  }
  await page.locator('#settings-modal-cancel').click();
  expect(await readRecord(page)).toEqual({ version: '1.0.0' });
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data)).toEqual(before);
});

test('the daily tip waits behind release history and settings, then opens its manual topic', async ({ page }) => {
  await start(page, 'release=1&tips=1');
  await expect(notes(page)).toBeVisible();
  await expect(page.locator('#daily-tip')).toBeHidden();
  await page.locator('#release-notes-continue').click();
  await expect(page.locator('#daily-tip')).toBeVisible();
  await information(page);
  await page.locator('#settings-open-release-notes').click();
  await expect(notes(page)).toBeVisible();
  await expect(page.locator('#daily-tip')).toBeHidden();
  await page.locator('#release-notes-continue').click();
  await page.locator('#settings-modal-cancel').click();
  await expect(page.locator('#daily-tip')).toBeVisible();
  await page.locator('#daily-tip-read').click();
  await expect(page.locator('#manual-modal')).toBeVisible();
  await expect(notes(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#manual-modal')).toBeHidden();
  await expect(page.locator('#daily-tip')).toBeHidden();
});

test('restoring a backup or clearing workspace data does not rearm the release notice', async ({ page }) => {
  await start(page, 'release=1');
  await expect(notes(page)).toBeVisible();
  await page.locator('#release-notes-continue').click();
  expect(await page.evaluate(async () => {
    const { getState, clearAllLocalData } = await import('/src/state/appStore.js');
    const { createBackupEnvelope } = await import('/src/platform/storage/dataSchema.js');
    const { importBackup } = await import('/src/features/settings/backupActions.js');
    const backup = createBackupEnvelope(getState().data);
    if (JSON.stringify(backup).includes('newdesktabReleaseNotes')) return false;
    await clearAllLocalData();
    return importBackup(new File([JSON.stringify(backup)], 'restored.json', { type: 'application/json' }));
  })).toBe(true);
  await page.reload();
  await expectAppReady(page);
  await expect(notes(page)).toBeHidden();
  expect(await readRecord(page)).toEqual({ version: '1.0.0' });
});

test('disabled daily tips remain disabled during the release introduction', async ({ page }) => {
  await start(page, 'fresh=1&tips=1');
  await expect(page.locator('#onboarding-modal')).toBeVisible();
  await page.locator('#onboarding-skip').click();
  await page.evaluate(async () => {
    await (await import('/src/platform/storage/deviceDailyTips.js')).setDailyTipsEnabled(false);
    await new Promise(resolve => chrome.storage.local.remove('newdesktabReleaseNotes', resolve));
  });
  await page.goto('/tests/browser-harness.html?fresh=1&release=1&tips=1');
  await expectAppReady(page);
  await expect(notes(page)).toBeVisible();
  await page.locator('#release-notes-continue').click();
  await page.waitForTimeout(1600);
  await expect(page.locator('#daily-tip')).toBeHidden();
});

test('list mode defers notes and the guide and hides tips without consuming unseen content', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await start(page);
  await expect(notes(page)).toBeHidden();
  await expect(page.locator('#onboarding-modal')).toBeHidden();
  await expect(page.locator('#daily-tip')).toBeHidden();
  await expect(page.locator('.flash-info').last()).toHaveText('Widen the window to use this feature.');
  expect(await readRecord(page)).toBeUndefined();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('newdesktab-test-local')).newdesktabOnboarding)).toBeUndefined();
  await page.setViewportSize({ width: 601, height: 800 });
  await expect(notes(page)).toBeVisible();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(notes(page)).toBeHidden();
  await expect(page.locator('.flash-info').last()).toHaveText('Panel hidden. Widen the window to continue.');
  await page.setViewportSize({ width: 601, height: 800 });
  await expect(notes(page)).toBeVisible();
  await page.locator('#release-notes-continue').click();
  await expect(page.locator('#onboarding-modal')).toBeVisible();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.locator('#onboarding-modal')).toBeHidden();
  await page.setViewportSize({ width: 601, height: 800 });
  await expect(page.locator('#onboarding-modal')).toBeVisible();
  await page.locator('#onboarding-skip').click();
  await expect(page.locator('#daily-tip')).toBeVisible();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.locator('#daily-tip')).toBeHidden();
  await expect(page.locator('.flash-info').last()).toHaveText('Panel hidden. Widen the window to continue.');
  await expect.poll(() => page.locator('.daily-tip-progress-fill').evaluate(element => element.getAnimations()[0]?.playState)).toBe('paused');
  await page.setViewportSize({ width: 601, height: 800 });
  await expect(page.locator('#daily-tip')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect.poll(() => page.locator('.daily-tip-progress-fill').evaluate(element => element.getAnimations()[0]?.playState)).toBe('running');
});

for (const width of [1280, 1007, 720]) {
  for (const theme of ['light', 'dark']) {
    test(`release notes fit and the subsequent daily card uses the correct corner at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await start(page);
      await expect(notes(page)).toBeVisible();
      await expect(page.locator('#daily-tip')).toBeHidden();
      await expect(page.locator('#release-notes-continue')).toBeInViewport();
      const layout = await notes(page).evaluate(element => {
        const card = element.querySelector('.release-notes-card').getBoundingClientRect();
        return { left: card.left, right: card.right, top: card.top, bottom: card.bottom,
          pageWidth: document.documentElement.scrollWidth,
          horizontalOverflow: element.querySelector('.release-notes-reading').scrollWidth
            > element.querySelector('.release-notes-reading').clientWidth };
      });
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(width);
      expect(layout.top).toBeGreaterThanOrEqual(0);
      expect(layout.bottom).toBeLessThanOrEqual(800);
      expect(layout.pageWidth).toBe(width);
      expect(layout.horizontalOverflow).toBe(false);
      await page.screenshot({ path: `test-results/release-notes-${width}-${theme}.png` });
      await page.locator('#release-notes-continue').click();
      await expect(page.locator('#onboarding-modal')).toBeVisible();
      await page.locator('#onboarding-skip').click();
      await expect(page.locator('#daily-tip')).toBeVisible();
      const tip = await page.locator('#daily-tip').boundingBox();
      expect(tip.y + tip.height).toBeCloseTo(776, 0);
      expect(tip.x + tip.width).toBeCloseTo(width - 24, 0);
      await page.screenshot({ path: `test-results/daily-tip-${width}-${theme}.png` });
    });
  }
}
