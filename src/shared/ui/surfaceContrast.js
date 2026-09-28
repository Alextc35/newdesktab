/**
 * Derives a readable shared display color for light interface canvases. Persisted
 * bookmark/folder colors still control wallpaper, image and dark surfaces.
 */
export function lightSurfaceTextColor(color) {
  if (!/^#[\da-f]{6}$/i.test(color ?? '')) return '#242428';
  const rgb = color.slice(1).match(/../g).map(channel => parseInt(channel, 16));
  const luminance = channels => channels
    .map(channel => {
      const value = channel / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);

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
