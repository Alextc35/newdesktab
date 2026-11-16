# Local-video backup measurements

[Documentation index](../README.md) · [Development and diagnostics](../development/DEVELOPMENT.md) · [Architecture](../architecture/ARCHITECTURE.md)

These are historical measurements from 8–10 October 2026 UTC on Windows with
Chromium 151. Each size used a new persistent profile, matching the storage
model of an ordinary installation. The original JSON baseline is in
[backup-media.json](backup-media.json); ZIP measurements are in
[backup-media-zip.json](backup-media-zip.json) and the
[two-video result](backup-media-zip-2-videos.json).

## Repeat the ZIP measurements

The current benchmark exercises the ZIP implementation. Use separate output
paths to preserve the recorded results:

```sh
node scripts/benchmark-backups.mjs --output=dist/backup-media-new.json
node scripts/benchmark-backups.mjs --sizes=200 --output=dist/backup-media-200-new.json
node scripts/benchmark-backups.mjs --sizes=200 --count=2 --output=dist/backup-media-two-new.json
```

The older JSON-video export is retained here as historical comparison data, not
as a mode selected by the current benchmark.

## Previous JSON format

| Video | Export | Import | Generated JSON | Largest observed JS heap sample |
| --- | --- | --- | --- | --- |
| 10 MiB | 0.11 s | 0.12 s | 13.34 MiB | 71.2 MiB |
| 50 MiB | 0.57 s | 0.55 s | 66.67 MiB | 271.1 MiB |
| 200 MiB | 2.10 s | 2.64 s | 266.67 MiB | 1,070.9 MiB |

## ZIP format

| Video | Export | Import | Generated ZIP | Largest observed JS heap sample |
| --- | --- | --- | --- | --- |
| 10 MiB | 0.07 s | 0.10 s | 10.00 MiB | 45.3 MiB |
| 50 MiB | 0.42 s | 0.53 s | 50.00 MiB | 79.7 MiB |
| 200 MiB | 1.12 s | 1.79 s | 200.00 MiB | 79.5 MiB |
| 2 × 200 MiB | 2.09 s | 3.20 s | 400.00 MiB | 80.0 MiB |

For the 200 MiB sample, observed JavaScript heap usage fell from 1,070.9 to
79.5 MiB. ZIP adds a few KiB of metadata and avoids the one-third size increase
from base64. With two files, the largest observed heap sample remained similar
while the final archive grew.

The measurements use the real export/import actions and restore files to
IndexedDB. Local data is deleted before import. Verification checks each
restored file's size, local URL availability, and first and last bytes. Test
data includes Unicode text to account for its effect on JSON representation
in memory.

The video payload is synthetic data with a WebM MIME type: the test measures
storage and transport, not playback or decoding. Disk download is intercepted
so timing covers creation of the download Blob. The JSON baseline samples heap
usage at `JSON.stringify`, `JSON.parse` and CDP checkpoints. ZIP measurements
also sample every 10 ms and at Blob creation. Sampling frequencies differ;
neither method measures whole-process RAM or guarantees capturing the absolute
peak. These are local results from one run, not limits or performance promises
for other machines.

## Format decision

Backups containing local videos use ZIP. `backup.json` contains configuration,
optimized images and metadata; videos are separate binary files using ZIP STORE
without recompression. Reads and writes stream sequentially in 256 KiB chunks.
The browser manages the final Blob; application code avoids representing whole
videos as JavaScript strings or arrays.

All three sizes and the two-video case completed export and restoration in
persistent profiles. Backups without local videos remain JSON, and older JSON
backups, including embedded base64 videos, remain importable. Images retain
their existing optimized representation. These samples do not validate every
possible library size or replace whole-process memory measurements.

An initial exploratory run in an ephemeral Chromium context could not read a
restored 200 MiB Blob even though its IndexedDB transaction completed. The
recorded measurements use persistent profiles and verify file reads. The result
does not establish support for that size in incognito sessions.
