/** Compare Chrome's numeric versions, including an optional fourth component. */
export function compareVersions(left, right) {
  const parse = value => typeof value === 'string' && /^\d+(?:\.\d+){0,3}$/.test(value)
    ? value.split('.').map(Number) : null;
  const a = parse(left);
  const b = parse(right);
  if (!a || !b || [...a, ...b].some(part => part > 65535)) return null;
  for (let index = 0; index < 4; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
