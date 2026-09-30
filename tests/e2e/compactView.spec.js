import { expect, test } from '@playwright/test';
import { expectAppReady } from './helpers/appReady.js';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

async function start(page, width = 1280) {
  await page.setViewportSize({ width, height: 720 });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/tests/browser-harness.html');
  await expectAppReady(page);
  await expect(page.getByRole('link', { name: /DEVELOPED BY/ })).toBeVisible();
  await page.evaluate(async () => {
    const { DEFAULT_BOOKMARK } = await import('/src/domain/bookmarks/bookmarkDefaults.js');
    const { DEFAULT_FOLDER_STYLE } = await import('/src/domain/folders/folderDefaults.js');
    const { getState, setState } = await import('/src/state/appStore.js');
    const bookmarks = Array.from({ length: 20 }, (_, index) => ({
      ...DEFAULT_BOOKMARK, id: `compact-${index}`, name: `Bookmark ${index + 1}`,
      url: 'https://example.internal', gx: index % 10, gy: Math.floor(index / 10) + 2
    }));
    bookmarks[0].name = 'A long bookmark name that must remain readable in the list';
    bookmarks[0].showText = false;
    bookmarks[0].showFavicon = false;
    bookmarks[0].backgroundFavicon = false;
    bookmarks[1].url = 'http://127.0.0.1:4175/open/target';
    bookmarks.push(...Array.from({ length: 3 }, (_, index) => ({
      ...DEFAULT_BOOKMARK, id: `child-${index}`, name: `Folder bookmark ${index + 1}`,
      url: 'https://example.internal', folderId: 'compact-folder'
    })));
    const folders = [{ ...DEFAULT_FOLDER_STYLE, id: 'compact-folder', name: 'Games',
      gx: 2, gy: 0, w: 2, h: 2, groupId: null, createdAt: 1, updatedAt: 1 }];
    await setState({ data: { bookmarks, folders,
      settings: {
        ...getState().data.settings,
        interfaceTheme: 'dark',
        // These tests exercise bookmark/folder responsiveness. Keep the
        // bottom-right cell available instead of turning the drag into a
        // deliberate recycle-bin drop.
        showRecycleBin: false
      } } });
  });
  await expect(page.locator('#bookmark-container [data-folder-id="compact-folder"]')).toBeVisible();
  // Let storage normalization finish before comparing immutable data.
  await page.reload();
  await expectAppReady(page);
  await expect(page.locator('#bookmark-container [data-folder-id="compact-folder"]')).toBeVisible();
}

async function data(page) {
  return page.evaluate(async () => (await import('/src/state/appStore.js')).getState().data);
}

async function sideAction(page, id) {
  await page.mouse.move(5, page.viewportSize().height / 2);
  if (id === 'add-bookmark' || id === 'add-folder') {
    await page.locator('#add-toggle').click();
  }
  await page.locator(`#${id}`).click();
}

test('orders recycle bin, widgets, folders and bookmarks by grid position in list view', async ({ page }) => {
  await start(page);
  const before = await data(page);
  const recycleBinId = before.recycleBin.id;
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { data } = getState();
    const [folder] = data.folders;
    await setState({ data: {
      ...data,
      recycleBin: {
        ...data.recycleBin,
        gx: 11,
        gy: 5,
        noBackground: true,
        iconColor: '#ffaa00',
        textColor: '#00ff00',
        showName: false,
        showCount: true
      },
      folders: [
        { ...folder, gx: 8, gy: 4 },
        {
          ...folder,
          id: 'compact-folder-2',
          name: 'Earlier list folder',
          gx: 4,
          gy: 4
        }
      ],
      widgets: [
        { id: 'clock-later', type: 'clock', version: 1, gx: 8, gy: 1,
          w: 1, h: 1, groupId: null, config: {}, createdAt: 1, updatedAt: 1 },
        { id: 'clock-first', type: 'clock', version: 1, gx: 1, gy: 1,
          w: 1, h: 1, groupId: null, config: {}, createdAt: 1, updatedAt: 1 }
      ],
      settings: { ...data.settings, showRecycleBin: true }
    } });
  });

  await page.setViewportSize({ width: 430, height: 720 });
  const list = page.locator('#bookmark-container');
  await expect(list).toHaveClass(/is-list-view/);
  const recycleBinRow = list.locator('.bookmark-list-item').first();
  await expect(recycleBinRow).toHaveAttribute('data-recycle-bin-id', recycleBinId);
  await expect(recycleBinRow).toHaveClass(/is-recycle-bin-transparent/);
  await expect(recycleBinRow).toHaveClass(/is-recycle-bin-name-hidden/);
  await expect(recycleBinRow).toHaveCSS('color', 'rgb(0, 255, 0)');
  await expect(recycleBinRow.locator('.bookmark-list-name')).toBeHidden();
  await expect(recycleBinRow.locator('.bookmark-list-detail')).toBeVisible();
  await expect(recycleBinRow.locator('.recycle-bin-list-icon'))
    .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(recycleBinRow.locator('.recycle-bin-list-icon')).toHaveCSS('box-shadow', 'none');
  expect(await recycleBinRow.evaluate(element => (
    element.style.getPropertyValue('--recycle-bin-icon-color')
  ))).toBe('#ffaa00');
  await expect(list.locator('.bookmark-list-item').nth(1))
    .toHaveAttribute('data-widget-id', 'clock-first');
  await expect(list.locator('.bookmark-list-item').nth(2))
    .toHaveAttribute('data-widget-id', 'clock-later');
  await expect(list.locator('.bookmark-list-item').nth(3))
    .toHaveAttribute('data-folder-id', 'compact-folder-2');
  await expect(list.locator('.bookmark-list-item').nth(4))
    .toHaveAttribute('data-folder-id', 'compact-folder');
  await expect(list.locator('.bookmark-list-item').nth(5))
    .toHaveAttribute('data-bookmark-id', 'compact-0');

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(list).not.toHaveClass(/is-list-view/);
  const recycleBin = list.locator(`.recycle-bin[data-recycle-bin-id="${recycleBinId}"]`);
  await expect(recycleBin).toBeVisible();
  await expect(recycleBin).toHaveClass(/is-recycle-bin-transparent/);
  await expect(recycleBin).toHaveClass(/is-recycle-bin-name-hidden/);
  expect((await data(page)).recycleBin).toMatchObject({ gx: 11, gy: 5 });
});

test('list search filters names, handles accents and spaces, and keeps keyboard navigation within results', async ({ page }) => {
  await start(page, 430);
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { data } = getState();
    await setState({ data: { ...data, bookmarks: data.bookmarks.map(item => (
      item.id === 'compact-2' ? { ...item, name: 'Café favorito' } : item
    )) } });
  });
  const original = await data(page);
  const search = page.getByRole('searchbox', { name: 'Search bookmarks and folders' });
  const results = page.locator('#bookmark-container .bookmark-list-item:visible');
  const empty = page.locator('.bookmark-list-empty');
  await search.pressSequentially('cAFE favorito');
  await expect(search).toHaveValue('cAFE favorito');
  await expect(results).toHaveCount(1);
  await expect(results.first()).toHaveAttribute('data-bookmark-id', 'compact-2');
  await expect(page.locator('.modal:not(.hidden):visible')).toHaveCount(0);
  await search.press('Escape');
  await expect(search).toBeFocused();
  await expect(results).toHaveCount(21);
  await search.fill('gAmEs');
  await expect(results).toHaveCount(1);
  await results.getByRole('button').click();
  await expect(page.locator('#folder-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('gAmEs');
  await search.fill('does not exist');
  await expect(results).toHaveCount(0);
  await expect(empty).toHaveText('No results.');
  await expect(empty).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(results).toHaveCount(21);
  await expect(empty).toBeHidden();
  await search.fill(' Bookmark 1 ');
  await expect(results).toHaveCount(10);
  await search.evaluate(input => input.blur());
  await page.keyboard.press('Tab');
  const active = page.locator('#bookmark-container .is-keyboard-active');
  await expect(active).toHaveAttribute('data-bookmark-id', 'compact-9');
  await page.keyboard.press('ArrowDown');
  await expect(active).toHaveAttribute('data-bookmark-id', 'compact-10');
  await search.click();
  await expect(active).toHaveCount(0);
  await search.press('Tab');
  await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(search).toHaveValue('');
  expect(await data(page)).toEqual(original);
});

test('list search survives resizing and updates, follows the theme and language, and resets for another workspace', async ({ page }) => {
  await start(page, 430);
  const search = page.locator('#bookmark-list-search');
  const results = page.locator('#bookmark-container .bookmark-list-item:visible');
  await search.fill('Bookmark 20');
  await search.press('ArrowLeft');
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { data } = getState();
    await setState({ data: { ...data, settings: { ...data.settings, interfaceTheme: 'light', language: 'es' } } });
  });
  await expect(search).toBeFocused();
  expect(await search.evaluate(input => input.selectionStart)).toBe(10);
  await expect(search).toHaveAttribute('placeholder', 'Buscar favoritos y carpetas');
  await expect(search).toHaveAccessibleName('Buscar favoritos y carpetas');
  await expect(page.locator('html')).toHaveAttribute('data-interface-theme', 'light');
  for (const width of [600, 320]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(results).toHaveCount(1);
    await expect(search).toHaveValue('Bookmark 20');
    await expect.poll(() => page.locator('#bookmark-viewport').evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(search).toHaveCount(0);
  await expect(page.locator('#bookmark-container .bookmark')).toHaveCount(21);
  await page.setViewportSize({ width: 430, height: 720 });
  await expect(search).toHaveValue('Bookmark 20');
  await expect(results).toHaveCount(1);
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { data } = getState();
    await setState({ data: { ...data, settings: { ...data.settings,
      bookmarkGroups: [...data.settings.bookmarkGroups, { id: 'other-workspace', name: 'Other workspace' }],
      activeBookmarkGroupId: 'other-workspace'
    } } });
  });
  await expect(search).toHaveValue('');
  await expect(results).toHaveCount(0);
});

test('keeps saved grid cells and styles immutable through grid, list and grid transitions', async ({ page }) => {
  await start(page);
  const original = await data(page);
  const originalBounds = await page.locator('[data-bookmark-id="compact-1"]').boundingBox();
  for (const width of [940, 601]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(page.locator('#bookmark-container')).not.toHaveClass(/is-list-view/);
    await expect.poll(async () => (await page.locator('#bookmark-container').boundingBox()).width).toBe(width);
    expect((await page.locator('[data-bookmark-id="compact-1"]').boundingBox()).x).toBeCloseTo(width / 12 + 5, 1);
  }
  for (const width of [600, 320]) {
    await page.setViewportSize({ width, height: 720 });
    const list = page.locator('#bookmark-container');
    await expect(list).toHaveClass(/is-list-view/);
    await expect(list.locator('.bookmark-list-item')).toHaveCount(21);
    await expect(list.locator('.bookmark-list-item').first()).toHaveAttribute('data-folder-id', 'compact-folder');
    await expect(list.locator('[data-bookmark-id="compact-0"] .bookmark-list-name')).toHaveText(original.bookmarks[0].name);
    await expect(list.locator('[data-bookmark-id="compact-0"] .bookmark-list-icon img')).toHaveCount(0);
    await expect.poll(() => page.locator('#bookmark-viewport').evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
    await expect(page.locator('#edit-toggle-mode')).toBeHidden();
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('#bookmark-container')).not.toHaveClass(/is-list-view/);
  await expect.poll(async () => (await page.locator('[data-bookmark-id="compact-1"]').boundingBox()).width)
    .toBeCloseTo(originalBounds.width);
  expect(await data(page)).toEqual(original);
});

test('uses the full viewport and keeps edit controls inside the last column while resizing', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { data } = getState();
    await setState({ data: { ...data,
      bookmarks: data.bookmarks.map(item => item.id === 'compact-19' ? { ...item, gx: 11, gy: 5 } : item),
      folders: data.folders.map(item => ({ ...item, gx: 11, gy: 0, w: 1, h: 1 }))
    } });
  });
  await page.keyboard.press('Control+KeyE');
  const folder = page.locator('#bookmark-container [data-folder-id="compact-folder"]');
  await expect(folder.locator('.resizer')).toHaveCount(8);
  const original = await data(page);
  const retainedCard = await folder.elementHandle();
  for (const [width, height] of [[1920, 1080], [1545, 916], [940, 720], [777, 601], [601, 480], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.locator('#bookmark-container').evaluate(element => ({
      width: element.clientWidth, height: element.clientHeight
    }))).toEqual({ width, height });
    const overlay = await page.locator('#grid-overlay').boundingBox();
    expect(overlay).toEqual({ x: 0, y: 0, width, height });
    expect(await retainedCard.evaluate(element => element.isConnected)).toBe(true);
    const card = await page.locator('[data-bookmark-id="compact-19"]').boundingBox();
    expect(card.x).toBeCloseTo(width * 11 / 12 + 5, 1);
    expect(card.x + card.width).toBeCloseTo(width - 5, 1);
    expect(card.y + card.height).toBeCloseTo(height - 5, 1);
    expect(await page.locator('#bookmark-viewport').evaluate(element => ({
      x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight
    }))).toEqual({ x: 0, y: 0 });
    const bounds = await folder.boundingBox();
    for (const button of await folder.locator('.item-action-button').all()) {
      const action = await button.boundingBox();
      expect(action.x).toBeGreaterThanOrEqual(bounds.x);
      expect(action.x + action.width).toBeLessThanOrEqual(bounds.x + bounds.width + 0.1);
      expect(action.y + action.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      expect(await button.evaluate(element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(x + width / 2, y + height / 2));
      })).toBe(true);
    }
    const topLeft = await folder.locator('.resizer.top-left').boundingBox();
    const top = await folder.locator('.resizer.top').boundingBox();
    const topRight = await folder.locator('.resizer.top-right').boundingBox();
    expect(topLeft.x + topLeft.width).toBeLessThanOrEqual(top.x);
    expect(top.x + top.width).toBeLessThanOrEqual(topRight.x);
  }
  expect(await data(page)).toEqual(original);
});

test('dragging and resizing use the new cell size after shrinking to 601px', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Control+KeyE');
  const item = page.locator('[data-bookmark-id="compact-19"]');
  await expect(item.locator('.resizer')).toHaveCount(8);
  await page.setViewportSize({ width: 601, height: 720 });
  await expect.poll(async () => (await item.boundingBox()).width).toBeCloseTo(601 / 12 - 10, 1);
  const bounds = await item.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 100, bounds.y + bounds.height / 2 + 240, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => {
    const { gx, gy, w, h } = (await data(page)).bookmarks.find(item => item.id === 'compact-19');
    return { gx, gy, w, h };
  }).toEqual({ gx: 11, gy: 5, w: 1, h: 1 });

  const handle = await item.locator('.resizer.left').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 50, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => {
    const { gx, gy, w, h } = (await data(page)).bookmarks.find(item => item.id === 'compact-19');
    return { gx, gy, w, h };
  }).toEqual({ gx: 10, gy: 5, w: 2, h: 1 });
  const resized = await item.boundingBox();
  expect(resized.x + resized.width).toBeCloseTo(596, 1);
  await item.locator('.item-action-button.edit').click();
  await expect(page.locator('#edit-bookmark-modal')).toBeVisible();
});

test('toggling editing preserves grid, card and content geometry at every responsive size', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { data } = getState();
    await setState({ data: { ...data, folders: [...data.folders, {
      ...data.folders[0], id: 'small-folder', name: 'Small folder', gx: 11, gy: 0, w: 1, h: 1
    }] } });
  });
  await expect(page.locator('[data-folder-id="small-folder"]')).toBeVisible();
  const geometry = () => page.locator('#bookmark-container').evaluate(container => {
    const rectangle = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      grid: rectangle(container),
      cards: [...container.children].map(card => ({
        card: rectangle(card),
        content: [...card.querySelectorAll(
          '.bookmark-link, .bookmark-info, .bookmark-favicon, .bookmark-title, '
          + '.folder-open, .folder-visual, .folder-caption, .folder-title, .folder-count'
        )].map(rectangle)
      }))
    };
  });
  for (const [width, height] of [[1280, 720], [940, 920], [601, 720], [601, 480]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(async () => (await geometry()).grid).toEqual({ x: 0, y: 0, width, height });
    const before = await geometry();
    await page.keyboard.press('Control+KeyE');
    await expect(page.locator('#grid-overlay')).toBeVisible();
    await expect(page.locator('#bookmark-container .resizer').first()).toBeVisible();
    expect(await geometry()).toEqual(before);
    await page.keyboard.press('Control+KeyE');
    await expect(page.locator('#grid-overlay')).toBeHidden();
    await expect(page.locator('#bookmark-container .resizer')).toHaveCount(0);
    expect(await geometry()).toEqual(before);
  }
});

test('folder artwork scales continuously without typography or thumbnail shape jumps', async ({ page }) => {
  await start(page);
  await page.route('**/folder-cover.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#243650"/></svg>'
  }));
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { data } = getState();
    const children = data.bookmarks.filter(item => item.folderId === 'compact-folder');
    const smallFolders = ['plain', 'cover'].map((id, index) => ({
      ...data.folders[0], id, name: id, gx: 10 + index, gy: 0, w: 1, h: 1,
      backgroundImageUrl: id === 'cover' ? 'http://127.0.0.1:4175/folder-cover.svg' : null
    }));
    await setState({ data: { ...data,
      folders: [...data.folders, ...smallFolders],
      bookmarks: [...data.bookmarks, ...smallFolders.flatMap(folder => children.map(item => ({
        ...item, id: `${folder.id}-${item.id}`, folderId: folder.id
      })))]
    } });
  });
  await expect(page.locator('[data-folder-id="cover"].has-folder-bg-image')).toBeVisible();
  const original = await data(page);
  const measure = () => page.locator('#bookmark-container > .bookmark-folder').evaluateAll(cards => cards.map(card => {
    const origin = card.getBoundingClientRect();
    const art = card.querySelector('.folder-visual').getBoundingClientRect();
    const caption = card.querySelector('.folder-caption').getBoundingClientRect();
    const icons = [...card.querySelectorAll('.folder-previews > .bookmark-favicon')]
      .filter(icon => getComputedStyle(icon).display !== 'none');
    return {
      id: card.dataset.folderId,
      art: { width: art.width, height: art.height, top: art.top - origin.top, captionTop: caption.top - origin.top },
      font: getComputedStyle(card.querySelector('.folder-title')).fontSize,
      countFont: getComputedStyle(card.querySelector('.folder-count')).fontSize,
      count: icons.length,
      iconCorner: getComputedStyle(icons[0]).borderRadius
    };
  }));
  let previous = null;
  // Sample the entire resize path, including both sides of the old breakpoints.
  for (let width = 1920; width >= 601; width -= 10) {
    await page.setViewportSize({ width, height: 920 });
    await expect.poll(() => page.locator('#bookmark-container').evaluate(element => element.clientWidth)).toBe(width);
    const current = await measure();
    for (const [index, folder] of current.entries()) {
      expect(folder.count).toBe(folder.id === 'compact-folder' || width > 1000 ? 3 : 1);
      if (!previous) continue;
      expect(folder.font).toBe(previous[index].font);
      expect(folder.countFont).toBe(previous[index].countFont);
      expect(folder.iconCorner).toBe(previous[index].iconCorner);
      for (const key of Object.keys(folder.art)) {
        expect(Math.abs(folder.art[key] - previous[index].art[key]), `${folder.id}: ${key} at ${width}px`).toBeLessThan(2);
      }
    }
    previous = current;
  }
  await page.keyboard.press('Control+KeyE');
  await expect(page.locator('#grid-overlay')).toBeVisible();
  expect(await measure()).toEqual(previous);
  expect(await data(page)).toEqual(original);
});

test('bookmarks do not jump around 1200px in either viewing or editing mode', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { data } = getState();
    await setState({ data: { ...data, bookmarks: data.bookmarks.map(item => {
      if (item.id === 'compact-2') return { ...item, backgroundFavicon: false };
      if (item.id === 'compact-9') return { ...item, gx: 8, gy: 0, w: 2, h: 2 };
      return item;
    }) } });
  });
  await expect(page.locator('[data-bookmark-id="compact-2"]')).not.toHaveClass(/is-favicon-bg/);
  const measure = () => page.locator('#bookmark-container > .bookmark[data-bookmark-id]').evaluateAll(cards => cards
    .filter(card => ['compact-1', 'compact-2', 'compact-9'].includes(card.dataset.bookmarkId))
    .map(card => {
      const origin = card.getBoundingClientRect();
      return [...card.querySelectorAll('.bookmark-favicon, .bookmark-title')].map(element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x: x - origin.x, y: y - origin.y, width, height, font: getComputedStyle(element).fontSize };
      });
    }));
  for (const editing of [false, true]) {
    if (editing) {
      const before = await measure();
      await page.keyboard.press('Control+KeyE');
      await expect(page.locator('#grid-overlay')).toBeVisible();
      expect(await measure()).toEqual(before);
    }
    let previous = null;
    for (let width = 1300; width >= 1100; width -= 2) {
      await page.setViewportSize({ width, height: 920 });
      await expect.poll(() => page.locator('#bookmark-container').evaluate(element => element.clientWidth)).toBe(width);
      const current = await measure();
      if (previous) {
        for (const [index, content] of current.entries()) {
          for (const [child, rectangle] of content.entries()) {
            expect(rectangle.font).toBe(previous[index][child].font);
            for (const key of ['x', 'y', 'width', 'height']) {
              expect(Math.abs(rectangle[key] - previous[index][child][key]), `${key} at ${width}px, editing=${editing}`).toBeLessThan(0.5);
            }
          }
        }
      }
      previous = current;
    }
  }
});

test('resizing the viewport cancels an active resize without leaving stale card dimensions', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Control+KeyE');
  const item = page.locator('[data-bookmark-id="compact-19"]');
  const handle = item.locator('.resizer.right');
  await expect(handle).toBeVisible();
  const retainedCard = await item.elementHandle();
  const original = await data(page);
  const bounds = await handle.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 100, bounds.y + bounds.height / 2, { steps: 8 });
  await expect(item).toHaveClass(/is-resizing/);
  await page.setViewportSize({ width: 601, height: 480 });
  await expect.poll(async () => (await item.boundingBox()).width).toBeCloseTo(601 / 12 - 10, 1);
  await page.mouse.up();
  await expect(item).not.toHaveClass(/is-resizing/);
  await expect(item).toHaveClass(/is-editing/);
  expect(await retainedCard.evaluate(element => element.isConnected)).toBe(true);
  expect(await data(page)).toEqual(original);

  // A subsequent click must still resize by exactly one of the new cells.
  await item.locator('.resizer.right').click();
  await expect.poll(async () => (await item.boundingBox()).width).toBeCloseTo(601 / 6 - 10, 1);
});

test('list navigation follows rows, scrolls and opens the selected bookmark', async ({ page }) => {
  await start(page, 430);
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-folder-id="compact-folder"]')).toHaveClass(/is-keyboard-active/);
  for (let index = 0; index < 14; index++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(125);
  }
  await expect(page.locator('#bookmark-container .is-keyboard-active')).toBeInViewport();
  expect(await page.locator('#bookmark-viewport').evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  await page.keyboard.press('Tab');
  await page.route('**/open/target', route => route.fulfill({ contentType: 'text/html', body: '<h1>Opened bookmark</h1>' }));
  await page.locator('[data-bookmark-id="compact-1"] a').click();
  await expect(page.getByRole('heading', { name: 'Opened bookmark' })).toBeVisible();
});

test('open folder icons shrink continuously through 720px until switching to a list', async ({ page }) => {
  await start(page, 900);
  const original = await data(page);
  await page.locator('[data-folder-id="compact-folder"] .folder-open').click();
  const grid = page.locator('#folder-modal-items');
  await expect(grid).toBeVisible();
  await page.locator('#folder-modal').evaluate(element => Promise.all(
    element.getAnimations({ subtree: true }).map(animation => animation.finished)
  ));
  for (const editing of [false, true]) {
    if (editing) await page.locator('#folder-modal-edit-toggle').click();
    let previous = null;
    for (const width of [900, 800, 722, 721, 720, 719, 700, 650, 601]) {
      await page.setViewportSize({ width, height: 720 });
      await expect(grid).not.toHaveClass(/is-list-view/);
      const size = await grid.evaluate(element => {
        const { width, height } = element.querySelector('.bookmark-link > .bookmark-favicon').getBoundingClientRect();
        return { width, height };
      });
      if (previous) {
        for (const axis of ['width', 'height']) {
          const decrease = previous.size[axis] - size[axis];
          expect(decrease, `${axis} at ${width}px (editing: ${editing})`).toBeGreaterThanOrEqual(-0.1);
          expect(decrease, `${axis} at ${width}px (editing: ${editing})`).toBeLessThan((previous.width - width) * .2 + .1);
        }
      }
      previous = { width, size };
    }
    expect(previous.size.width).toBeGreaterThan(40);
    expect(previous.size.width).toBeLessThan(58);
  }
  await page.locator('#folder-modal-edit-toggle').click();
  await page.setViewportSize({ width: 600, height: 720 });
  await expect(grid).toHaveClass(/is-list-view/);
  await expect(grid.locator('.bookmark-list-item')).toHaveCount(3);
  expect(await data(page)).toEqual(original);
});

test('folders also use readable lists and cannot enter editing in compact view', async ({ page }) => {
  await start(page, 430);
  const original = await data(page);
  await page.locator('[data-folder-id="compact-folder"] .folder-open').click();
  await expect(page.locator('#folder-modal')).toBeVisible();
  await expect(page.locator('#folder-modal-items')).toHaveClass(/is-list-view/);
  await expect(page.locator('#folder-modal-items .bookmark-list-item')).toHaveCount(3);
  await expect(page.locator('#folder-modal-edit-toggle')).toBeHidden();
  await page.keyboard.press('Control+KeyE');
  await expect(page.locator('.flash-error').last()).toHaveText('Widen the window to use this feature.');
  await expect(page.locator('#folder-modal')).not.toHaveClass(/is-folder-editing/);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('#folder-modal-items')).not.toHaveClass(/is-list-view/);
  await expect(page.locator('#folder-modal-edit-toggle')).toBeVisible();
  expect(await data(page)).toEqual(original);
});

test('empty folders show a compact list placeholder without a scrollbar', async ({ page }) => {
  await start(page, 430);
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/state/appStore.js');
    const { data } = getState();
    await setState({ data: {
      ...data,
      bookmarks: data.bookmarks.filter(bookmark => bookmark.folderId !== 'compact-folder')
    } });
  });

  await page.locator('[data-folder-id="compact-folder"] .folder-open').click();
  const card = page.locator('#folder-modal .modal-folder');
  const shell = page.locator('#folder-modal .folder-grid-shell');
  await expect(card).toHaveClass(/is-empty-list/);
  await expect(page.locator('#folder-modal-items')).toBeHidden();
  await expect(page.locator('#folder-modal-empty')).toBeVisible();
  await expect(page.locator('#folder-modal-empty')).toHaveText('This folder is empty.');
  expect(await shell.evaluate(element => getComputedStyle(element).overflowY)).toBe('hidden');
  expect(await shell.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(card).not.toHaveClass(/is-empty-list/);
  await expect(page.locator('#folder-modal-items')).toBeVisible();
  await expect(page.locator('#folder-modal-empty')).toHaveText(
    'This folder is empty. Drag bookmarks here from edit mode.'
  );
});

test('compact view hides unavailable tools and blocks shortcuts through 600px', async ({ page }) => {
  await start(page, 600);
  await page.mouse.move(5, 360);
  await expect(page.locator('#floating-menu')).toBeHidden();
  for (const key of ['Control+KeyS', 'Control+KeyB', 'Control+KeyF']) {
    await page.keyboard.press(key);
    await expect(page.locator('.flash-error').last()).toHaveText('Widen the window to use this feature.');
    await expect(page.locator('.modal.is-open')).toHaveCount(0);
    await page.locator('#flash-container').evaluate(element => element.replaceChildren());
  }
  await page.keyboard.press('Control+KeyE');
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().ui.isEditing)).toBe(false);
  await page.evaluate(async () => (
    await import('/src/features/bookmarks/bookmarkModal.js')
  ).openEditBookmark('compact-1'));
  await expect(page.locator('#edit-bookmark-modal')).toBeHidden();
  await page.setViewportSize({ width: 601, height: 720 });
  await expect(page.locator('#floating-menu')).toBeVisible();
  for (const [id, modal] of [['settings', '#settings-modal'], ['add-bookmark', '#edit-bookmark-modal'], ['add-folder', '#edit-folder-modal']]) {
    await sideAction(page, id);
    await expect(page.locator(modal)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(modal)).toBeHidden();
  }
});

test('entering list view cancels an unfinished grid drag and exits editing', async ({ page }) => {
  await start(page);
  const original = await data(page);
  await page.keyboard.press('Control+KeyE');
  const bookmark = page.locator('[data-bookmark-id="compact-0"]');
  await expect(bookmark).toHaveClass(/is-editing/);
  const box = await bookmark.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 100, { steps: 8 });
  await page.setViewportSize({ width: 430, height: 720 });
  await expect(page.locator('#bookmark-container')).toHaveClass(/is-list-view/);
  await page.mouse.up();
  await expect(page.locator('#bookmark-container .resizer, #bookmark-container .item-actions')).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('/src/state/appStore.js')).getState().ui.isEditing)).toBe(false);
  expect(await data(page)).toEqual(original);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('#bookmark-container')).not.toHaveClass(/is-list-view/);
  await expect(bookmark).not.toHaveClass(/is-editing/);
});

test('suspends settings drafts and restores their tab, scroll and appearance', async ({ page }) => {
  await start(page);
  const original = await data(page);
  await sideAction(page, 'settings');
  await page.locator('input[name="interface-theme"][value="light"]').check();
  await page.locator('[data-tab="settings-modal-tab-bookmark"]').click();
  await page.locator('#bookmark-drag-settings-title').click();
  await page.locator('#settings-preset-name').fill('Unfinished preset');
  const panel = page.locator('#settings-modal-tab-bookmark');
  await panel.evaluate(element => { element.scrollTop = 120; });
  const scroll = await panel.evaluate(element => element.scrollTop);

  await page.setViewportSize({ width: 601, height: 720 });
  await expect(page.locator('#settings-modal')).toBeVisible();
  await page.setViewportSize({ width: 600, height: 720 });
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(page.locator('.flash-info')).toHaveText('Panel hidden. Widen the window to continue.');
  await page.setViewportSize({ width: 430, height: 720 });
  await expect(page.locator('.flash-info')).toHaveCount(1);
  await expect(page.locator('#bookmark-viewport')).not.toHaveAttribute('inert');
  expect(await data(page)).toEqual(original);

  // A usable dialog can open while settings are suspended and retains its own focus.
  await page.mouse.move(215, 715);
  await page.locator('#search-bookmarks').click();
  await page.locator('#search-modal-input').fill('Bookmark 2');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('#search-modal-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#search-modal')).toBeHidden();
  await expect(panel).toBeVisible();
  await expect(page.locator('#settings-preset-name')).toHaveValue('Unfinished preset');
  await expect(page.locator('input[name="interface-theme"][value="light"]')).toBeChecked();
  expect(await panel.evaluate(element => element.scrollTop)).toBe(scroll);
  await page.locator('#settings-modal-save').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect.poll(async () => (await data(page)).settings.interfaceTheme).toBe('light');
});

for (const mode of ['add', 'edit']) {
  test(`preserves a ${mode} bookmark draft and its cursor while hidden`, async ({ page }) => {
    await start(page);
    const original = await data(page);
    if (mode === 'add') await sideAction(page, 'add-bookmark');
    else await page.evaluate(async () => (
      await import('/src/features/bookmarks/bookmarkModal.js')
    ).openEditBookmark('compact-1'));
    const name = page.locator('#bookmark-modal-form-name');
    await name.fill('Unfinished bookmark');
    if (mode === 'add') await page.locator('#bookmark-modal-form-url').fill('https://example.internal/draft');
    await name.focus();
    await name.evaluate(input => input.setSelectionRange(2, 8));

    for (let cycle = 0; cycle < 2; cycle++) {
      await page.setViewportSize({ width: 430, height: 720 });
      await expect(page.locator('#edit-bookmark-modal')).toBeHidden();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Enter');
      expect(await data(page)).toEqual(original);
      await page.setViewportSize({ width: 601, height: 720 });
      await expect(name).toBeVisible();
      await expect(name).toBeFocused();
      await expect(name).toHaveValue('Unfinished bookmark');
      expect(await name.evaluate(input => [input.selectionStart, input.selectionEnd])).toEqual([2, 8]);
    }
    await page.locator('#edit-bookmark-modal-save').click();
    await expect(page.locator('#edit-bookmark-modal')).toBeHidden();
    await expect.poll(async () => (await data(page)).bookmarks.filter(item => item.name === 'Unfinished bookmark').length).toBe(1);
  });
}

test('preserves nested folder edits and confirmations while the readable folder stays usable', async ({ page }) => {
  await start(page);
  const original = await data(page);
  await page.locator('[data-folder-id="compact-folder"] .folder-open').click();
  await page.locator('#folder-modal-customize').click();
  await page.locator('#folder-editor-name').fill('Draft folder name');
  await page.locator('#edit-folder-modal-cancel').click();
  await expect(page.locator('#alert-modal')).toBeVisible();
  await page.setViewportSize({ width: 430, height: 720 });
  await expect(page.locator('#alert-modal')).toBeHidden();
  await expect(page.locator('#edit-folder-modal')).toBeHidden();
  await expect(page.locator('#folder-modal-items .bookmark-list-item')).toHaveCount(3);
  await expect(page.locator('.flash-info')).toHaveCount(1);
  // Closing the visible parent must not pop or discard a suspended child.
  await page.locator('#folder-modal-close').click();
  await expect(page.locator('#folder-modal')).toBeHidden();
  await page.keyboard.press('Escape');
  expect(await data(page)).toEqual(original);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('#alert-modal')).toBeVisible();
  await expect(page.locator('#edit-folder-modal')).toBeVisible();
  await page.locator('#alert-modal-cancel').click();
  await expect(page.locator('#alert-modal')).toBeHidden();
  await expect(page.locator('#folder-editor-name')).toHaveValue('Draft folder name');
  await page.locator('#edit-folder-modal-save').click();
  await expect(page.locator('#edit-folder-modal')).toBeHidden();
  await expect.poll(async () => (await data(page)).folders[0].name).toBe('Draft folder name');
});

test('preserves a new folder draft while the full editor is unavailable', async ({ page }) => {
  await start(page);
  const original = await data(page);
  await sideAction(page, 'add-folder');
  const name = page.locator('#folder-editor-name');
  await name.fill('Unfinished folder');
  await page.setViewportSize({ width: 430, height: 720 });
  await expect(page.locator('#edit-folder-modal')).toBeHidden();
  await page.keyboard.press('Enter');
  expect(await data(page)).toEqual(original);
  await page.setViewportSize({ width: 601, height: 720 });
  await expect(name).toBeVisible();
  await expect(name).toHaveValue('Unfinished folder');
  await page.locator('#edit-folder-modal-save').click();
  await expect(page.locator('#edit-folder-modal')).toBeHidden();
  await expect.poll(async () => (await data(page)).folders.some(folder => folder.name === 'Unfinished folder')).toBe(true);
});

test('suspends folder editing and inline renaming without saving or discarding the name', async ({ page }) => {
  await start(page);
  const original = await data(page);
  await page.locator('[data-folder-id="compact-folder"] .folder-open').click();
  await page.locator('#folder-modal-edit-toggle').click();
  await page.locator('#folder-modal-title').dblclick();
  await page.locator('#folder-modal-title').fill('Unfinished rename');
  await page.setViewportSize({ width: 430, height: 720 });
  await expect(page.locator('#folder-modal')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+KeyE');
  await page.locator('[data-folder-id="compact-folder"] .folder-open').click();
  await expect(page.locator('#folder-modal')).toBeHidden();
  expect(await data(page)).toEqual(original);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('#folder-modal')).toBeVisible();
  await expect(page.locator('#folder-modal')).toHaveClass(/is-folder-editing/);
  await expect(page.locator('#folder-modal-title')).toHaveAttribute('contenteditable', 'true');
  await expect(page.locator('#folder-modal-title')).toHaveText('Unfinished rename');
  await page.locator('#folder-modal-rename-accept').click();
  await expect.poll(async () => (await data(page)).folders[0].name).toBe('Unfinished rename');
});
