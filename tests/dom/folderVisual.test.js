import { beforeEach, describe, expect, test } from 'vitest';

import {
  applyFolderAppearance,
  createFolderVisual
} from '../../src/features/folders/folderVisual.js';

beforeEach(() => {
  document.body.replaceChildren();
});

describe('folder visual', () => {
  test('uses one fixed-ratio SVG silhouette on every folder surface', () => {
    const visual = createFolderVisual({});
    const svg = visual.querySelector('.folder-svg');

    expect(svg).not.toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 136 100');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(svg.querySelector('.folder-tab')).not.toBeNull();
    expect(svg.querySelector('.folder-svg-body')).not.toBeNull();
  });

  test.each([
    { name: 'without a cover', backgroundImageUrl: null },
    { name: 'with a cover', backgroundImageUrl: 'https://images.test/cover.png' }
  ])('shows all four bookmarks $name', ({ backgroundImageUrl }) => {
    const visual = createFolderVisual({ backgroundImageUrl }, bookmarks(4));

    expect(visual.querySelectorAll('.bookmark-favicon')).toHaveLength(4);
    expect(visual.querySelector('.folder-preview-more')).toBeNull();
  });

  test.each([
    { name: 'five without a cover', backgroundImageUrl: null, count: 5, remainder: '+2' },
    { name: 'six without a cover', backgroundImageUrl: null, count: 6, remainder: '+3' },
    { name: 'five with a cover', backgroundImageUrl: 'https://images.test/cover.png', count: 5, remainder: '+2' },
    { name: 'six with a cover', backgroundImageUrl: 'https://images.test/cover.png', count: 6, remainder: '+3' }
  ])('uses the fourth slot for the remainder with $name', ({ backgroundImageUrl, count, remainder }) => {
    const visual = createFolderVisual({ backgroundImageUrl }, bookmarks(count));

    expect(visual.querySelectorAll('.bookmark-favicon')).toHaveLength(3);
    expect(visual.querySelector('.folder-preview-more').textContent).toBe(remainder);
  });

  test.each([
    { count: 1, remainder: null },
    { count: 4, remainder: '+3' },
    { count: 6, remainder: '+5' }
  ])('reserves the compact remainder for $count bookmarks', ({ count, remainder }) => {
    const visual = createFolderVisual({}, bookmarks(count));

    expect(visual.querySelector('.folder-preview-compact-more')?.textContent ?? null)
      .toBe(remainder);
  });

  test('uses a compact icon tray over cover images', () => {
    const visual = createFolderVisual({
      noBackground: true,
      backgroundImageUrl: 'https://images.test/animated.gif'
    }, bookmarks(5));

    expect(visual.classList.contains('has-folder-bg-image')).toBe(true);
    expect(visual.classList.contains('is-folder-transparent')).toBe(true);
    expect(visual.querySelectorAll('.bookmark-favicon')).toHaveLength(3);
    expect(visual.querySelector('.folder-preview-more').textContent).toBe('+2');
  });

  test.each([{ showPreviews: false }, { showFolder: false }])(
    'does not request bookmark favicons when previews are hidden: %j', visibility => {
      const visual = createFolderVisual({
        ...visibility,
        backgroundImageUrl: 'https://images.test/cover.png'
      }, bookmarks(5));

      expect(visual.querySelectorAll('img')).toHaveLength(0);
      expect(visual.querySelector('.folder-preview-more')).toBeNull();
      expect(visual.querySelector('.folder-preview-compact-more')).toBeNull();
      expect(visual.classList.contains('is-folder-preview-hidden')).toBe(true);
    }
  );

  test('restores automatic appearance when a customized element is reused', () => {
    const visual = createFolderVisual({
      outerBackgroundColor: '#123456',
      showFolder: false,
      showName: false,
      showCount: false
    });
    expect(visual.style.getPropertyValue('--folder-outer-color')).toBe('#123456');

    applyFolderAppearance(visual, {});

    expect(visual.style.getPropertyValue('--folder-outer-color')).toBe('');
    for (const className of [
      'has-folder-outer-color', 'is-folder-hidden', 'is-folder-preview-hidden',
      'is-folder-name-hidden', 'is-folder-count-hidden'
    ]) expect(visual.classList.contains(className)).toBe(false);
  });
});

function bookmarks(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `bookmark-${index}`,
    name: `Bookmark ${index}`,
    url: `https://bookmark-${index}.internal`
  }));
}
