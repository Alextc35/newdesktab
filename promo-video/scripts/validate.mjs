import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'output');
const flags = new Set(process.argv.slice(2));
const definitions = [
  {
    id: 'landscape', file: 'newdesktab-promo-1080p.mp4',
    width: 1920, height: 1080, duration: 56, fps: 60,
    times: [2, 6, 10, 15, 19, 23, 28, 33, 39, 44, 49, 53.5],
    posterTime: 10, sheetColumns: 4, sheetWidth: 480,
  },
  {
    id: 'vertical', file: 'newdesktab-promo-vertical.mp4',
    width: 1080, height: 1920, duration: 26, fps: 60,
    times: [2, 6, 10, 14, 18, 22, 24.5],
    posterTime: 6, sheetColumns: 4, sheetWidth: 270,
  },
].filter((item) => !flags.has('--main-only') || item.id === 'landscape')
  .filter((item) => !flags.has('--vertical-only') || item.id === 'vertical');

mkdirSync(output, { recursive: true });

function command(executable, args, label) {
  const result = spawnSync(executable, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${result.error?.message || result.stderr?.slice(-4000) || `exit ${result.status}`}`);
  }
  return result;
}

function check(condition, message, problems) {
  if (!condition) problems.push(message);
}

function rational(value) {
  if (!value) return NaN;
  const [numerator, denominator = 1] = String(value).split('/').map(Number);
  return numerator / denominator;
}

function lastNumber(text, expression) {
  const matches = [...text.matchAll(expression)];
  return matches.length ? Number(matches.at(-1)[1]) : null;
}

function inspectAudioAndDecode(file, durationSeconds) {
  const decoded = command('ffmpeg', [
    '-hide_banner', '-nostats', '-v', 'info', '-i', file,
    '-map', '0:v:0', '-map', '0:a:0',
    '-af', 'volumedetect,silencedetect=noise=-55dB:d=0.2,ebur128=peak=true',
    '-f', 'null', '-',
  ], 'Complete video/audio decode');
  const log = decoded.stderr;
  const silenceEvents = log.split(/\r?\n/).filter((line) => /silence_(?:start|end):/.test(line))
    .map((line) => line.replace(/^.*?\]\s*/, '').trim());
  const silenceIntervals = [];
  let silenceStart = null;
  for (const event of silenceEvents) {
    const start = event.match(/silence_start:\s*(-?[\d.]+)/);
    if (start) silenceStart = Math.max(0, Number(start[1]));
    const end = event.match(/silence_end:\s*(-?[\d.]+)/);
    if (end && silenceStart !== null) {
      const endSeconds = Math.min(durationSeconds, Number(end[1]));
      silenceIntervals.push({ startSeconds: silenceStart, endSeconds, durationSeconds: endSeconds - silenceStart });
      silenceStart = null;
    }
  }
  if (silenceStart !== null) {
    silenceIntervals.push({ startSeconds: silenceStart, endSeconds: durationSeconds, durationSeconds: durationSeconds - silenceStart });
  }
  const trailingSilence = silenceIntervals.find((interval) => interval.endSeconds >= durationSeconds - 0.05);
  return {
    decodeErrors: log.split(/\r?\n/).filter((line) => /error|corrupt|invalid data/i.test(line)),
    meanVolumeDb: lastNumber(log, /mean_volume:\s*(-?[\d.]+) dB/g),
    samplePeakDb: lastNumber(log, /max_volume:\s*(-?[\d.]+) dB/g),
    integratedLoudnessLufs: lastNumber(log, /\bI:\s*(-?[\d.]+) LUFS/g),
    loudnessRangeLu: lastNumber(log, /\bLRA:\s*(-?[\d.]+) LU/g),
    truePeakDbfs: lastNumber(log, /Peak:\s*(-?[\d.]+) dBFS/g),
    silenceEvents,
    silenceIntervals,
    lastAudibleTimeSeconds: trailingSilence?.startSeconds ?? durationSeconds,
    trailingSilenceSeconds: trailingSilence?.durationSeconds ?? 0,
  };
}

function extractVisuals(file, definition) {
  const directory = join(output, 'qa', definition.id);
  mkdirSync(directory, { recursive: true });
  const frames = definition.times.map((time, index) => {
    const frame = join(directory, `frame-${String(index + 1).padStart(2, '0')}-${time.toFixed(1)}s.jpg`);
    command('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(time), '-i', file,
      '-frames:v', '1', '-q:v', '2', '-update', '1', frame,
    ], `Frame at ${time}s`);
    return { timeSeconds: time, file: frame };
  });
  const poster = join(output, definition.id === 'landscape' ? 'newdesktab-promo-poster.jpg' : 'newdesktab-promo-vertical-poster.jpg');
  command('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(definition.posterTime), '-i', file,
    '-frames:v', '1', '-q:v', '2', '-update', '1', poster,
  ], 'Poster');

  // The concatenated image list avoids decoding the full MP4 for a second time.
  const list = join(directory, 'contact-frames.ffconcat');
  writeFileSync(list, 'ffconcat version 1.0\n' + frames.map(({ file: frame }) => (
    `file '${frame.replaceAll('\\', '/').replaceAll("'", "'\\''")}'\nduration 1\n`
  )).join(''));
  const contactSheet = join(output, `contact-sheet-${definition.id}.jpg`);
  const rows = Math.ceil(frames.length / definition.sheetColumns);
  command('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-safe', '0', '-f', 'concat', '-i', list,
    '-vf', `fps=1,scale=${definition.sheetWidth}:-1,tile=${definition.sheetColumns}x${rows}:nb_frames=${frames.length}:padding=8:margin=8:color=0x080d18`,
    '-frames:v', '1', '-q:v', '2', '-update', '1', contactSheet,
  ], 'Contact sheet');
  return { frames, poster, contactSheet };
}

const report = {
  generatedAt: new Date().toISOString(),
  purpose: 'Technical export checks and representative frames for human visual review.',
  visualReview: 'Inspect the contact sheets and full-resolution frames. Automated checks do not establish design quality or claim fidelity.',
  exports: [],
};

for (const definition of definitions) {
  const file = join(output, definition.file);
  if (!existsSync(file)) {
    report.exports.push({ id: definition.id, file, status: 'missing', problems: ['Export has not been rendered.'] });
    console.log(`[PENDING] ${definition.file} has not been rendered.`);
    continue;
  }
  try {
    const probe = JSON.parse(command('ffprobe', [
      '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
    ], 'ffprobe').stdout);
    const video = probe.streams.find((stream) => stream.codec_type === 'video');
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
    const problems = [];
    check(Boolean(video), 'Video stream is missing.', problems);
    check(Boolean(audio), 'Audio stream is missing.', problems);
    check(video?.codec_name === 'h264', `Expected H.264, received ${video?.codec_name}.`, problems);
    check(video?.width === definition.width && video?.height === definition.height,
      `Expected ${definition.width}×${definition.height}, received ${video?.width}×${video?.height}.`, problems);
    check(Math.abs(rational(video?.avg_frame_rate) - definition.fps) < 0.001,
      `Expected ${definition.fps} FPS, received ${video?.avg_frame_rate}.`, problems);
    check(video?.pix_fmt === 'yuv420p', `Expected widely compatible yuv420p, received ${video?.pix_fmt}.`, problems);
    check(Math.abs(Number(video?.duration ?? probe.format.duration) - definition.duration) < 0.06,
      `Expected ${definition.duration}s video, received ${video?.duration ?? probe.format.duration}s.`, problems);
    check(audio?.codec_name === 'aac', `Expected AAC audio, received ${audio?.codec_name}.`, problems);
    check(audio?.channels === 2, `Expected stereo audio, received ${audio?.channels} channel(s).`, problems);
    if (audio && video) {
      check(Math.abs(Number(audio.duration) - Number(video.duration)) < 0.12,
        `Audio/video duration difference exceeds 120 ms (${audio.duration}s vs ${video.duration}s).`, problems);
      check(Math.abs(Number(audio.start_time ?? 0) - Number(video.start_time ?? 0)) < 0.05,
        'Audio/video stream start difference exceeds 50 ms.', problems);
    }
    const audioAnalysis = flags.has('--frames-only') ? null : inspectAudioAndDecode(file, definition.duration);
    if (audioAnalysis) {
      check(audioAnalysis.decodeErrors.length === 0, 'The decoder reported invalid or corrupt data.', problems);
      check(audioAnalysis.samplePeakDb !== null && audioAnalysis.samplePeakDb < -0.1,
        `Audio lacks safe sample headroom (${audioAnalysis.samplePeakDb} dBFS).`, problems);
      check(audioAnalysis.integratedLoudnessLufs !== null && audioAnalysis.integratedLoudnessLufs > -30,
        `Soundtrack is absent or unusually quiet (${audioAnalysis.integratedLoudnessLufs} LUFS).`, problems);
      check(audioAnalysis.lastAudibleTimeSeconds >= definition.duration - 2,
        `Audio stops at ${audioAnalysis.lastAudibleTimeSeconds.toFixed(3)}s, more than 2s before the picture ends.`, problems);
      const longInteriorSilence = audioAnalysis.silenceIntervals.filter((interval) => (
        interval.durationSeconds > 2 && interval.endSeconds < definition.duration - 0.05
      ));
      check(longInteriorSilence.length === 0,
        `Unexpected silence longer than 2s: ${longInteriorSilence.map((interval) => `${interval.startSeconds.toFixed(3)}–${interval.endSeconds.toFixed(3)}s`).join(', ')}.`, problems);
    }
    const visuals = flags.has('--no-frames') ? null : extractVisuals(file, definition);
    const item = {
      id: definition.id, file, status: problems.length ? 'failed' : 'passed',
      bytes: statSync(file).size,
      durationSeconds: Number(video?.duration ?? probe.format.duration),
      video: video ? {
        codec: video.codec_name, width: video.width, height: video.height,
        framesPerSecond: rational(video.avg_frame_rate), pixelFormat: video.pix_fmt,
        frames: Number(video.nb_frames), colorSpace: video.color_space,
      } : null,
      audio: audio ? {
        codec: audio.codec_name, channels: audio.channels, sampleRate: Number(audio.sample_rate),
        durationSeconds: Number(audio.duration), ...audioAnalysis,
      } : null,
      visuals, problems,
    };
    report.exports.push(item);
    console.log(`[${item.status.toUpperCase()}] ${definition.file}: ${video.width}×${video.height}, ${item.video.framesPerSecond} FPS, ${item.durationSeconds}s, ${(item.bytes / 1048576).toFixed(1)} MiB, ${item.audio?.integratedLoudnessLufs ?? 'unmeasured'} LUFS.`);
    for (const problem of problems) console.log(`  ${problem}`);
  } catch (error) {
    report.exports.push({ id: definition.id, file, status: 'failed', problems: [error.message] });
    console.error(`[FAILED] ${definition.file}: ${error.message}`);
  }
}

report.status = report.exports.every((item) => item.status === 'passed') ? 'passed'
  : report.exports.some((item) => item.status === 'failed') ? 'failed' : 'pending';
const reportFile = join(output, 'validation-report.json');
// Preserve validation of an export omitted by --main-only/--vertical-only.
if (existsSync(reportFile) && definitions.length < 2) {
  try {
    const previous = JSON.parse(readFileSync(reportFile, 'utf8'));
    report.exports.push(...previous.exports.filter((item) => !report.exports.some((current) => current.id === item.id)));
    report.status = report.exports.every((item) => item.status === 'passed') ? 'passed'
      : report.exports.some((item) => item.status === 'failed') ? 'failed' : 'pending';
  } catch { /* A malformed earlier report should never prevent a new one. */ }
}
writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(`Report: ${reportFile}`);
process.exitCode = report.status === 'passed' ? 0 : 1;
