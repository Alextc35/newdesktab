# Original New DeskTab promotional audio

The music and sound effects in this directory were composed for this project by
procedural synthesis in `promo-video/scripts/generate-audio.mjs`. They contain no
third-party recordings, sample packs, downloaded music, copied melodies or voice.
Every sound is generated mathematically from oscillators and deterministic noise.

The composition **Your browser. Your space.** uses a 96 BPM original arrangement
of warm pads, a glass-like arpeggio, a sparse melody, synthesized bass and drums.
`score.wav` is the 56-second main arrangement; `score-vertical.wav` is a separately
arranged 26-second edit with its own ending. The score includes gentle transitional
swells at the scene changes. `click.wav`, `reveal.wav` and `whoosh.wav` are optional
isolated effects for editable timing.

These original assets and the generator are supplied under the repository's MIT
License. They may be used, modified and distributed with New DeskTab promotional
material, including commercial product promotion. No music-library subscription,
external audio attribution or additional license is required. The root `LICENSE`
continues to govern the project. No claim is made about the copyrightability of
automatically generated sound in any particular jurisdiction.

## Reproduce

From `promo-video`:

```powershell
node scripts/generate-audio.mjs
```

The generator writes 48 kHz stereo 16-bit PCM WAV files and an `audio-manifest.json`
with duration, peak and RMS measurements. Adjustable tempo/sample-rate parameters:

```powershell
node scripts/generate-audio.mjs --tempo=96 --sample-rate=48000
```

Changing tempo affects the music's bar alignment; the export durations remain
56 and 26 seconds. Revalidate transition timing after changing tempo.

## Validation of the delivered WAV files

FFmpeg `ebur128=peak=true` measured the main score at **−17.4 LUFS integrated**,
**3.1 LU loudness range** and **−3.7 dBFS true peak**. The vertical arrangement
measured **−17.0 LUFS**, **3.0 LU** and **−3.7 dBFS**. Both files decode correctly,
contain two channels at 48 kHz, and have exact durations of 56.000 and 26.000
seconds. Their final samples fade to silence. These levels leave headroom for the
optional effects and AAC encoding.

```powershell
ffmpeg -hide_banner -i public/audio/score.wav -af ebur128=peak=true -f null NUL
ffprobe -v error -show_entries format=duration:stream=codec_name,sample_rate,channels -of json public/audio/score.wav
```
