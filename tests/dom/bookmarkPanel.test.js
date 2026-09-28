import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

let createBookmarkEditorPanel;
let createFavicon;
let createBookmarkElement;
const newTabHtml = readFileSync(join(process.cwd(), 'src/newtab.html'), 'utf8');

beforeAll(async () => {
  globalThis.chrome = createChromeMock();
  globalThis.requestAnimationFrame = callback => callback();

  document.documentElement.innerHTML = newTabHtml
    .replace(/^.*?<html[^>]*>/s, '')
    .replace(/<\/html>.*$/s, '');

  ({ createBookmarkEditorPanel } = await import(
    '../../src/features/bookmarks/bookmarkEditorPanel.js'
  ));
  ({ createFavicon } = await import('../../src/features/bookmarks/bookmarkFavicon.js'));
  ({ createBookmarkElement } = await import('../../src/features/bookmarks/bookmarkCard.js'));
});

beforeEach(() => {
  document.getElementById('bookmark-modal-form-host').replaceChildren();
});

describe('BookmarkEditorPanel', () => {
  test('groups favicon controls in the icon tab', () => {
    const template = document.getElementById('bookmark-form-template').content;
    const iconPanel = template.querySelector('[data-tab-panel="icon"]');
    const stylePanel = template.querySelector('[data-tab-panel="style"]');

    expect(iconPanel.querySelector('[data-field="backgroundFavicon"]')).not.toBeNull();
    expect(iconPanel.querySelector('[data-field="showFavicon"]')).not.toBeNull();
    expect(stylePanel.querySelector('[data-field="backgroundFavicon"]')).toBeNull();
    expect(stylePanel.querySelector('[data-field="showFavicon"]')).toBeNull();
  });

  test('uses one panel contract for create and preset modes', () => {
    const createPanel = createBookmarkEditorPanel({
      host: document.getElementById('bookmark-modal-form-host'),
      mode: 'create',
      value: { name: '', backgroundColor: '#123456' }
    });
    const presetPanel = createBookmarkEditorPanel({
      host: document.createElement('div'),
      mode: 'preset',
      value: { backgroundColor: '#abcdef' },
      previewName: 'Default bookmark',
      previewFaviconUrl: '/assets/icons/icon-128.png'
    });

    expect(createPanel.sections).toEqual(['general', 'style', 'text', 'icon']);
    expect(presetPanel.sections).toEqual(['style', 'text', 'icon']);
    expect(presetPanel.elements.name).toBeNull();
    expect(presetPanel.getValue()).not.toHaveProperty('name');
    expect(presetPanel.getValue().backgroundColor).toBe('#abcdef');
    expect(presetPanel.root.querySelector('.bookmark-title').textContent).toBe('Default bookmark');
    expect(presetPanel.root.querySelector('.bookmark-favicon-image').getAttribute('src'))
      .toBe('/assets/icons/icon-128.png');

    createPanel.destroy();
    presetPanel.destroy();
  });

  test('each field emits a single change and editors remain isolated', () => {
    const onCreateChange = vi.fn();
    const onPresetChange = vi.fn();
    const createPanel = createBookmarkEditorPanel({
      host: document.getElementById('bookmark-modal-form-host'),
      mode: 'create',
      value: { name: 'One', url: 'one.test' },
      onChange: onCreateChange
    });
    const presetPanel = createBookmarkEditorPanel({
      host: document.createElement('div'),
      mode: 'preset',
      value: {},
      onChange: onPresetChange
    });

    createPanel.elements.url.value = ' two.test ';
    createPanel.elements.url.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onCreateChange).toHaveBeenCalledTimes(1);
    expect(createPanel.getValue().url).toBe('two.test');
    expect(onPresetChange).not.toHaveBeenCalled();

    presetPanel.reset({ backgroundColor: '#334455' });
    expect(createPanel.getValue().url).toBe('two.test');

    createPanel.destroy();
    presetPanel.destroy();
  });

  test('validates fields and removes listeners when destroyed', () => {
    const onChange = vi.fn();
    const panel = createBookmarkEditorPanel({
      host: document.getElementById('bookmark-modal-form-host'),
      mode: 'create',
      value: { name: '', url: 'javascript:alert(1)' },
      onChange
    });

    const result = panel.validate();
    expect(result.isValid).toBe(false);
    expect(panel.elements.name.getAttribute('aria-invalid')).toBe('true');
    expect(panel.elements.url.getAttribute('aria-invalid')).toBe('true');

    const detachedNameInput = panel.elements.name;
    panel.destroy();
    detachedNameInput.value = 'After destroy';
    detachedNameInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).not.toHaveBeenCalled();
    expect(document.getElementById('bookmark-modal-form-host').children).toHaveLength(0);
  });

  test('uses a theme-aware initials fallback for bookmarks without a resolvable URL', () => {
    const favicon = createFavicon({ name: 'Example bookmark', url: '' });

    expect(favicon.classList.contains('bookmark-favicon-fallback')).toBe(true);
    expect(favicon.querySelector('.bookmark-favicon-initials').textContent).toBe('EX');
    expect(favicon.querySelector('img')).toBeNull();
  });

  test('ignores a leading www only when resolving the favicon', () => {
    const bookmark = {
      name: 'Iberlogistics',
      url: 'https://www.iberlogistics.com/services'
    };
    const favicon = createFavicon(bookmark);
    const faviconRequest = new URL(favicon.querySelector('img').getAttribute('src'));
    const subdomainRequest = new URL(createFavicon({
      name: 'App',
      url: 'https://app.example.com/dashboard'
    }).querySelector('img').getAttribute('src'));

    expect(faviconRequest.searchParams.get('url')).toBe('https://iberlogistics.com');
    expect(subdomainRequest.searchParams.get('url')).toBe('https://example.com');
    expect(bookmark.url).toBe('https://www.iberlogistics.com/services');
  });

  test.each([
    ['https://app.web3forms.com/dashboard?tab=forms#settings', 'https://web3forms.com'],
    ['http://app.example.co.uk:8080/dashboard', 'http://example.co.uk:8080']
  ])('omits app. from the first favicon request for %s', (url, faviconOrigin) => {
    const bookmark = { name: 'Web3Forms', url };
    const favicon = createFavicon(bookmark);

    expect(new URL(favicon.querySelector('img').src).searchParams.get('url')).toBe(faviconOrigin);
    expect(bookmark.url).toBe(url);

    const image = favicon.querySelector('img');
    image.dispatchEvent(new Event('error'));

    expect(favicon.classList.contains('bookmark-favicon-fallback')).toBe(true);
    expect(favicon.querySelector('.bookmark-favicon-initials').textContent).toBe('WE');
    expect(image.onerror).toBeNull();
    image.dispatchEvent(new Event('error'));
    expect(favicon.querySelector('.bookmark-favicon-initials').textContent).toBe('WE');
  });

  test.each(['example.com', 'myapp.example.com', 'portal.app.example.com'])(
    'uses initials after a failed favicon without stripping %s', hostname => {
      const favicon = createFavicon({ name: 'Example', url: `https://${hostname}/dashboard` });

      const image = favicon.querySelector('img');
      image.dispatchEvent(new Event('error'));

      expect(favicon.classList.contains('bookmark-favicon-fallback')).toBe(true);
      expect(image.onerror).toBeNull();
    }
  );

  test.each(['app.example.internal', 'app.example.local'])(
    'uses initials without requesting a remote favicon for %s', hostname => {
      const favicon = createFavicon({ name: 'Example', url: `https://${hostname}` });

      expect(favicon.classList.contains('bookmark-favicon-fallback')).toBe(true);
      expect(favicon.querySelector('img')).toBeNull();
    }
  );
});

describe('bookmark renderer', () => {
  test('does not add a small duplicate favicon when background favicon text is hidden', () => {
    const bookmark = createBookmarkElement({
      name: 'Twitch',
      url: 'https://twitch.tv',
      backgroundFavicon: true,
      noBackground: false,
      backgroundColor: '#9146ff',
      showText: false,
      showFavicon: true,
      textColor: '#ffffff'
    });

    expect(bookmark.classList.contains('is-favicon-bg')).toBe(true);
    expect(bookmark.style.getPropertyValue('--color-bg-bookmark')).toBe('#9146ff');
    expect(bookmark.querySelectorAll('.bookmark-favicon')).toHaveLength(1);
    expect(bookmark.querySelector('.bookmark-info')).toBeNull();
    expect(bookmark.querySelector('.bookmark-title')).toBeNull();
  });
});

function createChromeMock() {
  const listeners = [];
  const createArea = () => ({
    QUOTA_BYTES: 102400,
    get(_keys, callback) { callback({}); },
    set(_items, callback) { callback?.(); },
    remove(_keys, callback) { callback?.(); },
    getBytesInUse(_keys, callback) { callback(0); }
  });

  return {
    runtime: {
      lastError: null,
      getManifest: () => ({ version: '0.1.1' }),
      getURL: path => path
    },
    storage: {
      local: createArea(),
      sync: createArea(),
      onChanged: {
        addListener(listener) { listeners.push(listener); }
      }
    }
  };
}
