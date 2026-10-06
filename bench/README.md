# Bench Zero — device limits lab

A dependency-free benchmark built on WebGL2 — the browser's standard
interface to the graphics chip — that measures what your device can actually
push, before the engine exists. Runs on macOS (Safari/Chrome) and iOS Safari
from the same files.

## Why it exists

The engine project's driving questions (see `../ROADMAP.md`) are about device
limits: vertex throughput, fill rate, and thermal throttling. Bench Zero makes
those numbers visceral on the two devices at hand — a Mac and an iPhone — and
later serves as the baseline for the native C++ port (M1+): the gap between
Safari and native is the measured cost of the browser stack.

## The three tests

1. **Triangle sweep** — 10k → 8M triangles. Total triangle *area* is held
   constant as count grows, so fill cost stays flat and the sweep isolates
   vertex/geometry throughput. Each tier reports FPS, 1% low, frame-time
   percentiles, and MT/s (million triangles per second). Summary: the largest
   tier sustaining p95 frame time ≤ 16.7 ms ("60 fps-capable") and ≤ 33.4 ms
   ("30 fps-capable").
2. **Fill-rate sweep** — 1 → 64 fullscreen blended layers. This is usually the
   real wall on mobile tile-based GPUs (Apple/Adreno/Mali), not triangles.
   Reported in GPix/s (billion blended pixels per second).
3. **Sustained load** — a fixed workload for 1–5 minutes, frames per second
   (FPS) sampled every 2 s. Fan speed / temperature are not exposed to macOS userland or iOS
   Safari, so thermal throttling is measured by its observable effect: the
   FPS decay curve. On a Mac you can cross-check with iStat Menus or
   `sudo powermetrics`.

## Running

From the repo root:

```sh
python3 -m http.server 8000
```

- **Mac:** open <http://localhost:8000/bench/>
- **iPhone (same Wi-Fi):** open <http://<your-mac-LAN-IP>:8000/bench/>
  (find the IP with `ipconfig getifaddr en0`)

No build step, no dependencies; `file://` also works on the Mac.

## Comparing devices

Run the tests on each device, tap **Copy JSON**, and paste the two blobs into
the Compare section of either page. JSON files can also be downloaded and
committed under `bench/results/` for the record (name them by device, e.g.
`iphone15pro.json`, `macbookair-m3.json`).

## Caveats

- **Keep the tab foreground** for the whole run — iOS suspends
  `requestAnimationFrame` (the browser's once-per-frame callback) in
  background tabs. A screen wake lock is requested where supported.
- **ProMotion iPhones** (120 Hz) and macOS displays: FPS numbers are
  refresh-synced; frame-time percentiles are the ground truth, so the sweep
  gates on p95 ms, not raw FPS.
- **Low Power Mode** (iOS) throttles to ~60 Hz and reduces peak GPU clocks —
  run with it off for honest numbers.
- iOS Safari reports the GPU generically as "Apple GPU"; the exact SoC is
  whatever device you're holding.
- Results vary run-to-run with thermals; the sustained-load decay is the
  honest comparison metric across devices.
