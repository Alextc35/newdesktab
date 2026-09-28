const DEFAULT_DEBUG_ENABLED = false;
const PREFIX = '[NewDeskTab Debug]';
const NO_TRACE = Object.freeze({ id: null, mark() {}, end() {} });
const COLORS = { info: '#1d4ed8', success: '#166534', error: '#b91c1c', muted: '#475569' };
const CLOCK_STYLE = 'color:#8492a6;font-weight:normal;';
const TITLE_STYLE = 'color:inherit;font-weight:600;';
const COMMAND_STYLE = 'color:#3b82f6;font-weight:600;';
const DESCRIPTION_STYLE = 'color:inherit;font-weight:normal;';
const STATUS_LABELS = { ok: 'OK', error: 'Error', skipped: 'No changes' };

/** Browser-local wall time for logs; elapsed durations still use performance.now(). */
export function formatDebugTime(timestamp = new Date()) {
  const date = new Date(timestamp);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(value => String(value).padStart(2, '0')).join(':');
}

function heading(label, tone = 'info') {
  return [
    `%c${PREFIX}%c ${formatDebugTime()} %c%s`,
    `background:${COLORS[tone] || COLORS.info};color:#fff;padding:2px 6px;border-radius:4px;font-weight:700;`,
    CLOCK_STYLE,
    TITLE_STYLE,
    label
  ];
}

/** Small, bounded console profiler. Each operation owns its clock and phases. */
export function createDebugger({
  enabled = false,
  now = () => performance.now(),
  output = console,
  limit = 100
} = {}) {
  const records = [];
  let sequence = 0;
  let revision = 0;

  function start(label, details = {}) {
    if (!enabled) return NO_TRACE;
    const startedRevision = revision;
    const id = ++sequence;
    const started = now();
    const startedAt = new Date().toISOString();
    const phases = [];
    let previous = started;
    let finished = false;

    return {
      id,
      mark(phase) {
        if (finished || !enabled || startedRevision !== revision) return;
        const current = now();
        phases.push({ phase, durationMs: round(current - previous) });
        previous = current;
      },
      end({ status = 'ok', ...extra } = {}) {
        if (finished) return;
        finished = true;
        if (!enabled || startedRevision !== revision) return;
        const record = {
          id, label, status, startedAt,
          durationMs: round(now() - started),
          phases,
          details: { ...details, ...extra }
        };
        records.push(structuredClone(record));
        if (records.length > limit) records.shift();
        // Open and close groups together: concurrent async operations cannot nest them.
        const tone = status === 'error' ? 'error' : status === 'ok' ? 'success' : 'muted';
        output.groupCollapsed(...heading(`${label} · ${record.durationMs} ms · ${STATUS_LABELS[status] || status} · #${id}`, tone));
        if (phases.length) output.table(phases.map(({ phase, durationMs }) => (
          { Phase: phase, Duration: `${durationMs} ms` }
        )));
        if (Object.keys(record.details).length) output.table(record.details);
        output.groupEnd();
        return structuredClone(record);
      }
    };
  }

  return {
    get enabled() { return enabled; },
    get revision() { return revision; },
    setEnabled(value) {
      const nextEnabled = Boolean(value);
      if (enabled !== nextEnabled) revision++;
      enabled = nextEnabled;
      return enabled;
    },
    start,
    info(label, details, { force = false, tone = 'info' } = {}) {
      if (!enabled && !force) return;
      if (details === undefined) output.info(...heading(label, tone));
      else output.info(...heading(label, tone), details);
    },
    table(label, rows, { force = false } = {}) {
      if (!enabled && !force) return;
      output.groupCollapsed(...heading(label));
      output.table(rows);
      output.groupEnd();
    },
    guide(label, commands, { force = false, tone = 'info' } = {}) {
      if (!enabled && !force) return;
      output.groupCollapsed(...heading(label, tone));
      for (const { command, description } of commands) {
        output.info('%c%s%c\n  %s', COMMAND_STYLE, command, DESCRIPTION_STYLE, description);
      }
      output.groupEnd();
    },
    history() { return structuredClone(records); },
    clear() {
      const cleared = records.length;
      records.length = 0;
      revision++;
      output.clear();
      return cleared;
    }
  };
}

function round(value) {
  return Math.round(Math.max(0, value) * 100) / 100;
}

export const debug = createDebugger({ enabled: DEFAULT_DEBUG_ENABLED });

/** Describes unlabelled changes without retaining bookmark contents or images. */
export function describeStateChange(partial, previous) {
  const data = partial.data;
  if (!data) return 'Update UI state';
  const groups = data.settings?.bookmarkGroups;
  if (groups && groups.length !== previous.settings.bookmarkGroups.length) {
    return groups.length > previous.settings.bookmarkGroups.length
      ? 'Create workspace' : 'Delete workspace';
  }
  if (data.folders && data.folders.length !== previous.folders.length) {
    return data.folders.length > previous.folders.length ? 'Create folder' : 'Delete folder';
  }
  if (data.bookmarks && data.bookmarks.length !== previous.bookmarks.length) {
    return data.bookmarks.length > previous.bookmarks.length ? 'Add bookmarks' : 'Delete bookmarks';
  }
  if (data.settings) {
    return data.settings.activeBookmarkGroupId !== previous.settings.activeBookmarkGroupId
      ? 'Switch workspace' : 'Save settings';
  }
  return data.folders ? 'Update folders / grid' : 'Update bookmarks / grid';
}
