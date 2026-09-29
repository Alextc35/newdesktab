import { describe, expect, test } from 'vitest';
import {
  createEditIndicatorSvg,
  createFolderSvg,
  createRecycleBinSvg,
  createThemedAssetIcon
} from '../../src/shared/ui/svgIcons.js';

describe('shared NewDeskTab SVG icons', () => {
  test('keeps folder and recycle-bin artwork at their canonical ratios', () => {
    expect(createFolderSvg().getAttribute('viewBox')).toBe('0 0 136 100');
    expect(createRecycleBinSvg().getAttribute('viewBox')).toBe('0 0 92 108');
  });

  test('fills the complete folder silhouette with a unique image pattern', () => {
    const first = createFolderSvg('data:image/png;base64,AA==');
    const second = createFolderSvg('https://images.test/folder.png');
    const firstPattern = first.querySelector('pattern');
    const secondPattern = second.querySelector('pattern');

    expect(firstPattern.id).not.toBe(secondPattern.id);
    expect(firstPattern.getAttribute('patternUnits')).toBe('userSpaceOnUse');
    expect(firstPattern.querySelector('image').getAttribute('preserveAspectRatio'))
      .toBe('xMidYMid slice');
    expect(firstPattern.querySelector('image').getAttribute('width')).toBe('136');
    expect(firstPattern.querySelector('image').getAttribute('height')).toBe('100');
    expect(first.querySelector('.folder-tab').style.fill)
      .toBe(first.querySelector('.folder-svg-body').style.fill);
    expect(first.querySelector('.folder-tab').style.fill).toContain(firstPattern.id);
  });

  test('creates a reusable vector edit affordance for modal artwork', () => {
    const svg = createEditIndicatorSvg();

    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(svg.querySelector('.edit-indicator-pencil')).not.toBeNull();
    expect(svg.querySelector('.edit-indicator-detail')).not.toBeNull();
  });

  test('resolves themed icon assets from the extension asset directory', () => {
    const icon = createThemedAssetIcon('bookmark');
    const images = [...icon.querySelectorAll('img')];
    const sources = images.map(image => decodeURIComponent(image.src));

    expect(images).toHaveLength(2);
    expect(sources[0]).toMatch(/bookmark-light(?:-fill|\.svg)/);
    expect(sources[1]).toMatch(/bookmark-dark(?:-fill|\.svg)/);
  });
});
