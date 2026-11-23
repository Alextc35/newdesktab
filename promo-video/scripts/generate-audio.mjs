/**
 * New DeskTab / Your browser. Your space.
 * Original procedural score. No recordings, downloaded audio or sample packs.
 * Run: node scripts/generate-audio.mjs
 * Optional: node scripts/generate-audio.mjs --sample-rate=48000 --tempo=96
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).filter(v => v.startsWith('--')).map(v => v.slice(2).split('=')));
const RATE = Number(args['sample-rate'] ?? 48000);
const BPM = Number(args.tempo ?? 96);
if (!Number.isFinite(RATE) || RATE < 8000 || RATE > 96000) throw new Error('Sample rate must be 8000–96000.');
if (!Number.isFinite(BPM) || BPM < 60 || BPM > 160) throw new Error('Tempo must be 60–160 BPM.');
const OUT = fileURLToPath(new URL('../public/audio/', import.meta.url));
await mkdir(OUT, { recursive: true });
const TAU = Math.PI * 2;
const beat = 60 / BPM;
const bar = beat * 4;
const freq = midi => 440 * 2 ** ((midi - 69) / 12);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const channels = duration => [new Float32Array(Math.ceil(duration * RATE)), new Float32Array(Math.ceil(duration * RATE))];

// Independent deterministic noise generators keep every re-render identical.
function noise(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2147483648 - 1; };
}
function add(buffer, time, duration, sample, amplitude = 1, pan = 0) {
  const start = Math.round(time * RATE);
  const count = Math.min(Math.round(duration * RATE), buffer[0].length - start);
  const left = Math.sqrt((1 - pan) / 2) * amplitude;
  const right = Math.sqrt((1 + pan) / 2) * amplitude;
  for (let n = Math.max(0, -start); n < count; n++) {
    const value = sample(n / RATE, n);
    buffer[0][start + n] += value * left;
    buffer[1][start + n] += value * right;
  }
}
function bell(buffer, time, midi, level = .08, pan = 0, duration = 2.2) {
  const f = freq(midi);
  add(buffer, time, duration, t => {
    const attack = 1 - Math.exp(-t * 650);
    const body = Math.sin(TAU * f * t + .8 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 9));
    const glass = .12 * Math.sin(TAU * f * 3 * t) * Math.exp(-t * 5);
    return attack * Math.exp(-t * 3.3) * (body + glass) * smooth((duration - t) / .3);
  }, level, pan);
}
function pad(buffer, time, notes, level = .024, duration = bar * 1.95) {
  notes.forEach((midi, voice) => {
    const f = freq(midi);
    add(buffer, time, duration, t => {
      const envelope = smooth(t / .48) * smooth((duration - t) / 1.4);
      const a = Math.sin(TAU * f * .9982 * t);
      const b = Math.sin(TAU * f * 1.0016 * t + .13);
      const harmonic = .11 * Math.sin(TAU * f * 2 * t);
      return (a + b + harmonic) * .5 * envelope * (.92 + .08 * Math.sin(t * .9 + voice));
    }, level, (voice / (notes.length - 1) - .5) * 1.35);
  });
}
function bass(buffer, time, midi, duration = beat * .78, level = .1) {
  const f = freq(midi);
  add(buffer, time, duration, t => {
    const env = smooth(t / .015) * smooth((duration - t) / .13);
    return (Math.sin(TAU * f * t) + .16 * Math.sin(TAU * f * 2 * t)) * env;
  }, level);
}
function kick(buffer, time, level = .24) {
  add(buffer, time, .4, t => {
    const phase = TAU * (44 * t + (98 - 44) * .026 * (1 - Math.exp(-t / .026)));
    return Math.sin(phase) * Math.exp(-t * 15) * smooth(t / .002) * smooth((.4 - t) / .04);
  }, level);
}
function snare(buffer, time, level = .042) {
  const rand = noise(Math.round(time * 1000) + 713);
  let low = 0;
  add(buffer, time, .21, t => {
    const n = rand(); low += .15 * (n - low);
    return (n - low) * Math.exp(-t * 26) * smooth(t / .002) * .8
      + Math.sin(TAU * 185 * t) * Math.exp(-t * 38) * .2;
  }, level, .08);
}
function hat(buffer, time, level = .018, pan = 0) {
  const rand = noise(37 + Math.round(time * 1600));
  let low = 0;
  add(buffer, time, .09, t => {
    const n = rand(); low += .32 * (n - low);
    return (n - low) * Math.exp(-t * 65) * smooth(t / .001) * smooth((.09 - t) / .015);
  }, level, pan);
}
function sweep(buffer, time, duration = .85, level = .035, direction = 1) {
  const rand = noise(6281 + Math.round(time * 1000));
  let a = 0, b = 0;
  add(buffer, time, duration, t => {
    const p = t / duration;
    const cutoff = .02 + .22 * (direction > 0 ? p : 1 - p);
    const n = rand(); a += cutoff * (n - a); b += .009 * (n - b);
    return (a - b) * Math.sin(Math.PI * p) ** 2;
  }, level, -.12);
}
function delays(buffer, dry = .16) {
  // A small stereo cross delay gives space without making the mix muddy.
  const taps = [[beat * .75, dry], [beat * 1.5, dry * .48], [beat * 2.25, dry * .23]];
  const original = buffer.map(c => c.slice());
  for (const [seconds, amount] of taps) {
    const offset = Math.round(seconds * RATE);
    for (let c = 0; c < 2; c++) {
      let filtered = 0;
      for (let i = offset; i < buffer[c].length; i++) {
        filtered += .18 * (original[1 - c][i - offset] - filtered);
        buffer[c][i] += filtered * amount;
      }
    }
  }
}
function finish(buffer, { fadeIn = .09, fadeOut = 2.0, peak = .60 } = {}) {
  let max = 0;
  for (const channel of buffer) for (const value of channel) max = Math.max(max, Math.abs(value));
  const gain = peak / Math.max(max, .00001);
  let sums = [0, 0], peakOut = 0;
  for (let i = 0; i < buffer[0].length; i++) {
    const t = i / RATE;
    const duration = buffer[0].length / RATE;
    const fade = smooth(t / fadeIn) * smooth((duration - t) / fadeOut);
    for (let c = 0; c < 2; c++) {
      const value = buffer[c][i] * gain * fade;
      buffer[c][i] = value;
      sums[c] += value * value;
      peakOut = Math.max(peakOut, Math.abs(value));
    }
  }
  return { peakDbFS: (20 * Math.log10(peakOut)).toFixed(2), rmsDbFS: (20 * Math.log10(Math.sqrt((sums[0] + sums[1]) / (buffer[0].length * 2)))).toFixed(2) };
}
async function wav(filename, buffer) {
  const length = buffer[0].length;
  const bytes = Buffer.alloc(44 + length * 4);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(RATE, 24); bytes.writeUInt32LE(RATE * 4, 28);
  bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36);
  bytes.writeUInt32LE(length * 4, 40);
  for (let n = 0; n < length; n++) for (let c = 0; c < 2; c++) {
    bytes.writeInt16LE(Math.round(clamp(buffer[c][n], -1, 1) * 32767), 44 + n * 4 + c * 2);
  }
  await writeFile(resolve(OUT, filename), bytes);
}

const chords = [
  { root: 38, notes: [50, 57, 61, 66, 69], arp: [74, 78, 81, 85, 81, 78, 76, 73] }, // Dmaj9
  { root: 35, notes: [47, 54, 57, 61, 66], arp: [71, 74, 78, 81, 78, 74, 73, 69] }, // Bm9
  { root: 31, notes: [43, 50, 54, 59, 62], arp: [71, 74, 78, 81, 78, 74, 69, 66] }, // Gmaj9
  { root: 33, notes: [45, 52, 57, 59, 64], arp: [69, 73, 76, 81, 76, 73, 71, 69] }  // Aadd9
];

function compose(duration, vertical = false) {
  const mix = channels(duration);
  const harmonic = channels(duration);
  const resolveTime = vertical ? 22.5 : 50;
  const introBars = vertical ? 1 : 2;
  const numberBars = Math.ceil(resolveTime / bar);
  for (let b = 0; b < numberBars; b++) {
    const start = b * bar;
    const chord = chords[b % 4];
    const density = b < introBars ? .65 : 1;
    pad(harmonic, start, chord.notes, .024 * density, bar * 1.9);
    for (let n = 0; n < 8; n++) {
      const ghost = n % 2 ? .65 : 1;
      bell(harmonic, start + n * beat / 2, chord.arp[n], .034 * density * ghost,
        Math.sin(n * 1.8 + b) * .58, 1.55);
    }
    // A spare top-line enters only after the product reveal.
    if (b >= introBars && b % 2 === 0) {
      const phrase = [chord.arp[2], chord.arp[1], chord.arp[0], chord.arp[4]];
      phrase.forEach((note, i) => bell(harmonic, start + (i * .75 + .25) * beat,
        note, .045, i % 2 ? .30 : -.25, 2.3));
    }
    if (b >= introBars) {
      for (let n = 0; n < 4; n++) {
        bass(mix, start + n * beat, chord.root + (n === 3 && b % 4 === 3 ? 12 : 0), beat * .7, .09);
        kick(mix, start + n * beat, n % 2 ? .16 : .21);
        if (n === 1 || n === 3) snare(mix, start + n * beat, .040);
        hat(mix, start + n * beat + beat / 2, .024, n % 2 ? -.45 : .45);
        if (b >= introBars + 3) hat(mix, start + n * beat, .009, .20);
      }
    }
  }
  // Resolving Dmaj9: the closing brand lockup has a complete musical ending.
  pad(harmonic, resolveTime, [50, 57, 61, 66, 69, 74], .029, duration - resolveTime);
  [74, 78, 81, 85].forEach((note, i) => bell(harmonic, resolveTime + i * .10, note, .07, (i - 1.5) * .22, 3.8));
  bass(mix, resolveTime, 38, 1.8, .11);
  delays(harmonic, .20);
  for (let c = 0; c < 2; c++) for (let i = 0; i < mix[c].length; i++) mix[c][i] += harmonic[c][i];
  const markers = vertical ? [2.5, 7.5, 12.5, 17.5, 22.5] : [5, 13, 25, 38, 50];
  markers.forEach((marker, i) => {
    sweep(mix, marker - .75, .9, .043, 1);
    bell(mix, marker, i === 4 ? 86 : 81, .055, .25, 1.9);
  });
  return mix;
}

const main = compose(56);
const mainStats = finish(main, { peak: .65, fadeOut: 2.4 });
await wav('score.wav', main);
const vertical = compose(26, true);
const verticalStats = finish(vertical, { peak: .65, fadeOut: 1.5 });
await wav('score-vertical.wav', vertical);

const click = channels(.30);
bell(click, .01, 91, .18, 0, .22);
finish(click, { peak: .18, fadeIn: .002, fadeOut: .07 });
await wav('click.wav', click);
const reveal = channels(2.6);
[74, 78, 81, 86].forEach((note, i) => bell(reveal, .04 + i * .055, note, .11, (i - 1.5) * .3, 2.4));
delays(reveal, .24);
finish(reveal, { peak: .30, fadeIn: .01, fadeOut: .9 });
await wav('reveal.wav', reveal);
const whoosh = channels(.95);
sweep(whoosh, 0, .95, .7, 1);
finish(whoosh, { peak: .24, fadeIn: .01, fadeOut: .12 });
await wav('whoosh.wav', whoosh);
await writeFile(resolve(OUT, 'audio-manifest.json'), JSON.stringify({
  title: 'Your browser. Your space.',
  source: 'Original procedural synthesis, generated by promo-video/scripts/generate-audio.mjs',
  sampleRate: RATE, channels: 2, bitDepth: 16, tempo: BPM,
  harmony: 'Dmaj9 / Bm9 / Gmaj9 / Aadd9, resolved Dmaj9 outro',
  main: { file: 'score.wav', duration: 56, ...mainStats },
  vertical: { file: 'score-vertical.wav', duration: 26, ...verticalStats },
  soundEffects: ['click.wav', 'reveal.wav', 'whoosh.wav'],
  thirdPartyAudio: false
}, null, 2) + '\n');
console.log(JSON.stringify({ generated: ['score.wav', 'score-vertical.wav', 'click.wav', 'reveal.wav', 'whoosh.wav'], mainStats, verticalStats, sampleRate: RATE, BPM }, null, 2));
