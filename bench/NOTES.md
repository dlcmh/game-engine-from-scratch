# Bench Zero — how the machinery works

Notes on the principal functions and algorithms in `bench.js`. Read this
before the source. We assume no prior knowledge of graphics.

## The render loop — `requestAnimationFrame` and frame time

The browser calls our function once for every refresh of the display; sixty
calls a second on a sixty-hertz screen. We ask the browser for the time of
each call (`performance.now()` resolution) and subtract the previous time.
That difference, `dt`, is the *frame period*: how long the display waited for
us. A game engine is, at bottom, a promise to produce a frame every period.
When the GPU cannot finish in time, the period lengthens — and that is the
number we measure. Frames per second is merely the reciprocal of it; we
therefore treat milliseconds as the ground truth.

## Instancing — drawing millions of triangles from three bytes of data

`drawArraysInstanced(gl.TRIANGLES, 0, 3, count)` says: draw one triangle, but
do it `count` times. The vertex shader consults `gl_InstanceID` to know which
repetition it is working on. This is *instancing*: one command, many copies.

The clever part is what we do *not* store. A conventional mesh holds millions
of vertices in memory. We hold three. Every triangle's position, rotation,
size, and colour are computed *in the vertex shader* from its instance number.
The GPU, which is a device for doing the same arithmetic many times at once,
prefers this to reading a large buffer from memory. It also permits us to
request eight million triangles on a telephone without exhausting memory.

## The hash function — order from a seed

    float hash(float n){ return fract(sin(n)*43758.5453123); }

We need pseudo-random positions for each triangle, but shipping a table of
random numbers defeats the elegance above. Instead we use a venerable trick of
the shader-programming trade: multiply by a large irrational-looking number,
take the sine, and keep the fractional part. Small changes to the input scatter
the output widely. It is not cryptography; it is a well-behaved scramble, and
it costs one instruction.

A caution we encoded in the code: floating-point `sin` on a GPU loses all
meaning for large arguments (a million-odd radians). We therefore wrap the
instance number with `mod(..., 4096.0)` before hashing. The comment in the
shader records this; notes like this one record *why*.

## The constant-area trick — measuring one thing at a time

If ten million triangles each covered the screen, the test would measure
*fill rate* (pixels drawn) rather than geometry throughput. So we hold the
total covered area constant: as the count grows by a factor of *k*, each
triangle's side shrinks by √*k*. Area scales with side squared, so coverage
never changes and only the vertex load increases. A benchmark's first duty is
to change one variable at a time.

## Percentiles — why the mean lies

`computeStats` sorts the frame times and reports the 50th, 95th, and 99th
percentile. The mean conceals a single 200 ms stutter inside forty tidy 16 ms
frames; the 95th percentile confesses it immediately. Two derived figures
matter: `p95 ≤ 16.7 ms` means the display *never waited long* — a genuine
"60 fps" experience — and the "1% low" is the reciprocal of the 99th
percentile, the worst sustained moment a player would feel.

We also discard any frame period above 200 ms: such outliers come from the
tab losing focus, not from the GPU. A benchmark must distinguish the machine
from the interruptions.

## Blending — the fill-rate test

`drawArraysInstanced` again, now drawing a fullscreen quad once per *layer*.
Each layer is drawn with alpha blending (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`):
the new colour is mixed with what is already on the screen. Sixteen layers
means every pixel is shaded sixteen times. Mobile GPUs are usually defeated
by this arithmetic long before they run out of vertices — they are *fill
bound* — which is why a triangle benchmark alone would flatter an iPhone.

The fixed alpha of 0.06 keeps every layer contributing; a fully opaque layer
would let the GPU discard work it believes invisible, flattering the number.

## The sustained test — inferring heat from behaviour

Neither macOS nor iOS will tell a web page the temperature of its silicon.
But a hot chip clocks itself down, and a slower chip takes longer per frame.
So we run an unchanging workload for minutes and sample the frame period
every two seconds. A falling curve is thermal throttling, wearing its only
visible face. This is inference, not telemetry; but it is honest inference,
and it is precisely the mechanism behind a laptop's roaring fans.

## Resolution scaling — a preview of Milestone 5

The canvas has two sizes: its size on the page (CSS pixels) and the size of
the memory it draws into (the *backing store*, CSS pixels multiplied by the
device pixel ratio). The resolution selector scales only the backing store.
Fewer pixels cost less fill; the browser then stretches the result to the
same rectangle on screen. This is dynamic resolution scaling in embryo — the
subject of Milestone 5 — and you may observe it directly: drop to 50% and
watch the fill-rate figures rise.

## The wake lock — keeping the stage lit

`navigator.wakeLock` asks the operating system not to dim the screen during a
measurement. If iOS suspends the tab, `requestAnimationFrame` falls silent and
our timings become fiction. The code re-acquires the lock when the page
returns to view, and the discarded-frame rule above cleans up any frame the
suspension corrupted.

---

*Conventions for future authors: notes accompany every module with
non-trivial algorithms; see `AGENTS.md` under "Teaching notes". One short
paragraph per concept; explain the why.*
