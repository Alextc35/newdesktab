import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captionBackground,
  readableSurfaceBorderColor,
  readableSurfacePalette,
  readableSurfaceTextColor
} from '../src/shared/ui/surfaceContrast.js';

function contrast(first, second) {
  const luminance = color => {
    const channels = color.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16) / 255);
    const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1] + .05) / (values[0] + .05);
}

test('caption backgrounds retain readable contrast for custom text colors in both themes', () => {
  const colors = new Set(['#ff00ff', '#00ff00', '#0000ff', '#ffaa00', '#5531a8']);
  for (let gray = 0; gray <= 255; gray++) colors.add(`#${gray.toString(16).padStart(2, '0').repeat(3)}`);
  for (const text of colors) {
    const surfaces = captionBackground(text).match(/#[\da-f]{6}/g);
    assert.equal(surfaces.length, 2);
    for (const background of surfaces) assert.ok(contrast(text, background) >= 4.5, `${text} on ${background}`);
  }
});

test('folder palettes keep readable text and controls across saturated colors and every gray', () => {
  const backgrounds = new Set();
  const hex = value => value.toString(16).padStart(2, '0');
  for (let gray = 0; gray <= 255; gray++) backgrounds.add(`#${hex(gray).repeat(3)}`);
  for (let red = 0; red <= 255; red += 51) {
    for (let green = 0; green <= 255; green += 51) {
      for (let blue = 0; blue <= 255; blue += 51) backgrounds.add(`#${hex(red)}${hex(green)}${hex(blue)}`);
    }
  }
  for (const background of backgrounds) {
    for (const surface of ['#f6f6f7', '#989899', '#18181a', '#707071']) {
      assert.ok(contrast(readableSurfaceBorderColor(background, surface), surface) >= 3,
        `${background}: accent border on ${surface}`);
    }
    const palette = readableSurfacePalette(background);
    assert.ok(contrast(palette.text, background) >= 4.5, `${background}: title`);
    assert.ok(contrast(palette.muted, background) >= 4.5, `${background}: summary`);
    for (const fill of [palette.controlBackground, palette.controlHover, palette.controlActive]) {
      assert.ok(contrast(palette.controlText, fill) >= 4.5, `${background}: control text on ${fill}`);
      assert.ok(contrast(palette.controlBorder, fill) >= 3, `${background}: control boundary on ${fill}`);
    }
  }
});

test('custom labels are preserved when readable and adjusted across the midtone contrast gap', () => {
  assert.equal(readableSurfaceBorderColor('#38bdf8', '#18181a'), '#38bdf8');
  assert.equal(readableSurfaceTextColor('#5531a8', '#ffffff'), '#5531a8');
  assert.equal(readableSurfaceTextColor('#ffffff', '#101820'), '#ffffff');
  for (const background of ['#737373', '#777777', '#787878', '#7c7c7c', '#38bdf8']) {
    for (const text of ['#ffffff', '#000000', '#5531a8', '#38bdf8']) {
      assert.ok(contrast(readableSurfaceTextColor(text, background), background) >= 4.5);
    }
  }
});

test('transparent folder text remains readable across wallpapers in both interface themes', () => {
  for (const [surface, baseline] of [['#f6f6f7', '#989899'], ['#18181a', '#707071']]) {
    const palette = readableSurfacePalette(baseline, { controlBackgroundColor: surface });
    assert.ok(contrast(palette.text, baseline) >= 4.5);
    assert.ok(contrast(palette.muted, baseline) >= 4.5);
    const surfaceChannels = surface.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16));
    for (const wallpaper of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff']) {
      const channels = wallpaper.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16));
      const composite = `#${channels.map((channel, index) => (
        Math.round(channel * .38 + surfaceChannels[index] * .62).toString(16).padStart(2, '0')
      )).join('')}`;
      const labels = ['#000000', '#ffffff', '#5531a8', '#38bdf8']
        .map(color => readableSurfaceTextColor(color, baseline));
      for (const text of [palette.text, palette.muted, ...labels]) {
        assert.ok(contrast(text, composite) >= 4.5, `${wallpaper}: transparent text on ${surface}`);
      }
    }
  }
});
