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
