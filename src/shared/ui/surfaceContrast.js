/**
 * Derives a readable shared display color for light interface canvases. Persisted
 * bookmark/folder colors still control wallpaper, image and dark surfaces.
 */
export function lightSurfaceTextColor(color) {
  if (!/^#[\da-f]{6}$/i.test(color ?? '')) return '#242428';
  const rgb = color.slice(1).match(/../g).map(channel => parseInt(channel, 16));
  // Use the darker checkerboard square as the minimum light surface contrast.
  const backgroundLuminance = luminance([239, 239, 241]);
  if ((backgroundLuminance + .05) / (luminance(rgb) + .05) >= 4.5) return color;
  if (Math.max(...rgb) - Math.min(...rgb) < 24) return '#242428';

  // Keep the hue of bright custom labels while making them readable.
  let adjusted = rgb;
  do {
    adjusted = adjusted.map(channel => Math.floor(channel * .9));
  } while ((backgroundLuminance + .05) / (luminance(adjusted) + .05) < 4.5);
  return `#${adjusted.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** Preserves a saved label color when readable, otherwise uses a contrasting neutral. */
export function readableSurfaceTextColor(color, backgroundColor) {
  const text = /^#[\da-f]{6}$/i.test(color ?? '') ? color : '#f8fafc';
  const background = /^#[\da-f]{6}$/i.test(backgroundColor ?? '') ? backgroundColor : '#18181a';
  if (contrast(text, background) >= 4.5) return text;
  const neutral = contrast('#f8fafc', background) >= contrast('#242428', background)
    ? '#f8fafc' : '#242428';
  if (contrast(neutral, background) >= 4.5) return neutral;
  // Midtone surfaces sometimes need pure black or white to reach 4.5:1.
  return contrast('#ffffff', background) >= contrast('#000000', background)
    ? '#ffffff' : '#000000';
}

/** A coherent palette with readable secondary text and controls on any solid fill. */
export function readableSurfacePalette(backgroundColor, {
  textColor = '#f8fafc',
  controlBackgroundColor = backgroundColor
} = {}) {
  backgroundColor = /^#[\da-f]{6}$/i.test(backgroundColor ?? '') ? backgroundColor : '#18181a';
  controlBackgroundColor = /^#[\da-f]{6}$/i.test(controlBackgroundColor ?? '')
    ? controlBackgroundColor : backgroundColor;
  const text = readableSurfaceTextColor(textColor, backgroundColor);
  const controlText = readableSurfaceTextColor(text, controlBackgroundColor);
  // Move button fills away from their foreground so hover never reduces contrast.
  const shade = contrast(controlText, '#ffffff') > contrast(controlText, '#000000')
    ? '#ffffff' : '#000000';
  const controlBackground = mix(controlBackgroundColor, shade, .06);
  return {
    text,
    muted: mixAtContrast(text, backgroundColor, 4.5),
    controlText,
    controlBackground,
    controlHover: mix(controlBackgroundColor, shade, .12),
    controlActive: mix(controlBackgroundColor, shade, .18),
    controlBorder: mixAtContrast(controlText, controlBackground, 3.1)
  };
}

/** Keeps an accent's hue and lightens/darkens it only when its border would disappear. */
export function readableSurfaceBorderColor(color, backgroundColor) {
  const background = /^#[\da-f]{6}$/i.test(backgroundColor ?? '') ? backgroundColor : '#18181a';
  const accent = /^#[\da-f]{6}$/i.test(color ?? '') ? color : '#38bdf8';
  return mixAtContrast(readableSurfaceTextColor('#f8fafc', background), background, 3.1, accent);
}

function mixAtContrast(foreground, background, minimum, start = background) {
  for (let step = 0; step <= 100; step++) {
    const candidate = mix(start, foreground, step / 100);
    if (contrast(candidate, background) >= minimum) return candidate;
  }
  return foreground;
}

function mix(from, to, amount) {
  const start = hexChannels(from);
  return `#${hexChannels(to).map((channel, index) => (
    Math.round(start[index] + (channel - start[index]) * amount).toString(16).padStart(2, '0')
  )).join('')}`;
}

function contrast(foreground, background) {
  const first = luminance(hexChannels(foreground));
  const second = luminance(hexChannels(background));
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

function hexChannels(color) {
  return color.slice(1).match(/../g).map(channel => parseInt(channel, 16));
}

function luminance(channels) {
  return channels.map(channel => {
    const value = channel / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}
