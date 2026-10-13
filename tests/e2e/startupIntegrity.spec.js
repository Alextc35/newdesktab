import { readFile } from 'node:fs/promises';
import { expect, test } from './helpers/test.js';

for (const missingId of ['folder-editor-outer-color-reset', 'folder-editor-image-toggle']) {
  test(`reports ${missingId} at startup and keeps an incomplete folder editor inactive`, async ({ page }) => {
    const errors = [];
    const startupMessages = [];
    let removedButton;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && message.text().includes('Could not initialize the page:')) {
        startupMessages.push(message.text());
      }
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/src/newtab.html') {
        const html = await readFile(new URL('../../src/newtab.html', import.meta.url), 'utf8');
        const body = html.replace(new RegExp(`<button id="${missingId}"[^>]*>[\\s\\S]*?</button>`), button => {
          removedButton = button;
          return '';
        });
        return route.fulfill({ contentType: 'text/html', body });
      }
      return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
    });
    await page.goto('/tests/browser-harness.html');
    await expect.poll(() => startupMessages.length).toBe(1);
    expect(startupMessages[0]).toContain(`Folder editor cannot initialize: missing #${missingId}`);
    expect(startupMessages[0]).toContain('requiredEditorElement');
    expect(startupMessages[0]).toContain('initFolderEditorModal');
    await page.evaluate(async () => {
      const { openCreateFolder, openFolderEditor } = await import('/src/features/folders/folderEditorModal.js');
      openCreateFolder();
      openFolderEditor('missing-folder');
    });
    await expect(page.locator('#edit-folder-modal')).toBeHidden();
    expect(errors).toEqual([]);

    // Restoring the missing control allows a fresh initialization: the failed
    // preflight did not register duplicate controls or seal the editor as ready.
    await page.evaluate(async ({ id, markup }) => {
      const parent = id === 'folder-editor-image-toggle'
        ? document.getElementById('folder-editor-image').parentElement
        : document.getElementById('folder-editor-outer-color').parentElement;
      parent.insertAdjacentHTML('beforeend', markup);
      const { initFolderEditorModal, openCreateFolder } = await import('/src/features/folders/folderEditorModal.js');
      initFolderEditorModal();
      initFolderEditorModal();
      openCreateFolder();
    }, { id: missingId, markup: removedButton });
    await expect(page.locator('#edit-folder-modal')).toBeVisible();
    await expect(page.locator('#edit-folder-modal .editor-looks')).toHaveCount(1);
    await page.locator('#edit-folder-modal-cancel').click();
    await expect(page.locator('#edit-folder-modal')).toBeHidden();
    expect(errors).toEqual([]);
  });
}
