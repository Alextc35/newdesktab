export const RECYCLE_BIN_RETENTION_OPTIONS_DAYS = Object.freeze([1, 7, 14, 28, 0]);
export const DEFAULT_RECYCLE_BIN_RETENTION_DAYS = 28;
export const RECYCLE_BIN_DAY_MS = 24 * 60 * 60 * 1000;

/** Normalizes the recycle bin retention setting; zero means never. */
export function normalizeRecycleBinRetentionDays(value) {
  const days = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  return RECYCLE_BIN_RETENTION_OPTIONS_DAYS.includes(days)
    ? days
    : DEFAULT_RECYCLE_BIN_RETENTION_DAYS;
}

/** Returns the configured retention duration; Infinity means never expire. */
export function getRecycleBinRetentionMs(value) {
  const days = normalizeRecycleBinRetentionDays(value);
  return days === 0 ? Infinity : days * RECYCLE_BIN_DAY_MS;
}
